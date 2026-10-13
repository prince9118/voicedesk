import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { Ticket } from "../api/client";

// Shared motion presets so the whole app moves with one consistent "feel".
export const spring = { type: "spring", stiffness: 380, damping: 30 } as const;
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
} as const;

// Motion's props allow animated values as children; a button's label is always plain React content.
type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, disabled, children, className = "", ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-gradient-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/25",
    ghost: "glass text-white hover:bg-surface-strong",
    danger: "bg-danger/90 text-white shadow-lg shadow-danger/20",
  }[variant];
  return (
    <motion.button
      whileHover={disabled || busy ? undefined : { y: -1 }}
      whileTap={disabled || busy ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </motion.button>
  );
}

export function Spinner() {
  return (
    <motion.span
      aria-hidden
      className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    />
  );
}

export function Field({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <input
        className="w-full rounded-xl border border-line bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-muted/60 transition-colors focus:border-accent/60 focus:outline-none"
        {...input}
      />
    </label>
  );
}

// Errors slide in and out instead of making the layout jump.
export function ErrorBanner({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

const STATUS_STYLES: Record<Ticket["status"], string> = {
  open: "bg-accent-2/15 text-accent-2 ring-accent-2/30",
  in_progress: "bg-accent/15 text-[#b3aaff] ring-accent/30",
  resolved: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  closed: "bg-white/5 text-muted ring-white/10",
};

export function StatusPill({ status }: { status: Ticket["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace("_", " ")}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-5 ${className}`}>{children}</div>;
}
