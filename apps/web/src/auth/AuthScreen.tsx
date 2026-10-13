import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { api, ApiError, type User } from "../api/client";
import { Button, ErrorBanner, Field, fadeUp, spring } from "../ui/primitives";

type Mode = "login" | "register";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <motion.main {...fadeUp} className="grid min-h-full place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <motion.div
            className="mx-auto mb-5 size-14 rounded-2xl bg-gradient-to-br from-accent to-accent-2 shadow-xl shadow-accent/30"
            animate={{ rotate: [0, 6, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <h1 className="text-2xl font-semibold tracking-tight">VoiceDesk</h1>
          <p className="mt-1 text-sm text-muted">Support that listens.</p>
        </div>

        <div className="glass rounded-2xl p-6">
          {/* Segmented control: the highlight glides between options (shared layoutId). */}
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-black/30 p-1 text-sm">
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
                {mode === m && <motion.span layoutId="auth-tab" transition={spring} className="absolute inset-0 rounded-lg bg-surface-strong" />}
                <span className={`relative ${mode === m ? "text-white" : "text-muted"}`}>{m === "login" ? "Sign in" : "Create account"}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <Field label="Name" name="name" autoComplete="name" required maxLength={100} />
                </motion.div>
              )}
            </AnimatePresence>
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 12 : undefined}
              required
            />
            <ErrorBanner message={error} />
            <Button type="submit" busy={busy} className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </motion.main>
  );
}
