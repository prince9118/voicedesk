import { LogOut } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { DropdownMenu, Tooltip } from "radix-ui";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api, sessionStore, setUnauthorizedHandler, type Ticket, type User } from "./api/client";
import { LandingPage } from "./landing/LandingPage";
import { FilterTabs, FILTERS, NewTicketDialog, type TicketFilter, TicketList } from "./tickets/Tickets";
import { Logo } from "./ui/icons";
import { Card, ErrorBanner, fadeUp } from "./ui/primitives";
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
      <Tooltip.Provider delayDuration={300}>
        <div className="min-h-full">
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
      </Tooltip.Provider>
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
  const active = counts.open + counts.in_progress;

  return (
    <motion.div {...fadeUp} className="min-h-screen bg-subtle">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-semibold tracking-tight">VoiceDesk</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu user={user} onSignOut={onSignOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {loading
              ? "Loading your tickets…"
              : active === 0
                ? "You have no active tickets."
                : `You have ${active} active ${active === 1 ? "ticket" : "tickets"}.`}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <Suspense fallback={<Card className="h-105 animate-pulse" />}>
              <VoicePanel onCallActivity={() => void refresh()} />
            </Suspense>
          </div>

          <Card className="min-w-0 overflow-hidden">
            <div className="flex h-14 items-center justify-between gap-3 px-5">
              <h2 className="font-semibold tracking-tight">Tickets</h2>
              <NewTicketDialog onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />
            </div>
            {error && (
              <div className="px-5 pb-4">
                <ErrorBanner message={error} />
              </div>
            )}
            <FilterTabs value={filter} counts={counts} onChange={setFilter}>
              <TicketList tickets={visible} loading={loading} filtered={filter !== "all"} />
            </FilterTabs>
          </Card>
        </div>
      </main>
    </motion.div>
  );
}

function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account"
        className="ml-1 grid size-8 place-items-center rounded-full bg-wash text-[13px] font-semibold text-fg ring-1 ring-line transition-colors hover:bg-line data-[state=open]:ring-line-strong"
      >
        {user.name.trim().charAt(0).toUpperCase() || "?"}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="popover-content z-50 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={onSignOut}
            className="flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg outline-none select-none data-highlighted:bg-wash"
          >
            <LogOut size={15} className="text-muted" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
