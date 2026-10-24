import { ChevronDown, History, LogOut, Mic, Plus, TicketPlus } from "lucide-react";
import { motion } from "motion/react";
import { DropdownMenu, Popover } from "radix-ui";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Ticket, type User, type VoiceSession } from "../api/client";
import { FilterTabs, FILTERS, NewTicketDialog, type TicketFilter, TicketList } from "../tickets/Tickets";
import { Logo } from "../ui/icons";
import { Button, ErrorBanner, fadeUp } from "../ui/primitives";
import { ThemeToggle } from "../ui/theme";
import { AsciiField, type VoiceLevels } from "./AsciiField";
import { Composer, Headline, ToolButton } from "./Composer";
import { PENDING_QUESTION_KEY } from "./pending-question";
// LiveKit's WebRTC client is most of the bundle; load it only when a conversation starts.
const CallSession = lazy(() => import("./CallSession").then((m) => ({ default: m.CallSession })));

type Call =
  | { kind: "idle" }
  | { kind: "starting"; withMic: boolean }
  | { kind: "live"; session: VoiceSession; withMic: boolean; firstMessage: string | null };

export function Home({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TicketFilter>("all");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [call, setCall] = useState<Call>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => {
    try {
      const pending = sessionStorage.getItem(PENDING_QUESTION_KEY) ?? "";
      sessionStorage.removeItem(PENDING_QUESTION_KEY);
      return pending;
    } catch {
      return "";
    }
  });
  const levels = useRef<VoiceLevels>({ agent: 0, user: 0 });
  const core = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setTickets(await api.listTickets());
      setTicketError(null);
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : "Could not load tickets.");
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

  async function startCall(withMic: boolean, firstMessage: string | null) {
    setError(null);
    setCall({ kind: "starting", withMic });
    try {
      const session = await api.startVoiceSession();
      setCall({ kind: "live", session, withMic, firstMessage });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the assistant.");
      setCall({ kind: "idle" });
    }
  }

  function endCall(message?: string) {
    setCall({ kind: "idle" });
    setError(message ?? null);
    void refresh(); // the assistant may have opened a ticket
  }

  const plusMenu = <PlusMenu onNewTicket={() => setNewTicketOpen(true)} onHistory={() => setHistoryOpen(true)} />;

  return (
    <motion.div {...fadeUp} className="relative min-h-svh overflow-hidden">
      <div className="fixed inset-0">
        <AsciiField anchorRef={core} levels={levels} />
      </div>

      <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <span className="hidden text-sm font-medium tracking-tight sm:inline">VoiceDesk</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          <Popover.Root
            open={historyOpen}
            onOpenChange={(open) => {
              setHistoryOpen(open);
              if (open) void refresh();
            }}
          >
            <Popover.Trigger className="glass-panel group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13px] font-light text-muted transition-colors hover:text-fg data-[state=open]:text-fg">
              <History size={15} strokeWidth={1.7} />
              History
              <ChevronDown size={14} strokeWidth={1.7} className="transition-transform group-data-[state=open]:rotate-180" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="center"
                sideOffset={8}
                collisionPadding={16}
                className="popover-content z-40 w-[min(480px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
              >
                <div className="flex h-14 items-center justify-between gap-3 px-5">
                  <h2 className="text-sm font-medium">Your tickets</h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setHistoryOpen(false);
                      setNewTicketOpen(true);
                    }}
                  >
                    <Plus size={15} />
                    New ticket
                  </Button>
                </div>
                {ticketError && (
                  <div className="px-5 pb-3">
                    <ErrorBanner message={ticketError} />
                  </div>
                )}
                <FilterTabs value={filter} counts={counts} onChange={setFilter}>
                  <div className="max-h-[55vh] overflow-y-auto">
                    <TicketList tickets={filter === "all" ? tickets : tickets.filter((t) => t.status === filter)} loading={loading} filtered={filter !== "all"} />
                  </div>
                </FilterTabs>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <div className="glass-panel flex items-center gap-1 rounded-xl p-1">
          <ThemeToggle />
          <AccountMenu user={user} onSignOut={onSignOut} />
        </div>
      </header>

      <main className="relative z-10 grid min-h-svh place-items-center px-4 py-24">
        <div ref={core} className="relative w-full max-w-[640px]">
          {call.kind === "live" ? (
            <Suspense fallback={<IdleView draft={draft} setDraft={setDraft} tools={plusMenu} busy />}>
              <CallSession
                session={call.session}
                withMic={call.withMic}
                firstMessage={call.firstMessage}
                levels={levels}
                tools={plusMenu}
                onEnd={endCall}
                onActivity={() => void refresh()}
              />
            </Suspense>
          ) : (
            <IdleView
              draft={draft}
              setDraft={setDraft}
              busy={call.kind === "starting"}
              onSend={() => void startCall(false, draft.trim())}
              tools={
                <>
                  {plusMenu}
                  <ToolButton label="Start a voice call" onClick={() => void startCall(true, null)} disabled={call.kind === "starting"}>
                    <Mic size={17} strokeWidth={1.7} />
                  </ToolButton>
                </>
              }
            />
          )}
          {/* Absolutely placed so an error never shifts the composer (or the hands aimed at it). */}
          <div className="absolute inset-x-0 top-full mt-4">
            <ErrorBanner message={error} />
          </div>
        </div>
      </main>

      <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />
    </motion.div>
  );
}

function IdleView({
  draft,
  setDraft,
  tools,
  busy = false,
  onSend = () => undefined,
}: {
  draft: string;
  setDraft: (value: string) => void;
  tools: React.ReactNode;
  busy?: boolean;
  onSend?: () => void;
}) {
  return (
    <>
      <div className="mb-8">
        <Headline>{busy ? "connecting…" : "what’s on your mind?"}</Headline>
      </div>
      <Composer value={draft} onChange={setDraft} onSubmit={onSend} busy={busy} placeholder="Ask VoiceDesk anything…" tools={tools} autoFocus />
    </>
  );
}

const MENU_ITEM = "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg outline-none select-none data-highlighted:bg-wash";
const MENU = "popover-content z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-lg";

function PlusMenu({ onNewTicket, onHistory }: { onNewTicket: () => void; onHistory: () => void }) {
  // The items open other overlays; don't pull focus back to the "+" button and close them again.
  const opened = useRef(false);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <ToolButton label="More actions">
          <Plus size={18} strokeWidth={1.6} />
        </ToolButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className={MENU}
          onCloseAutoFocus={(event) => {
            if (opened.current) event.preventDefault();
            opened.current = false;
          }}
        >
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => ((opened.current = true), onNewTicket())}>
            <TicketPlus size={15} className="text-muted" />
            New ticket
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={() => ((opened.current = true), onHistory())}>
            <History size={15} className="text-muted" />
            Your tickets
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account"
        className="grid size-9 place-items-center rounded-lg bg-wash text-[13px] font-medium text-fg transition-colors hover:bg-line data-[state=open]:bg-line"
      >
        {user.name.trim().charAt(0).toUpperCase() || "?"}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={`${MENU} min-w-56`}>
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={onSignOut} className={MENU_ITEM}>
            <LogOut size={15} className="text-muted" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
