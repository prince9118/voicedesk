import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in development: the browser calls /api on the Vite server, which forwards to Express.
    // No CORS involved, and the API URL never needs to be baked into the bundle.
    proxy: { "/api": "http://localhost:4000" },
  },
});
