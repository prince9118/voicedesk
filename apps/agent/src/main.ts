import { fileURLToPath } from "node:url";
import { type JobContext, ServerOptions, cli, defineAgent, inference, log, voice } from "@livekit/agents";
import { CallStats } from "./call-summary.js";
import { config } from "./config.js";
import { createSupportAgent } from "./support-agent.js";
import { VoiceDeskApi } from "./voicedesk-api.js";

// Models run through LiveKit Inference: billed to the LiveKit project's credits, so the agent needs
// no separate STT/LLM/TTS provider accounts or keys. Chosen for latency and cost (see README notes
// in the milestone): STT ~$0.0048/min, LLM $0.40/$1.60 per 1M tokens, TTS $30 per 1M characters.
const STT_MODEL = "deepgram/nova-3:en";
const LLM_MODEL = "openai/gpt-4.1-mini"; // fast, not a reasoning model, good at tool calling (Milestone 7)
const TTS_MODEL = "deepgram/aura-2";

// entry() runs once per conversation, in its own child process: one crashing call cannot take
// down the others. LiveKit calls it when a room created with our agent name in its token starts.
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log().child({ room: ctx.job.room?.name });

    const session = new voice.AgentSession({
      stt: STT_MODEL,
      llm: LLM_MODEL,
      tts: TTS_MODEL,
      turnHandling: {
        // Predicts whether the user has finished their thought, not just whether they went quiet,
        // so the agent does not cut in during a mid-sentence pause.
        turnDetection: new inference.TurnDetector(),
      },
    });

    // Lifecycle visibility: who joined, when the call ended, and any pipeline errors.
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      logger.error({ error: event.error }, "Agent session error");
    });

    // Per-call metrics: response latency and tool use are only visible while the call runs; token,
    // character and audio usage come from the SDK when it ends. One summary line per call.
    const stats = new CallStats();
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      stats.onAgentState(event.newState, event.createdAt);
    });
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
      stats.onToolsExecuted(event.functionCalls.length);
    });
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      logger.info({ reason: event.reason }, "Agent session closed");
      try {
        logger.info({ callSummary: stats.summary(session.usage.modelUsage) }, "Call summary");
      } catch (err) {
        // Metrics must never get in the way of ending a call.
        logger.warn({ err }, "Could not build the call summary");
      }
    });

    // record defaults to true in the SDK (audio, transcript, logs, traces uploaded to LiveKit Cloud).
    // We make that an explicit, off-by-default choice: see AGENT_RECORD_SESSIONS in config.ts.
    // The room name comes from LiveKit's job, never from the LLM or the caller. The API maps it to
    // the user the room was created for; the agent cannot choose whose tickets it sees.
    // Read from the job (known before connecting), not ctx.room, whose name is only populated after
    // ctx.connect(). Without a room name every tool call would fail, so refuse the job outright.
    const roomName = ctx.job.room?.name;
    if (!roomName) {
      throw new Error("Job has no room name; cannot act for any customer");
    }
    const api = new VoiceDeskApi({
      baseUrl: config.VOICEDESK_API_URL,
      agentKey: config.AGENT_API_KEY,
      roomName,
    });

    await session.start({ agent: createSupportAgent(api), room: ctx.room, record: config.AGENT_RECORD_SESSIONS });
    logger.info({ recording: config.AGENT_RECORD_SESSIONS }, "Agent session started");
    await ctx.connect();

    // Call length cap: say goodbye, let it finish playing, then delete the room, which disconnects
    // everyone and ends the job. Cleared if the call ends on its own first.
    const maxCallMs = config.AGENT_MAX_CALL_MINUTES * 60_000;
    const callTimer = setTimeout(() => {
      logger.info({ maxCallMinutes: config.AGENT_MAX_CALL_MINUTES }, "Call time limit reached");
      void (async () => {
        try {
          await session
            .say("We've reached the time limit for this call. Thanks for calling VoiceDesk. Goodbye!", { allowInterruptions: false })
            .waitForPlayout();
        } catch (err) {
          logger.warn({ err }, "Could not play the goodbye message");
        }
        await ctx.deleteRoom().catch((err: unknown) => logger.error({ err }, "Could not end the call at the time limit"));
      })();
    }, maxCallMs);
    ctx.addShutdownCallback(async () => clearTimeout(callTimer));

    // Speak first, so the caller knows the line is live.
    session.generateReply({
      instructions: "Greet the customer briefly, say you are the VoiceDesk assistant, and ask how you can help.",
    });
  },
});

// Registers with LiveKit Cloud and waits for jobs. agentName enables explicit dispatch: we only join
// rooms whose token asks for us (see apps/api/src/voice/voice.service.ts), never every room in the project.
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.LIVEKIT_AGENT_NAME,
    wsURL: config.LIVEKIT_URL,
    apiKey: config.LIVEKIT_API_KEY,
    apiSecret: config.LIVEKIT_API_SECRET,
  }),
);
