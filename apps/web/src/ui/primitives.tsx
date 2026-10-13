import { AnimatePresence, animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from "motion/react";
import { type InputHTMLAttributes, type ReactNode, useEffect } from "react";
import type { Ticket } from "../api/client";

// Shared motion presets so the whole app moves with one consistent "feel".
export const spring = { type: "spring", stiffness: 380, damping: 30 } as const;
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
} as const;

// Motion's props allow animated values as children; a button's label is always plain React content.
type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  size?: "md" | "lg";
  busy?: boolean;
};

export function Button({ variant = "primary", size = "md", busy = false, disabled, children, className = "", ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-linear-to-r from-accent to-accent-2 text-white shadow-lg shadow-accent/30 hover:shadow-accent/45",
    ghost: "glass text-fg hover:bg-surface-strong",
    subtle: "text-muted hover:bg-surface hover:text-fg",
    danger: "bg-danger text-white shadow-lg shadow-danger/25",
  }[variant];
  const sizes = { md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-[15px]" }[size];
  return (
    <motion.button
      whileHover={disabled || busy ? undefined : { y: -1 }}
      whileTap={disabled || busy ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[box-shadow,background-color,color] disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${styles} ${className}`}
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
      className="inline-block size-4 rounded-full border-2 border-current/30 border-t-current"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    />
  );
}

export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-xs font-medium text-muted">
        {label}
        {hint && <span className="font-normal opacity-80">{hint}</span>}
      </span>
      <input
        className="w-full rounded-xl border border-line bg-input px-3.5 py-2.5 text-sm text-fg placeholder:text-muted/60 transition-[border-color,box-shadow] focus:border-accent/60 focus:shadow-[0_0_0_4px_rgb(124_108_255/0.15)] focus:outline-none"
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
          className="overflow-hidden rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger dark:text-rose-300"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

const STATUS_STYLES: Record<Ticket["status"], string> = {
  open: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300",
  in_progress: "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  resolved: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  closed: "bg-slate-500/10 text-muted ring-slate-500/20",
};

export function StatusPill({ status }: { status: Ticket["status"] }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${STATUS_STYLES[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace("_", " ")}
    </span>
  );
}

const PRIORITY_COLOR: Record<Ticket["priority"], string> = {
  low: "bg-slate-400",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

export function PriorityDot({ priority }: { priority: Ticket["priority"] }) {
  return <span title={`${priority} priority`} className={`size-2 shrink-0 rounded-full ${PRIORITY_COLOR[priority]}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-6 ${className}`}>{children}</div>;
}

// A number that counts to its new value instead of jumping (e.g. stats after a call creates a ticket).
export function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [motionValue, value]);
  return <motion.span>{rounded}</motion.span>;
}
