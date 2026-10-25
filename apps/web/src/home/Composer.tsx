import { ArrowUpRight } from "lucide-react";
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";
import { Spinner } from "../ui/primitives";
import { ScrambleText } from "../ui/scramble";

// The frosted message box: a growing textarea, tools on the left, key hints and send on the right.
// Enter sends, Shift+Enter adds a line. Purely presentational: callers decide what "send" means.
export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  tools,
  status,
  busy = false,
  autoFocus = false,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  tools: ReactNode;
  status?: ReactNode;
  busy?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const canSend = value.trim().length > 0 && !busy;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className="glass-panel rounded-2xl px-4 pt-3.5 pb-3 transition-[box-shadow,border-color] duration-300 focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent),0_14px_36px_-18px_rgb(0_0_0/0.22)]"
    >
      <label className="sr-only" htmlFor="composer-input">
        {placeholder}
      </label>
      <textarea
        id="composer-input"
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        maxLength={2000}
        className="field-sizing-content block max-h-48 min-h-7 w-full resize-none bg-transparent text-[15px] leading-relaxed font-light text-fg placeholder:text-faint focus-visible:outline-none"
      />
      <div className="mt-3 flex items-center gap-1">
        {tools}
        <div className="ml-auto flex items-center gap-3">
          {status ?? (
            <span className="hidden font-mono text-[11px] text-faint sm:inline" aria-hidden>
              ↵ send <span className="mx-1 opacity-60">·</span> ⇧↵ newline
            </span>
          )}
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="group/send grid size-9 place-items-center overflow-hidden rounded-lg bg-wash text-muted transition-[background-color,color,transform] enabled:bg-fg enabled:text-canvas enabled:hover:bg-fg/85 enabled:active:scale-90 disabled:opacity-70"
          >
            {busy ? <Spinner /> : <ArrowUpRight size={17} strokeWidth={1.8} className="transition-transform duration-200 group-enabled/send:group-hover/send:translate-x-px group-enabled/send:group-hover/send:-translate-y-px" />}
          </button>
        </div>
      </div>
    </form>
  );
}

// Round, quiet icon buttons for the composer's tool row.
export function ToolButton({
  label,
  onClick,
  active = false,
  tone = "default",
  children,
  ...rest
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  const styles =
    tone === "danger"
      ? "bg-danger text-white hover:bg-danger/90"
      : active
        ? "bg-fg text-canvas"
        : "text-muted hover:bg-wash hover:text-fg";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-lg transition-[background-color,color,transform] duration-150 enabled:hover:scale-110 enabled:active:scale-90 motion-reduce:transform-none ${styles}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// The big, thin headline over the art ("what's on your mind?").
export function Headline({ children }: { children: string }) {
  return (
    <h1 className="text-center text-[2.6rem] leading-[1.05] font-extralight tracking-[-0.035em] text-fg sm:text-6xl">
      <ScrambleText text={children} />
    </h1>
  );
}
