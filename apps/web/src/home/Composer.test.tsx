import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

// Wraps the controlled Composer so typing works like in the app.
function Harness({ onSubmit, busy = false, initial = "" }: { onSubmit: () => void; busy?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <Composer value={value} onChange={setValue} onSubmit={onSubmit} busy={busy} placeholder="Ask anything…" tools={<span>tools</span>} />;
}

describe("Composer", () => {
  it("sends on Enter", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox"), "How long do refunds take?{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("adds a new line on Shift+Enter instead of sending", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox"), "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("line one\nline two");
  });

  it("does not send an empty or whitespace-only message", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox"), "   {Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("enables the send button once there is text, and sends on click", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox"), "hello");
    expect(send).toBeEnabled();
    await userEvent.click(send);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("cannot be sent again while busy", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} busy initial="already typed" />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not send while an input method (IME) composition is in progress", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} initial="こんにちは" />);

    // Enter during IME composition confirms the characters; it must not send the message.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the tools it is given", () => {
    render(<Harness onSubmit={() => {}} />);
    expect(screen.getByText("tools")).toBeInTheDocument();
  });
});
