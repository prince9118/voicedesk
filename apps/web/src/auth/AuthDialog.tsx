import { type FormEvent, useState } from "react";
import { api, ApiError, type User } from "../api/client";
import { DialogContent, DialogRoot } from "../ui/dialog";
import { Button, ErrorBanner, Field } from "../ui/primitives";

export type AuthMode = "login" | "register";

// Sign-in / sign-up as a modal over the landing page, so visitors never lose their place.
// Radix Dialog handles focus trapping, Escape, outside clicks, scroll lock and focus return.
export function AuthDialog({
  mode,
  open,
  onModeChange,
  onOpenChange,
  onAuthenticated,
}: {
  mode: AuthMode;
  open: boolean;
  onModeChange: (mode: AuthMode) => void;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: (user: User) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = mode === "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    setBusy(true);
    setError(null);
    try {
      const user = login ? await api.login(value("email"), value("password")) : await api.register(value("name"), value("email"), value("password"));
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

  function switchMode() {
    setError(null);
    onModeChange(login ? "register" : "login");
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-sm"
        title={login ? "Sign in to VoiceDesk" : "Create your account"}
        description={login ? "Welcome back. Your tickets are where you left them." : "It takes less than a minute."}
      >
        <form onSubmit={submit} className="space-y-4">
          {!login && <Field label="Name" name="name" autoComplete="name" required maxLength={100} placeholder="Asha Patel" />}
          <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          <Field
            label="Password"
            name="password"
            type="password"
            hint={login ? undefined : "At least 12 characters"}
            autoComplete={login ? "current-password" : "new-password"}
            minLength={login ? undefined : 12}
            required
          />
          <ErrorBanner message={error} />
          <Button type="submit" busy={busy} size="lg" className="w-full">
            {login ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          {login ? "New to VoiceDesk?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode} className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
            {login ? "Create an account" : "Sign in"}
          </button>
        </p>
      </DialogContent>
    </DialogRoot>
  );
}
