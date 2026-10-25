import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { packageVersion } from "./version";

export default defineConfig({
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(packageVersion()) },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The docs are Markdown beside web/, as in vite.config.ts.
  server: { fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../docs", import.meta.url))] } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    restoreMocks: true,
  },
});
