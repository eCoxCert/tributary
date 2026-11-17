import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages: relative base, hash routing, so the site works under any sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
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
