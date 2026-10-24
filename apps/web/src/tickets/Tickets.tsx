import { Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Tabs } from "radix-ui";
import { type FormEvent, useEffect, useState } from "react";
import { api, type Ticket } from "../api/client";
import { DialogClose, DialogContent, DialogRoot } from "../ui/dialog";
import { Button, ErrorBanner, Field, PriorityIcon, STATUS_LABEL, StatusIcon, TextAreaField, Tip } from "../ui/primitives";

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

// Underlined tabs (Radix Tabs: arrow-key navigation and tab semantics built in). The list itself is
// rendered below the tab bar for whichever tab is active, so there is a single Tabs.Content.
export function FilterTabs({
  value,
  counts,
  onChange,
  children,
}: {
  value: TicketFilter;
  counts: Record<TicketFilter, number>;
  onChange: (filter: TicketFilter) => void;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Root value={value} onValueChange={(v) => onChange(v as TicketFilter)}>
      <Tabs.List aria-label="Filter tickets by status" className="flex gap-5 overflow-x-auto border-b border-line px-5">
        {FILTERS.map((filter) => (
          <Tabs.Trigger
            key={filter.value}
            value={filter.value}
            className="group relative flex h-10 shrink-0 items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:text-fg"
          >
            {filter.label}
            <span className="text-xs text-faint tabular-nums">{counts[filter.value]}</span>
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg opacity-0 transition-opacity group-data-[state=active]:opacity-100" />
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value={value} tabIndex={-1} className="focus-visible:outline-none">
        {children}
      </Tabs.Content>
    </Tabs.Root>
  );
}

export function TicketList({ tickets, loading, filtered }: { tickets: Ticket[]; loading: boolean; filtered: boolean }) {
  if (loading) {
    return (
      <div className="divide-y divide-line" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-16 items-center gap-4 px-5">
            <span className="size-3.5 animate-pulse rounded-full bg-wash" />
            <span className="h-3 w-2/5 animate-pulse rounded bg-wash" />
            <span className="ml-auto h-3 w-16 animate-pulse rounded bg-wash" />
          </div>
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <Inbox aria-hidden size={22} className="text-faint" />
        <p className="mt-3 text-sm font-medium">{filtered ? "No tickets in this view" : "No tickets yet"}</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          {filtered ? "Try another filter." : "Create one, or start a call and tell the assistant what's wrong."}
        </p>
      </div>
    );
  }

  return (
    // Tickets the voice assistant creates slide in at the top; the rest glide into place.
    <ul className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {tickets.map((ticket) => (
          <motion.li
            key={ticket.id}
            layout="position"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-subtle">
              <span className="mt-0.75">
                <PriorityIcon priority={ticket.priority} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-faint">#{ticket.number}</span>
                  <p className="truncate text-sm font-medium">{ticket.subject}</p>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-muted">{ticket.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 pt-0.5">
                <Tip label={new Date(ticket.updatedAt).toLocaleString()}>
                  <span className="hidden text-xs text-faint tabular-nums sm:block">{timeAgo(ticket.updatedAt)}</span>
                </Tip>
                <span className="flex items-center gap-1.5 text-xs text-muted sm:w-24">
                  <StatusIcon status={ticket.status} />
                  <span className="sr-only sm:not-sr-only">{STATUS_LABEL[ticket.status]}</span>
                </span>
              </div>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

// Controlled: opened from the composer's "+" menu or the History panel.
export function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening is controlled from outside, so clear any old error whenever it opens.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createTicket(String(form.get("subject") ?? ""), String(form.get("description") ?? "")));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New ticket" description="Describe the problem. You can check on it later by voice, too.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Subject" name="subject" required minLength={3} maxLength={200} placeholder="Refund not received" />
          <TextAreaField label="Description" name="description" required maxLength={5000} placeholder="What happened, and when?" />
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" busy={busy}>
              Create ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
