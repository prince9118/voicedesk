import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type User } from "../api/client";
import { AuthDialog, type AuthMode } from "./AuthDialog";

const user: User = { id: "u1", email: "asha@example.com", name: "Asha Patel", role: "customer" };

// The dialog is controlled by its parent (the landing page); this stands in for it.
function Harness({ initialMode = "login", onAuthenticated }: { initialMode?: AuthMode; onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [open, setOpen] = useState(true);
  return <AuthDialog mode={mode} open={open} onModeChange={setMode} onOpenChange={setOpen} onAuthenticated={onAuthenticated} />;
}

beforeEach(() => {
  vi.spyOn(api, "login").mockResolvedValue(user);
  vi.spyOn(api, "register").mockResolvedValue(user);
});

describe("AuthDialog: sign in", () => {
  it("signs in with the typed email and password", async () => {
    const onAuthenticated = vi.fn();
    render(<Harness onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
    expect(api.login).toHaveBeenCalledWith("asha@example.com", "a-long-password");
  });

  it("shows the server's message for a wrong password, and stays open", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password"));
    const onAuthenticated = vi.fn();
    render(<Harness onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains validation failures in one sentence instead of showing API details", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Invalid request body"));
    render(<Harness onAuthenticated={() => {}} />);

    await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/passwords need at least 12 characters/i);
  });

  it("does not ask for a name when signing in", () => {
    render(<Harness onAuthenticated={() => {}} />);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});

describe("AuthDialog: create account", () => {
  it("asks for a name and hints at the password length", () => {
    render(<Harness initialMode="register" onAuthenticated={() => {}} />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();
  });

  it("registers with name, email and password", async () => {
    const onAuthenticated = vi.fn();
    render(<Harness initialMode="register" onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText("Name"), "Asha Patel");
    await userEvent.type(screen.getByLabelText("Email"), "asha@example.com");
    // In sign-up mode the field's accessible name includes its hint ("Password At least 12 characters").
    await userEvent.type(screen.getByLabelText(/^Password/), "a-long-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
    expect(api.register).toHaveBeenCalledWith("Asha Patel", "asha@example.com", "a-long-password");
  });

  it("switches between sign in and create account without closing", async () => {
    render(<Harness onAuthenticated={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: /sign in to voicedesk/i })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Harness onAuthenticated={() => {}} />);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
