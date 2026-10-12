import { fileURLToPath } from "node:url";
import { type JobContext, ServerOptions, cli, defineAgent, inference, log, voice } from "@livekit/agents";
import { config } from "./config.js";
import { createSupportAgent } from "./support-agent.js";

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
    const logger = log().child({ room: ctx.room.name });

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
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      logger.info({ reason: event.reason }, "Agent session closed");
    });

    // record defaults to true in the SDK (audio, transcript, logs, traces uploaded to LiveKit Cloud).
    // We make that an explicit, off-by-default choice: see AGENT_RECORD_SESSIONS in config.ts.
    await session.start({ agent: createSupportAgent(), room: ctx.room, record: config.AGENT_RECORD_SESSIONS });
    logger.info({ recording: config.AGENT_RECORD_SESSIONS }, "Agent session started");
    await ctx.connect();

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
