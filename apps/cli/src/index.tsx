import React, { useState, useEffect } from "react";
import { render, Text, Box } from "ink";
import Spinner from "ink-spinner";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function getDaemonTokenPath(port: number): string {
  const baseDir =
    process.env.KANTHA_DATA_DIR ||
    path.join(os.homedir(), ".kantha");
  return path.join(baseDir, `daemon_${port}.token`);
}

interface AppProps {
  port?: number;
  openBrowser?: boolean;
}

const App: React.FC<AppProps> = ({ port = 4000, openBrowser = false }) => {
  const [daemonStatus, setDaemonStatus] = useState<"checking" | "online" | "offline">("checking");
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const daemonUrl = `http://127.0.0.1:${port}`;

  useEffect(() => {
    // 1. Read protected local CLI token
    const tokenPath = getDaemonTokenPath(port);
    let cliToken = "";
    try {
      if (fs.existsSync(tokenPath)) {
        cliToken = fs.readFileSync(tokenPath, "utf-8").trim();
      }
    } catch {
      // ignore
    }

    // 2. Probe health
    fetch(`${daemonUrl}/health`)
      .then((res) => {
        if (!res.ok) throw new Error("Offline");
        setDaemonStatus("online");

        // 3. Query authenticated workspace if token exists
        if (cliToken) {
          fetch(`${daemonUrl}/api/workspace`, {
            headers: { "X-Kantha-CLI-Token": cliToken },
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.name) setWorkspaceName(data.name);
            })
            .catch(() => {});

          // 4. Generate/fetch fresh pairing URL
          fetch(`${daemonUrl}/api/auth/regenerate-ticket`, {
            method: "POST",
            headers: { "X-Kantha-CLI-Token": cliToken },
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.pairingUrl) {
                setPairingUrl(data.pairingUrl);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => setDaemonStatus("offline"));
  }, [daemonUrl, port]);

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Kantha Agent CLI (ADR-007 Authenticated)
        </Text>
      </Box>

      <Box>
        <Text>Daemon Status ({daemonUrl}): </Text>
        {daemonStatus === "checking" && (
          <Text color="yellow">
            <Spinner type="dots" /> Connecting...
          </Text>
        )}
        {daemonStatus === "online" && (
          <Text color="green">● Online {workspaceName ? `[${workspaceName}]` : ""}</Text>
        )}
        {daemonStatus === "offline" && (
          <Text color="red">● Offline (Start daemon with: pnpm dev:daemon)</Text>
        )}
      </Box>

      {pairingUrl && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            Web Workbench Pairing Link:
          </Text>
          <Text color="white" underline>
            {pairingUrl}
          </Text>
          <Text color="gray" dimColor>
            (Single-use, 60s TTL. URL fragment delivers ticket securely without history leakage)
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Run 'kantha open' to regenerate a pairing ticket or open the workbench.</Text>
      </Box>
    </Box>
  );
};

render(<App port={Number(process.env.KANTHA_DAEMON_PORT) || 4000} />);
