import { describe, expect, it, vi } from "vitest";
import { PENDING_QUESTION_KEY, rememberPendingQuestion } from "./pending-question";

describe("rememberPendingQuestion", () => {
  it("keeps a trimmed question for after sign-up", () => {
    rememberPendingQuestion("  How long do refunds take?  ");
    expect(sessionStorage.getItem(PENDING_QUESTION_KEY)).toBe("How long do refunds take?");
  });

  it("stores nothing for a blank question", () => {
    rememberPendingQuestion("   ");
    expect(sessionStorage.getItem(PENDING_QUESTION_KEY)).toBeNull();
  });

  it("does not throw when storage is blocked (private mode)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => rememberPendingQuestion("hello")).not.toThrow();
  });
});
