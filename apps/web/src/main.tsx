// Must stay the first import: it configures Zod before any module defines a schema.
import "./zod-config";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Fonts are bundled and served from our own origin: no third-party request, and the CSP stays 'self'.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
