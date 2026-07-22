import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En desarrollo, Vite proxya /api y /app al backend para mantener same-origin
// (las cookies de sesión funcionan sin CORS). El destino es configurable.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/app": { target: proxyTarget, changeOrigin: true },
    },
  },
});
