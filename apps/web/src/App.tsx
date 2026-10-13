import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api, sessionStore, setUnauthorizedHandler, type Ticket, type User } from "./api/client";
import { LandingPage } from "./landing/LandingPage";
import { FilterTabs, FILTERS, NewTicketForm, type TicketFilter, TicketList } from "./tickets/Tickets";
import { LogOutIcon, Logo } from "./ui/icons";
import { AnimatedNumber, Button, ErrorBanner, fadeUp } from "./ui/primitives";
import { ThemeToggle } from "./ui/theme";
// LiveKit's WebRTC client is most of the bundle; load it only once someone is signed in.
const VoicePanel = lazy(() => import("./voice/VoicePanel").then((m) => ({ default: m.VoicePanel })));

type AuthState = { kind: "checking" } | { kind: "signed-out" } | { kind: "signed-in"; user: User };

export function App() {
  const [auth, setAuth] = useState<AuthState>(() => (sessionStore.get() ? { kind: "checking" } : { kind: "signed-out" }));

  // Any 401 (expired or revoked session) sends the user back to sign-in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStore.clear();
      setAuth({ kind: "signed-out" });
    });
  }, []);

  // Restore a session after reload: the token may have expired or been revoked server-side.
  useEffect(() => {
    if (auth.kind !== "checking") return;
    api
      .me()
      .then((user) => setAuth({ kind: "signed-in", user }))
      .catch(() => setAuth({ kind: "signed-out" }));
  }, [auth.kind]);

  return (
    // reducedMotion="user": people who ask their OS for less motion get fades instead of movement.
    <MotionConfig reducedMotion="user">
      <div className="backdrop min-h-full">
        <AnimatePresence mode="wait">
          {auth.kind === "checking" && <motion.div key="checking" {...fadeUp} className="min-h-screen" />}
          {auth.kind === "signed-out" && <LandingPage key="landing" onAuthenticated={(user) => setAuth({ kind: "signed-in", user })} />}
          {auth.kind === "signed-in" && (
            <Dashboard
              key="dashboard"
              user={auth.user}
              onSignOut={async () => {
                await api.logout().catch(() => undefined);
                setAuth({ kind: "signed-out" });
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TicketFilter>("all");

  const refresh = useCallback(async () => {
    try {
      setTickets(await api.listTickets());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(FILTERS.map((f) => [f.value, 0])) as Record<TicketFilter, number>;
    result.all = tickets.length;
    for (const t of tickets) result[t.status]++;
    return result;
  }, [tickets]);
  const visible = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <motion.div {...fadeUp}>
      {/* Sticky frosted top bar: stays in reach while the ticket list scrolls. */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-semibold tracking-tight">VoiceDesk</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden items-center gap-2.5 rounded-xl border border-line bg-surface py-1 pr-3 pl-1 sm:flex">
              <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-accent to-accent-2 text-sm font-semibold text-white">
                {user.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="text-sm font-medium">{user.name}</span>
            </div>
            <Button variant="subtle" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="px-2.5">
              <LogOutIcon />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-muted">Start a call, or keep an eye on your tickets.</p>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
          <Stat label="Open" value={counts.open} tone="text-cyan-600 dark:text-cyan-300" />
          <Stat label="In progress" value={counts.in_progress} tone="text-violet-600 dark:text-violet-300" />
          <Stat label="Resolved" value={counts.resolved} tone="text-emerald-600 dark:text-emerald-300" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-8">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Suspense fallback={<div className="glass h-[460px] animate-pulse rounded-3xl" />}>
              <VoicePanel onCallActivity={() => void refresh()} />
            </Suspense>
          </div>

          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Your tickets</h2>
              <FilterTabs value={filter} counts={counts} onChange={setFilter} />
            </div>
            <NewTicketForm onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />
            <ErrorBanner message={error} />
            <TicketList tickets={visible} loading={loading} filtered={filter !== "all"} />
          </section>
        </div>
      </main>
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="glass rounded-2xl px-4 py-4 sm:px-5">
      <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${tone}`}>
        <AnimatedNumber value={value} />
      </p>
    </motion.div>
  );
}
