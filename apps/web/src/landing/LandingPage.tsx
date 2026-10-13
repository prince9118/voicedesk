import type { AgentState } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import type { User } from "../api/client";
import { AuthDialog, type AuthMode } from "../auth/AuthDialog";
import { BookIcon, InboxIcon, Logo, MicIcon, PhoneIcon, ShieldIcon, WaveIcon } from "../ui/icons";
import { Button, fadeUp } from "../ui/primitives";
import { ThemeToggle } from "../ui/theme";
import { VoiceOrb } from "../voice/VoiceOrb";

// What visitors see before signing in: what VoiceDesk is, how to use it, and why it helps.
// Sections reveal as they scroll into view (once), so the page feels alive without looping noise.

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
} as const;

export function LandingPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [dialog, setDialog] = useState<AuthMode | null>(null);

  return (
    <motion.div {...fadeUp}>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-semibold tracking-tight">VoiceDesk</span>
          </a>
          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Sections">
            {[
              ["#features", "Features"],
              ["#how-it-works", "How it works"],
              ["#benefits", "Benefits"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="subtle" onClick={() => setDialog("login")}>
              Sign in
            </Button>
            <Button onClick={() => setDialog("register")} className="hidden sm:inline-flex">
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div>
            <motion.span {...reveal} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="size-1.5 rounded-full bg-accent-2" />
              AI voice customer support
            </motion.span>
            <motion.h1 {...reveal} transition={{ ...reveal.transition, delay: 0.05 }} className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Support that{" "}
              <span className="bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent">listens.</span>
            </motion.h1>
            <motion.p {...reveal} transition={{ ...reveal.transition, delay: 0.1 }} className="mt-5 max-w-lg text-lg text-muted">
              Talk to an AI assistant in your browser. It checks your tickets, opens new ones for you, and answers questions from our
              help center, in plain conversation, with no hold music.
            </motion.p>
            <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => setDialog("register")}>
                <PhoneIcon />
                Get started, it's free
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setDialog("login")}>
                I have an account
              </Button>
            </motion.div>
          </div>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <DemoCall />
          </motion.div>
        </section>

        {/* What it can do */}
        <Section id="features" eyebrow="Features" title="One call handles what used to take an email thread">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={<InboxIcon />} title="Ticket status by voice" text={'Say "What\'s happening with ticket 1042?" and hear the answer.'} delay={0} />
            <FeatureCard icon={<PhoneIcon />} title="Hands-free tickets" text="Describe the problem; the assistant reads it back and opens a ticket." delay={0.05} />
            <FeatureCard icon={<BookIcon />} title="Grounded answers" text="Answers come from our help articles, with the source named." delay={0.1} />
            <FeatureCard icon={<WaveIcon />} title="Natural conversation" text="Interrupt any time. It knows when you've finished speaking." delay={0.15} />
          </div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" eyebrow="How it works" title="From question to answer in three steps">
          <ol className="grid gap-4 md:grid-cols-3">
            <Step n={1} title="Create an account" text="Sign up with your email. It takes less than a minute." />
            <Step n={2} title="Start a call" text="Press Start call and allow your microphone when the browser asks." />
            <Step n={3} title="Just talk" text={'Ask anything: "How long do refunds take?" or "Report that my invoice is wrong."'} />
          </ol>
        </Section>

        {/* Benefits */}
        <Section id="benefits" eyebrow="Benefits" title="Why customers prefer it">
          <div className="grid gap-4 md:grid-cols-3">
            <Benefit stat="0 min" label="waiting on hold" text="The assistant answers the moment you start a call, at any hour." />
            <Benefit stat="100%" label="sourced answers" text="Policy answers come from the help center. If it doesn't know, it says so and offers a ticket." />
            <Benefit stat="Only yours" label="data it can see" text="It can only access your own tickets, and calls are not recorded." icon={<ShieldIcon />} />
          </div>
        </Section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.div {...reveal} className="relative overflow-hidden rounded-3xl border border-line bg-linear-to-br from-accent/15 via-surface to-accent-2/15 px-6 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Ready to talk?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">Create an account and start your first call in under a minute.</p>
            <div className="mt-8 flex justify-center gap-3">
              <Button size="lg" onClick={() => setDialog("register")}>
                <MicIcon />
                Get started
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setDialog("login")}>
                Sign in
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <span className="flex items-center gap-2">
            <Logo size={22} /> VoiceDesk
          </span>
          <span>Voice-first customer support.</span>
        </div>
      </footer>

      <AnimatePresence>
        {dialog && (
          <AuthDialog
            key="auth"
            initialMode={dialog}
            onClose={() => setDialog(null)}
            onAuthenticated={(user) => {
              setDialog(null);
              onAuthenticated(user);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <motion.div {...reveal} className="mb-10 max-w-2xl">
        <p className="text-sm font-semibold text-accent">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
      </motion.div>
      {children}
    </section>
  );
}

function FeatureCard({ icon, title, text, delay }: { icon: ReactNode; title: string; text: string; delay: number }) {
  return (
    <motion.div {...reveal} transition={{ ...reveal.transition, delay }} whileHover={{ y: -4 }} className="glass rounded-3xl p-6">
      <span className="grid size-11 place-items-center rounded-2xl bg-accent/12 text-accent">{icon}</span>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
    </motion.div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <motion.li {...reveal} transition={{ ...reveal.transition, delay: (n - 1) * 0.08 }} className="glass relative rounded-3xl p-6">
      <span className="grid size-10 place-items-center rounded-full bg-linear-to-br from-accent to-accent-2 font-semibold text-white shadow-lg shadow-accent/30">
        {n}
      </span>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
    </motion.li>
  );
}

function Benefit({ stat, label, text, icon }: { stat: string; label: string; text: string; icon?: ReactNode }) {
  return (
    <motion.div {...reveal} whileHover={{ y: -4 }} className="glass rounded-3xl p-6">
      <p className="flex items-center gap-2 bg-linear-to-r from-accent to-accent-2 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
        {stat}
        {icon && <span className="text-accent">{icon}</span>}
      </p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-3 text-sm text-muted">{text}</p>
    </motion.div>
  );
}

// A looping, scripted preview of a real call: the same orb the app uses, fed with simulated
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
  const [volume, setVolume] = useState(0);
  const current = SCRIPT[step % SCRIPT.length];
  const state: AgentState = current?.state ?? "idle";

  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => s + 1), current?.ms ?? 2000);
    return () => clearTimeout(timer);
  }, [step, current?.ms]);

  useEffect(() => {
    if (state === "thinking") {
      setVolume(0);
      return;
    }
    // Speech-like envelope: two sines plus jitter, louder while "speaking".
    const peak = state === "speaking" ? 0.5 : 0.25;
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      setVolume(Math.abs(Math.sin(frame / 3) * Math.sin(frame / 7)) * peak + Math.random() * 0.05);
    }, 90);
    return () => clearInterval(id);
  }, [state]);

  // The last two spoken lines up to the current step, cycling with the script.
  const lines = SCRIPT.slice(0, (step % SCRIPT.length) + 1)
    .map((s, i) => (s.line ? { ...s.line, key: `${Math.floor(step / SCRIPT.length)}-${i}` } : null))
    .filter((l) => l !== null)
    .slice(-2);

  return (
    <div className="glass relative mx-auto max-w-md rounded-3xl p-6" aria-hidden>
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1">
          <span className="size-1.5 rounded-full bg-success" /> Live preview
        </span>
        <span className="font-mono">0:{String(12 + (step % 40)).padStart(2, "0")}</span>
      </div>
      <VoiceOrb state={state} volume={volume} />
      <ul className="mt-4 min-h-[104px] space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {lines.map((line) => (
            <motion.li
              key={line.key}
              layout
              initial={{ opacity: 0, y: 10, x: line.who === "you" ? 12 : -12 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`flex ${line.who === "you" ? "justify-end" : "justify-start"}`}
            >
              <span
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                  line.who === "you" ? "rounded-br-md bg-linear-to-br from-accent to-accent/80 text-white" : "rounded-bl-md border border-line bg-surface-strong"
                }`}
              >
                {line.text}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
