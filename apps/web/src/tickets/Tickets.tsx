import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { api, type Ticket } from "../api/client";
import { InboxIcon, PlusIcon } from "../ui/icons";
import { Button, ErrorBanner, Field, PriorityDot, StatusPill, spring } from "../ui/primitives";

export type TicketFilter = "all" | Ticket["status"];
export const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function FilterTabs({
  value,
  counts,
  onChange,
}: {
  value: TicketFilter;
  counts: Record<TicketFilter, number>;
  onChange: (filter: TicketFilter) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 text-sm" role="tablist">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          role="tab"
          aria-selected={value === filter.value}
          onClick={() => onChange(filter.value)}
          className="relative shrink-0 rounded-lg px-3 py-1.5 font-medium"
        >
          {value === filter.value && <motion.span layoutId="ticket-filter" transition={spring} className="absolute inset-0 rounded-lg bg-surface-strong shadow-sm" />}
          <span className={`relative flex items-center gap-1.5 transition-colors ${value === filter.value ? "text-fg" : "text-muted hover:text-fg"}`}>
            {filter.label}
            <span className="rounded-md bg-surface px-1.5 text-[11px] tabular-nums text-muted">{counts[filter.value]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function TicketList({ tickets, loading, filtered }: { tickets: Ticket[]; loading: boolean; filtered: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-[78px] rounded-2xl border border-line bg-surface"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent/12 text-accent">
          <InboxIcon width={22} height={22} />
        </span>
        <p className="font-medium">{filtered ? "No tickets in this view" : "No tickets yet"}</p>
        <p className="max-w-xs text-sm text-muted">
          {filtered ? "Try another filter." : "Create one here, or start a call and just tell the assistant what's wrong."}
        </p>
      </motion.div>
    );
  }

  return (
    // layout + AnimatePresence: tickets (including ones the voice assistant creates) slide in, filtered-out
    // ones fade away, and the rest glide into place instead of jumping.
    <motion.ul layout className="space-y-2.5">
      <AnimatePresence initial={false} mode="popLayout">
        {tickets.map((ticket, i) => (
          <motion.li
            key={ticket.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: Math.min(i, 8) * 0.035 } }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            whileHover={{ y: -2 }}
            className="glass group flex items-center gap-4 rounded-2xl px-5 py-4"
          >
            <PriorityDot priority={ticket.priority} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-muted">#{ticket.number}</span>
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{ticket.description}</p>
            </div>
            <span className="hidden text-xs text-muted sm:block" title={new Date(ticket.updatedAt).toLocaleString()}>
              {timeAgo(ticket.updatedAt)}
            </span>
            <StatusPill status={ticket.status} />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

export function NewTicketForm({ onCreated }: { onCreated: (ticket: Ticket) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createTicket(String(form.get("subject") ?? ""), String(form.get("description") ?? "")));
      formElement.reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex justify-end">
        <Button variant={open ? "ghost" : "primary"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={spring} className="grid">
            <PlusIcon />
          </motion.span>
          {open ? "Cancel" : "New ticket"}
        </Button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="glass space-y-4 overflow-hidden rounded-3xl p-6"
          >
            <Field label="Subject" name="subject" required minLength={3} maxLength={200} placeholder="Refund not received" autoFocus />
            <Field label="Description" name="description" required maxLength={5000} placeholder="What happened, and when?" />
            <ErrorBanner message={error} />
            <div className="flex justify-end">
              <Button type="submit" busy={busy}>
                Create ticket
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
