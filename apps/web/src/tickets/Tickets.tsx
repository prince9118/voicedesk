import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { api, type Ticket } from "../api/client";
import { Button, Card, ErrorBanner, Field, StatusPill, spring } from "../ui/primitives";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function TicketList({ tickets, loading }: { tickets: Ticket[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-[74px] rounded-2xl bg-surface"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="text-center text-sm text-muted">
        No tickets yet. Create one here, or just ask the assistant.
      </Card>
    );
  }

  return (
    // layout + AnimatePresence: new tickets (including ones the voice assistant creates) slide in,
    // and the rest of the list glides down to make room instead of jumping.
    <motion.ul layout className="space-y-3">
      <AnimatePresence initial={false}>
        {tickets.map((ticket, i) => (
          <motion.li
            key={ticket.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: Math.min(i, 8) * 0.04 } }}
            exit={{ opacity: 0, scale: 0.96 }}
            whileHover={{ y: -2 }}
            className="glass flex items-center gap-4 rounded-2xl px-5 py-4"
          >
            <span className="w-14 shrink-0 font-mono text-xs text-muted">#{ticket.number}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{ticket.subject}</p>
              <p className="truncate text-xs text-muted">{ticket.description}</p>
            </div>
            <span className="hidden text-xs text-muted sm:block">{dateFormat.format(new Date(ticket.createdAt))}</span>
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
    <div>
      <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={spring} className="text-base leading-none">
          +
        </motion.span>
        New ticket
      </Button>
      <AnimatePresence>
        {open && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="glass space-y-3 overflow-hidden rounded-2xl p-5"
          >
            <Field label="Subject" name="subject" required minLength={3} maxLength={200} placeholder="Refund not received" />
            <Field label="Description" name="description" required maxLength={5000} placeholder="What happened?" />
            <ErrorBanner message={error} />
            <Button type="submit" busy={busy}>
              Create ticket
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
