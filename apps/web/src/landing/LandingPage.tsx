import type { AgentState } from "@livekit/components-react";
import { ArrowRight, BookOpen, Check, Inbox, Mic, MessageSquareText, PhoneOff, TicketPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import type { User } from "../api/client";
import { AuthDialog, type AuthMode } from "../auth/AuthDialog";
import { Logo } from "../ui/icons";
import { Button, fadeUp } from "../ui/primitives";
import { ThemeToggle } from "../ui/theme";
import { STATE_LABEL, VoiceBars } from "../voice/VoiceBars";

// What visitors see before signing in: what VoiceDesk is, how to use it, and why it helps.
// Sections fade in once as they scroll into view; nothing loops except the call preview.

const reveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
} as const;

export function LandingPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [dialog, setDialog] = useState<{ open: boolean; mode: AuthMode }>({ open: false, mode: "login" });
  const openDialog = (mode: AuthMode) => setDialog({ open: true, mode });

  return (
    <motion.div {...fadeUp}>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-semibold tracking-tight">VoiceDesk</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Sections">
            <a href="#features" className="transition-colors hover:text-fg">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-fg">
              How it works
            </a>
            <a href="#benefits" className="transition-colors hover:text-fg">
              Why voice
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => openDialog("login")}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => openDialog("register")} className="hidden sm:inline-flex">
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-28">
          <div>
            <motion.p {...reveal} className="flex items-center gap-2 text-sm text-muted">
              <span className="size-1.5 rounded-full bg-accent" />
              Voice customer support, in your browser
            </motion.p>
            <motion.h1
              {...reveal}
              transition={{ ...reveal.transition, delay: 0.05 }}
              className="mt-5 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
            >
              Support that <em className="text-accent-text">listens.</em>
            </motion.h1>
            <motion.p {...reveal} transition={{ ...reveal.transition, delay: 0.1 }} className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              Talk to an assistant that checks your tickets, opens new ones, and answers from the help center. Plain conversation, no hold
              music.
            </motion.p>
            <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => openDialog("register")}>
                Start talking
                <ArrowRight size={16} />
              </Button>
              <Button size="lg" variant="secondary" onClick={() => openDialog("login")}>
                I have an account
              </Button>
            </motion.div>
            <motion.ul {...reveal} transition={{ ...reveal.transition, delay: 0.2 }} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {["Free to try", "Only sees your tickets", "Cites its sources"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check size={14} className="text-success" />
                  {item}
                </li>
              ))}
            </motion.ul>
          </div>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <DemoCall />
          </motion.div>
        </section>

        {/* What it can do */}
        <Section id="features" eyebrow="Features" title="One call handles what used to take an email thread.">
          <div className="grid overflow-hidden rounded-xl border border-line bg-line gap-px sm:grid-cols-2">
            <Feature icon={<Inbox size={18} />} title="Ticket status by voice" example="What's happening with ticket 1042?">
              Ask about any of your tickets by number and hear where it stands.
            </Feature>
            <Feature icon={<TicketPlus size={18} />} title="Hands-free tickets" example="My invoice charged me twice.">
              Describe the problem. The assistant reads it back, then opens the ticket.
            </Feature>
            <Feature icon={<BookOpen size={18} />} title="Grounded answers" example="How long do refunds take?">
              Answers come from our help articles, and it names the one it used.
            </Feature>
            <Feature icon={<MessageSquareText size={18} />} title="Natural conversation" example="Actually, wait—">
              Interrupt any time. It notices when you have finished speaking.
            </Feature>
          </div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" eyebrow="How it works" title="From question to answer in three steps.">
          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            <Step n={1} title="Create an account" text="Sign up with your email. It takes less than a minute." />
            <Step n={2} title="Start a call" text="Press Start a call and allow your microphone when the browser asks." />
            <Step n={3} title="Just talk" text={'Ask anything, like "How long do refunds take?" or "My invoice is wrong."'} />
          </ol>
        </Section>

        {/* Benefits */}
        <Section id="benefits" eyebrow="Why voice" title="Faster than a form, calmer than a phone queue.">
          <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            <Benefit stat="0 min" label="on hold" text="The assistant picks up the moment you start a call, at any hour." />
            <Benefit stat="Sourced" label="answers" text="Policy answers come from the help center. If it doesn't know, it says so and offers a ticket." />
            <Benefit stat="Yours only" label="data access" text="It can only see your own tickets, and calls are not recorded." />
          </dl>
        </Section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
          <motion.div {...reveal} className="flex flex-col items-start justify-between gap-6 rounded-xl bg-fg px-8 py-10 text-canvas sm:flex-row dark:border dark:border-line dark:bg-surface dark:text-fg sm:items-center sm:px-10">
            <div>
              <h2 className="font-serif text-4xl tracking-tight">Ready to talk?</h2>
              <p className="mt-2 opacity-70">Create an account and start your first call in under a minute.</p>
            </div>
            <Button size="lg" variant="accent" onClick={() => openDialog("register")}>
              <Mic size={16} />
              Get started
            </Button>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <span className="flex items-center gap-2 font-medium text-fg">
            <Logo size={20} /> VoiceDesk
          </span>
          <span>Voice-first customer support.</span>
        </div>
      </footer>

      <AuthDialog
        open={dialog.open}
        mode={dialog.mode}
        onModeChange={(mode) => setDialog({ open: true, mode })}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onAuthenticated={(user) => {
          setDialog((d) => ({ ...d, open: false }));
          onAuthenticated(user);
        }}
      />
    </motion.div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6 lg:py-20">
      <motion.div {...reveal} className="mb-10 max-w-2xl">
        <p className="text-sm font-medium text-accent-text">{eyebrow}</p>
        <h2 className="mt-2 font-serif text-4xl leading-tight tracking-tight sm:text-[2.75rem]">{title}</h2>
      </motion.div>
      {children}
    </section>
  );
}

