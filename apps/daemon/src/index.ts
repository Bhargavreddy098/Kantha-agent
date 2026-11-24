import path from "node:path";
import { startDaemonServer } from "./api/router";

const port = Number(process.env.PORT) || Number(process.env.KANTHA_DAEMON_PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
let workspacePath = process.env.KANTHA_WORKSPACE_PATH || process.cwd();
if (workspacePath.endsWith("apps\\daemon") || workspacePath.endsWith("apps/daemon")) {
  workspacePath = path.resolve(workspacePath, "../..");
}

await startDaemonServer({
  port,
  host,
  workspacePath,
  devOriginAllowed: process.env.NODE_ENV !== "production",
});
