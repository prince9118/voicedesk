import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, type User } from "../api/client";
import { Logo } from "../ui/icons";
import { Button, ErrorBanner, Field, spring } from "../ui/primitives";

export type AuthMode = "login" | "register";

// Sign-in / sign-up as a modal dialog over the landing page, so visitors never lose their place.
// Accessible: role="dialog" + aria-modal, Escape and backdrop click close it, focus is trapped
// inside while open and returned to the button that opened it afterwards.
export function AuthDialog({
  initialMode,
  onClose,
  onAuthenticated,
}: {
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // no scrolling the page behind the dialog

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "login"
          ? await api.login(value("email"), value("password"))
          : await api.register(value("name"), value("email"), value("password"));
      onAuthenticated(user);
    } catch (err) {
      // The API's validation details are for developers; show people one clear sentence.
      setError(
        err instanceof ApiError && err.code === "VALIDATION_ERROR"
          ? "Please check your details. Passwords need at least 12 characters."
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={spring}
        className="relative w-full max-w-sm rounded-3xl border border-line bg-canvas p-7 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg">
          ✕
        </button>

        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={40} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <h2 id="auth-title" className="mt-4 text-xl font-semibold tracking-tight">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-1 text-sm text-muted">{mode === "login" ? "Sign in to talk to support." : "It takes less than a minute."}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Segmented control: the highlight glides between options (shared layoutId). */}
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-surface p-1 text-sm">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className="relative rounded-lg py-2 font-medium"
              aria-pressed={mode === m}
            >
              {mode === m && <motion.span layoutId="auth-tab" transition={spring} className="absolute inset-0 rounded-lg bg-surface-strong shadow-sm" />}
              <span className={`relative transition-colors ${mode === m ? "text-fg" : "text-muted"}`}>{m === "login" ? "Sign in" : "Sign up"}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <Field label="Name" name="name" autoComplete="name" required maxLength={100} placeholder="Asha Patel" />
              </motion.div>
            )}
          </AnimatePresence>
          <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" autoFocus />
          <Field
            label="Password"
            name="password"
            type="password"
            hint={mode === "register" ? "12+ characters" : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 12 : undefined}
            required
          />
          <ErrorBanner message={error} />
          <Button type="submit" busy={busy} size="lg" className="w-full">
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </motion.div>
    </motion.div>
  );
}