function Feature({ icon, title, example, children }: { icon: ReactNode; title: string; example: string; children: ReactNode }) {
  return (
    <motion.div {...reveal} className="flex flex-col bg-surface p-6 sm:p-8">
      <span className="text-muted">{icon}</span>
      <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
      <p className="mt-5 self-start rounded-full border border-line bg-subtle px-3 py-1 text-[13px] text-muted">
        <span className="text-faint">You: </span>“{example}”
      </p>
    </motion.div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <motion.li {...reveal} transition={{ ...reveal.transition, delay: (n - 1) * 0.06 }} className="border-t border-line-strong pt-5">
      <span className="font-serif text-3xl text-faint">0{n}</span>
      <h3 className="mt-3 font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
    </motion.li>
  );
}

function Benefit({ stat, label, text }: { stat: string; label: string; text: string }) {
  return (
    <motion.div {...reveal} className="bg-surface p-6 sm:p-8">
      <dt>
        <span className="font-serif text-4xl tracking-tight">{stat}</span>
        <span className="ml-2 text-sm text-muted">{label}</span>
      </dt>
      <dd className="mt-3 text-sm leading-relaxed text-muted">{text}</dd>
    </motion.div>
  );
}

// A looping, scripted preview of a real call: the same visualizer the app uses, fed with simulated
// voice levels, and the transcript lines that match each moment.
const SCRIPT: { state: AgentState; ms: number; line?: { who: "you" | "assistant"; text: string } }[] = [
  { state: "listening", ms: 2400, line: { who: "you", text: "What's the status of ticket 1042?" } },
  { state: "thinking", ms: 1200 },
  { state: "speaking", ms: 2800, line: { who: "assistant", text: "Ticket 1042 is in progress. An agent updated it this morning." } },
  { state: "listening", ms: 2200, line: { who: "you", text: "How long do refunds take?" } },
  { state: "thinking", ms: 1100 },
  { state: "speaking", ms: 3000, line: { who: "assistant", text: "According to our Refunds article, 5 to 10 business days." } },
];

function DemoCall() {
  const [step, setStep] = useState(0);
  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0]);
  const current = SCRIPT[step % SCRIPT.length];
  const state: AgentState = current?.state ?? "idle";

  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => s + 1), current?.ms ?? 2000);
    return () => clearTimeout(timer);
  }, [step, current?.ms]);

  useEffect(() => {
    if (state === "thinking") {
      setBands([0, 0, 0, 0, 0]);
      return;
    }
    // Speech-like envelope per band: two sines plus jitter, louder while "speaking".
    const peak = state === "speaking" ? 0.42 : 0.2;
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      setBands([0, 1, 2, 3, 4].map((b) => Math.abs(Math.sin((frame + b * 2) / 3) * Math.sin((frame + b) / 7)) * peak * (b === 1 || b === 2 ? 1 : 0.6) + Math.random() * 0.03));
    }, 90);
    return () => clearInterval(id);
  }, [state]);

  // The last two spoken lines up to the current step, cycling with the script.
  const lines = SCRIPT.slice(0, (step % SCRIPT.length) + 1)
    .map((s, i) => (s.line ? { ...s.line, key: `${Math.floor(step / SCRIPT.length)}-${i}` } : null))
    .filter((l) => l !== null)
    .slice(-2);

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)]" aria-hidden>
      <div className="flex h-11 items-center justify-between border-b border-line px-4 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-1.5 rounded-full bg-danger" />
          Live call
        </span>
        <span className="font-mono text-xs text-muted">0:{String(12 + (step % 40)).padStart(2, "0")}</span>
      </div>
      <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6">
        <VoiceBars state={state} bands={bands} size="md" />
        <p className="text-sm text-muted">{STATE_LABEL[state]}</p>
      </div>
      <ul className="min-h-30 space-y-3 border-t border-line bg-subtle px-4 py-4">
        <AnimatePresence initial={false} mode="popLayout">
          {lines.map((line) => (
            <motion.li
              key={line.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className={line.who === "you" ? "flex justify-end" : ""}
            >
              {line.who === "you" ? (
                <span className="max-w-[85%] rounded-2xl rounded-br-md bg-wash px-3.5 py-2 text-sm">{line.text}</span>
              ) : (
                <p className="max-w-[92%] text-sm leading-relaxed">{line.text}</p>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <span className="grid size-9 place-items-center rounded-lg border border-line-strong text-fg">
          <Mic size={16} />
        </span>
        <span className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-danger px-3.5 text-sm font-medium text-white">
          <PhoneOff size={15} />
          End call
        </span>
      </div>
    </div>
  );
}
