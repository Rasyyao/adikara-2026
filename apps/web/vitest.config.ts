import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests of the browser-side logic that needs no browser: the shared board's sync, the AI's visuals and code
// simulations, diagram playback steps and board geometry. The end-to-end tests (e2e/) run in Playwright instead.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
