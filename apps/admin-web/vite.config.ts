import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server forwards /api calls to the Fastify API, so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
