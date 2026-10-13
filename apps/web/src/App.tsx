import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, sessionStore, setUnauthorizedHandler, type Ticket, type User } from "./api/client";
import { AuthScreen } from "./auth/AuthScreen";
import { NewTicketForm, TicketList } from "./tickets/Tickets";
import { Button, ErrorBanner, fadeUp } from "./ui/primitives";
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
      <div className="aurora min-h-full">
        <AnimatePresence mode="wait">
          {auth.kind === "checking" && <motion.div key="checking" {...fadeUp} className="min-h-screen" />}
          {auth.kind === "signed-out" && <AuthScreen key="auth" onAuthenticated={(user) => setAuth({ kind: "signed-in", user })} />}
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

function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <motion.div {...fadeUp} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-accent to-accent-2" />
          <div>
            <p className="text-sm font-semibold">VoiceDesk</p>
            <p className="text-xs text-muted">Hi, {user.name}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={onSignOut}>
          Sign out
        </Button>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Suspense fallback={<div className="glass h-[420px] animate-pulse rounded-2xl" />}>
          <VoicePanel onCallActivity={() => void refresh()} />
        </Suspense>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Your tickets</h2>
              <p className="text-sm text-muted">{loading ? "Loading…" : `${tickets.length} total`}</p>
            </div>
            <NewTicketForm onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />
          </div>
          <ErrorBanner message={error} />
          <TicketList tickets={tickets} loading={loading} />
        </section>
      </div>
    </motion.div>
  );
}
