import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local dev, proxy API + agent-script routes to the FastAPI server so
// the SPA and backend share an origin. In production the same FastAPI process
// serves this compiled bundle, so no proxy is involved.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/install.sh": "http://localhost:8000",
      "/ledger-agent.sh": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
