import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DAEMON_PORT = process.env.KANTHA_DAEMON_PORT || "4000";
const DAEMON_TARGET = `http://127.0.0.1:${DAEMON_PORT}`;
const DAEMON_WS_TARGET = `ws://127.0.0.1:${DAEMON_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    proxy: {
      "/api": {
        target: DAEMON_TARGET,
        changeOrigin: true, // Rewrites Host header upstream to 127.0.0.1:<daemonPort>
        secure: false,
        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            if (
              res &&
              "writeHead" in res &&
              typeof (res as any).writeHead === "function"
            ) {
              const httpRes = res as import("node:http").ServerResponse;
              if (!httpRes.headersSent && !httpRes.writableEnded) {
                httpRes.writeHead(502, { "Content-Type": "application/json" });
                httpRes.end(
                  JSON.stringify({
                    error:
                      "Cannot connect to Kantha daemon on port 4000. Please ensure the daemon is running (bun run dev in apps/daemon).",
                  })
                );
              }
            } else if (
              res &&
              "destroy" in res &&
              typeof (res as any).destroy === "function"
            ) {
              // net.Socket (e.g. WebSocket proxy failure)
              (res as import("node:net").Socket).destroy();
            }
          });
          proxy.on("proxyReq", (proxyReq, req) => {
            // Forward Origin if present, or synthesize from Referer/Host
            if (!proxyReq.getHeader("origin")) {
              const referer = req.headers.referer;
              if (referer) {
                try {
                  proxyReq.setHeader("origin", new URL(referer).origin);
                } catch {}
              } else if (req.headers.host) {
                proxyReq.setHeader("origin", `http://${req.headers.host}`);
              }
            }
          });
        },
      },
      "/ws": {
        target: DAEMON_WS_TARGET,
        ws: true,
        changeOrigin: false,
        rewriteWsOrigin: false, // Explicitly preserves browser WebSocket Origin for daemon validation
        configure: (proxy) => {
          proxy.on("error", (err, req, socket) => {
            if (
              socket &&
              "destroy" in socket &&
              typeof (socket as any).destroy === "function"
            ) {
              (socket as import("node:net").Socket).destroy();
            }
          });
        },
      },
    },
  },
});
