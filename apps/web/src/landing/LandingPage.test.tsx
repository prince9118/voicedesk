import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import { PENDING_QUESTION_KEY } from "../home/pending-question";
import { LandingPage } from "./LandingPage";

function renderLanding() {
  return render(
    <Tooltip.Provider>
      <LandingPage onAuthenticated={vi.fn()} />
    </Tooltip.Provider>,
  );
}

describe("LandingPage", () => {
  it("states what the product does", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1, name: /support that listens/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /one call handles/i })).toBeInTheDocument();
  });

  it("opens sign-in from the header", async () => {
    renderLanding();

    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]!);

    expect(await screen.findByRole("dialog", { name: /sign in to voicedesk/i })).toBeInTheDocument();
  });

  it("opens sign-up from Get started", async () => {
    renderLanding();

    await userEvent.click(screen.getAllByRole("button", { name: "Get started" })[0]!);

    expect(await screen.findByRole("dialog", { name: /create your account/i })).toBeInTheDocument();
  });

  it("lets a visitor ask first: the question is kept for after sign-up and the sign-up dialog opens", async () => {
    renderLanding();

    await userEvent.type(screen.getByRole("textbox"), "How long do refunds take?{Enter}");

    expect(await screen.findByRole("dialog", { name: /create your account/i })).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_QUESTION_KEY)).toBe("How long do refunds take?");
  });

  it("does not open the dialog for an empty question", async () => {
    renderLanding();

    await userEvent.type(screen.getByRole("textbox"), "{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links its navigation to real sections of the page", () => {
    renderLanding();

    for (const href of ["#features", "#how-it-works", "#benefits"]) {
      expect(document.querySelector(href)).toBeInTheDocument();
    }
  });
});
