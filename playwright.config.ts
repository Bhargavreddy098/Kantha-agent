import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E runner for the durable H0-H1 harness baseline.
 * The dev gateway auto-authenticates loopback requests, so no manual sign-in
 * step is required. The harness uses an isolated fixture database so the E2E
 * run never touches the normal development data.
 */
export default defineConfig({
  testDir: "./scripts/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/gateway/health/live",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NODE_ENV: "development",
      GATEWAY_ACCESS_TOKEN: "kantha-dev-workspace-access-token-32chars",
      GATEWAY_SECRET_KEY: "HLOzSgDBTAkmHeKDQ9R0pr4UxiR++7e6pcGJsBUnD9o=",
      GATEWAY_DB_PATH: ".gateway-data/gateway.e2e.sqlite",
      GATEWAY_MAX_DAILY_TOKENS: "200000",
    },
  },
});
