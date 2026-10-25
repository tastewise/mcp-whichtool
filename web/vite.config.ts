import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { packageVersion } from "./version";

// `whichtool serve` listens here; `npm run dev` proxies the API to it.
const CONSOLE = "http://127.0.0.1:8790";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __VERSION__: JSON.stringify(packageVersion()) },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The Python package serves the build under /static/, so it ships inside it.
  base: "/static/",
  build: { outDir: fileURLToPath(new URL("../whichtool/static", import.meta.url)), emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": { target: CONSOLE, changeOrigin: false } },
  },
});
