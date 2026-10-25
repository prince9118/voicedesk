import { CircleAlert, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Tooltip } from "radix-ui";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import type { Ticket } from "../api/client";

// Shared motion preset so screens enter and leave with one consistent, quiet feel.
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const BUTTON_VARIANTS = {
  primary: "bg-fg text-canvas hover:bg-fg/85",
  accent: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line-strong bg-surface text-fg shadow-xs hover:bg-wash",
  ghost: "text-muted hover:bg-wash hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/90",
};
const BUTTON_SIZES = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-[15px]",
  icon: "size-9",
};

export function Button({ variant = "primary", size = "md", busy = false, disabled, children, className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-150 select-none enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97] motion-reduce:transform-none disabled:pointer-events-none disabled:opacity-50 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <LoaderCircle aria-hidden size={16} className="animate-spin" />;
}

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg shadow-xs transition-[border-color,box-shadow] placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/20 focus-visible:outline-none";

function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-[13px] font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <FieldLabel label={label} hint={hint}>
      <input className={`${CONTROL} h-10`} {...input} />
    </FieldLabel>
  );
}

export function TextAreaField({ label, hint, ...input }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <FieldLabel label={label} hint={hint}>
      <textarea className={`${CONTROL} min-h-28 resize-y py-2.5 leading-relaxed`} {...input} />
    </FieldLabel>
  );
}

// Errors slide in and out instead of making the layout jump.
export function ErrorBanner({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <p role="alert" className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger-text">
            <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
            {message}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Card({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface shadow-xs ${className}`}>{children}</div>;
}

// Hover/focus label for icon-only buttons. Needs <Tooltip.Provider> near the root (see App).
export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="popover-content z-50 rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const STATUS_LABEL: Record<Ticket["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

// Status as a shape as well as a colour (empty → half → check), so it reads without colour vision.
export function StatusIcon({ status }: { status: Ticket["status"] }) {
  const common = { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true } as const;
  switch (status) {
    case "open":
      return (
        <svg {...common} className="shrink-0 text-info">
          <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common} className="shrink-0 text-warning-text">
          <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.25a3.75 3.75 0 0 1 0 7.5Z" fill="currentColor" />
        </svg>
      );
    case "resolved":
      return (
        <svg {...common} className="shrink-0 text-success">
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="m4.4 7.2 1.8 1.8 3.5-3.6" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "closed":
      return (
        <svg {...common} className="shrink-0 text-faint">
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="m5 5 4 4M9 5 5 9" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}

// Priority as signal bars (1–3 filled), with urgent as a filled warning square.
export function PriorityIcon({ priority }: { priority: Ticket["priority"] }) {
  if (priority === "urgent") {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" role="img" aria-label="Urgent priority" className="shrink-0 text-accent">
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 4v3.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10" r="0.9" fill="white" />
      </svg>
    );
  }
  const filled = { low: 1, medium: 2, high: 3 }[priority];
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" role="img" aria-label={`${priority} priority`} className="shrink-0 text-muted">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4} y={9 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill="currentColor" opacity={i < filled ? 1 : 0.25} />
      ))}
    </svg>
  );
}
