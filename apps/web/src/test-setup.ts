// Runs before every test file.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "./zod-config";

afterEach(() => {
  cleanup(); // unmount what the test rendered (Testing Library only does this itself with global hooks)
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

// jsdom does not implement these browser APIs; Radix UI and our code call them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
} as unknown as typeof IntersectionObserver;

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// No canvas in jsdom. The animated backdrop checks for a context and does nothing without one.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
