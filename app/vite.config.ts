import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages: relative base, hash routing, so the site works under any sub-path.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      // Absolute URLs for og:image / og:url need the deployed address: VITE_SITE_URL (ends with "/"). Without it they stay relative.
      name: "site-url",
      transformIndexHtml(html: string) {
        const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
        const raw = env.VITE_SITE_URL ?? "";
        const url = raw && !raw.endsWith("/") ? `${raw}/` : raw;
        return html.replaceAll("__SITE_URL__", url || "./");
      },
    },
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          chain: ["viem", "wagmi"],
          ammora: ["@ammora-protocol/sdk"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
