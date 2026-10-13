import { z } from "zod";

// Zod 4 probes for `new Function` (to compile fast parsers) the first time a schema is built. Our
// Content-Security-Policy (script-src 'self', no 'unsafe-eval') blocks that, and the probe shows up as a
// violation. jitless skips the probe and uses the plain interpreter; our payloads are tiny.
//
// This must run before ANY schema is created, which happens while modules are imported. So it lives
// in its own module, imported first in main.tsx: imports run in order, before main.tsx's own code.
z.config({ jitless: true });
