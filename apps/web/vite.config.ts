import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DAEMON_PORT = process.env.KANTHA_DAEMON_PORT || "4000";
const DAEMON_TARGET = `http://127.0.0.1:${DAEMON_PORT}`;
const DAEMON_WS_TARGET = `ws://127.0.0.1:${DAEMON_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    proxy: {
      "/api": {
        target: DAEMON_TARGET,
        changeOrigin: true, // Rewrites Host header upstream to 127.0.0.1:<daemonPort>
        secure: false,
      },
      "/ws": {
        target: DAEMON_WS_TARGET,
        ws: true,
        changeOrigin: false,
        rewriteWsOrigin: false, // Explicitly preserves browser WebSocket Origin for daemon validation
      },
    },
  },
});
