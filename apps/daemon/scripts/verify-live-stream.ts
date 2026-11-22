import { Effect, Stream } from "effect";
import { createKanthaDb } from "@kantha/db";
import { GatewayService, ProviderStore } from "@kantha/gateway";
import { createDaemonGatewayLayer } from "../src/services/gateway";
import path from "node:path";

async function main() {
  console.log("=== Starting Live Gateway Upstream Probe ===");
  const dataDir = path.resolve(process.cwd(), "../../.kantha-data");
  const { db, sqlite } = await createKanthaDb({ dbPath: path.join(dataDir, "kantha.sqlite") });

  const daemonLayer = createDaemonGatewayLayer({ db, dataDir });

  const program = Effect.scoped(
    Effect.gen(function* () {
      const providerStore = yield* ProviderStore;
      const gateway = yield* GatewayService;

      const provider = yield* providerStore.getProvider("custom_1795364174019_q6zh");
      if (!provider) {
        throw new Error("Provider custom_1795364174019_q6zh not found in store");
      }
      console.log(`Resolved provider: ${provider.name} (${provider.baseURL})`);

      console.log("Dispatching streaming inference request for model 'hy4-flash:free' with prompt 'hii'...");
      const stream = yield* gateway.stream({
        providerId: provider.id,
        modelId: "hy4-flash:free",
        messages: [{ role: "user", content: "hii" }],
        attribution: { sessionId: "verify-live-session", turnId: "turn-live-1" },
      });

      let collectedText = "";
      let chunkCount = 0;

      yield* Stream.runForEach(stream, (delta) =>
        Effect.sync(() => {
          chunkCount++;
          if (delta.text) {
            collectedText += delta.text;
            process.stdout.write(delta.text);
          }
          if (delta.reasonings && delta.reasonings.length > 0) {
            for (const r of delta.reasonings) {
              if (r.text) process.stdout.write(`[thinking: ${r.text}]`);
            }
          }
          if (delta.usage) {
            console.log(`\n[Usage reported: input=${delta.usage.inputTokens}, output=${delta.usage.outputTokens}]`);
          }
        })
      );

      console.log(`\n\nTotal chunks received: ${chunkCount}`);
      console.log(`Collected response:\n"${collectedText}"`);
      return collectedText;
    })
  );

  await Effect.runPromise(program.pipe(Effect.provide(daemonLayer)));

  // Allow a moment for background ledger settlement finalizer
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n=== Checking usage_ledger in SQLite ===");
  const rows = sqlite.query("SELECT * FROM usage_ledger ORDER BY timestamp DESC LIMIT 3").all();
  console.log("Recent usage_ledger rows:", JSON.stringify(rows, null, 2));

  if (rows.length > 0 && rows[0].model_id === "hy4-flash:free") {
    console.log(" SUCCESS: usage_ledger row verified for hy4-flash:free!");
  } else {
    console.warn(" WARNING: Latest usage_ledger row does not match hy4-flash:free");
  }

  console.log("\n=== Testing handleChatStreamRequest HTTP SSE Route ===");
  const { EventEmitter } = await import("node:events");
  const { handleChatStreamRequest } = await import("../src/api/chat");
  const { ProviderRegistry } = await import("../src/services/providerRegistry");

  const registry = new ProviderRegistry({ dataDir });
  const req = new EventEmitter() as any;
  req.method = "POST";
  req.headers = { "content-type": "application/json" };

  const res = new EventEmitter() as any;
  res.headers = {};
  res.statusCode = 200;
  res.headersSent = false;
  res.writableEnded = false;
  let httpSseOutput = "";

  res.writeHead = (status: number, headers?: any) => {
    res.statusCode = status;
    res.headers = headers || {};
    res.headersSent = true;
    console.log(`HTTP Status: ${status}, Headers:`, headers);
  };
  res.write = (chunk: string) => {
    httpSseOutput += chunk;
    process.stdout.write(chunk);
    return true;
  };
  res.end = (chunk?: string) => {
    if (chunk) httpSseOutput += chunk;
    res.writableEnded = true;
    console.log("\nHTTP Response Ended.");
  };
  res.flushHeaders = () => {
    console.log("res.flushHeaders() called!");
  };

  await handleChatStreamRequest(req, res, {
    providerRegistry: registry,
    gatewayLayer: daemonLayer,
  });

  const payload = {
    model: "custom_1795364174019_q6zh:hy4-flash:free",
    messages: [{ role: "user", content: "hii" }],
    sessionId: "verify-http-session",
  };
  req.emit("data", JSON.stringify(payload));
  req.emit("end");

  // Wait for stream to finish
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  if (httpSseOutput.includes("data: [DONE]\n\n") && res.statusCode === 200) {
    console.log(" SUCCESS: handleChatStreamRequest HTTP SSE stream verified with [DONE]!");
  } else {
    throw new Error("HTTP SSE stream verification failed!");
  }
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
