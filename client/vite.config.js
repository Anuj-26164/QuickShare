import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// simple-peer is built on Node primitives (events/stream/buffer) and expects a
// `global`. The polyfill plugin shims these for the browser so WebRTC works.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      include: ["events", "stream", "buffer", "util"],
    }),
  ],
  server: {
    port: 5173,
  },
});
