# Run the Kantha gateway

Use Node.js 24, npm and a persistent filesystem. The Next.js Node process serves the dashboard, same-origin API and provider streams. A local or single-instance deployment is the supported starting point for this build.

## Local setup

1. Copy the gateway settings in [the environment example](../../.env.example) into `.env.local` alongside any application settings you already use. Set `GATEWAY_ACCESS_TOKEN` to an independent random access token. Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` to generate one. Use the token to sign in to the app. Provider keys are entered separately in Settings.
2. Run `npm install` if dependencies are absent, then `npm run dev`. Open the origin printed by Next.js. If you set `GATEWAY_ORIGIN`, it must match that browser origin, including the port.
3. Open **Settings → Model providers**. Add a connection and enter the provider Base URL and API key. Save, test and discover models. **Chat** lists discovered models from active connections. Configure an exact private origin in `GATEWAY_PRIVATE_ORIGINS` to use an explicitly approved local test provider.
4. Send a prompt in **Chat**. Stop requests cancellation from the server and retains partial output. Reload to recover the conversation, run status and any pending decision. **Try approval** creates a separate inert tool run. **Settings → Usage** reports admitted attempts and measured usage.

## Deployment settings

| Setting | Purpose |
|---|---|
| `GATEWAY_ACCESS_TOKEN` | Random owner token for a single workspace. Minimum 32 URL-safe characters. Rotate it to revoke existing sessions. |
| `GATEWAY_WORKSPACE_ID` | Workspace for the single-owner mode. Defaults to `kantha`. |
| `GATEWAY_MEMBERS` | JSON array of provisioned `{actorId, workspaceId, role, tokenSha256}` entries. Role is `owner` or `member`. It takes precedence over single-owner configuration. Use a distinct random token per membership and store the lowercase SHA-256 digest. Treat the configuration as sensitive. Owners manage provider connections. |
| `GATEWAY_ORIGIN` | Canonical app origin. Set the HTTPS origin explicitly when deploying behind a reverse proxy. Loopback can use HTTP. Keep request paths and SSE streaming on this origin. |
| `GATEWAY_DB_PATH` | Durable SQLite file on a persistent volume. Defaults to `.gateway-data/gateway.sqlite`. |
| `GATEWAY_SECRET_KEY` | Base64 of 32 random bytes. Required in production. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Development generates a separate local key file when this setting is absent. Back up the key separately and retain it when restoring the database. |
| `GATEWAY_PRIVATE_ORIGINS` | Comma-separated exact trusted private or HTTP origins. Public providers use HTTPS. Provider transport pins approved IPv4 targets and rejects redirects. |
| `GATEWAY_MAX_ACTIVE_INFERENCE` / `GATEWAY_MAX_WORKSPACE_INFERENCE` | Concurrent inference slots per process and per workspace within that process. Defaults are 32 and 4. |
| `GATEWAY_MAX_ACTIVE_EVENT_STREAMS` / `GATEWAY_MAX_WORKSPACE_EVENT_STREAMS` | Concurrent event subscriptions per process and per workspace within that process. Defaults are 128 and 12. |
| `GATEWAY_MAX_DAILY_TOKENS` | Per-workspace UTC day ceiling. Defaults to 200,000. Admission accounts for active reservations and estimates when provider usage is unavailable. |
| `GATEWAY_MODEL_PRICES` | Optional JSON object keyed by `providerType:modelId` or `connectionId:modelId`. Each value has numeric `inputPerMillion` and `outputPerMillion` USD rates. Rates are operator-provided. |
| `GATEWAY_MAX_DAILY_BUDGET_USD` | Optional per-workspace USD ceiling. When set, an unpriced model is denied at admission. |

Capacity settings take positive integers and are read when the gateway starts. Status reports occupancy for the caller’s workspace on the serving process. The [system design guide](SYSTEM-DESIGN.md) describes the HTTP overload contract and replica considerations.

## Provider inference and uploads

Chat uses the Vercel AI SDK for OpenAI, Anthropic and OpenAI-compatible provider connections. Sign in and save a connection in Settings to use it. For deployments that previously used `OPENAI_API_KEY`, `OPENAI_API_BASE_URL` and `OPENAI_MODEL`, enter the equivalent values in a saved provider connection and discover or select the model there.

Both chat routes return AI SDK UI-message streams. The browser keeps a local transcript in IndexedDB, and the gateway journals submitted message content, including image data and extracted document text, with the workspace session. Treat gateway storage and backups as conversation data.

| Setting | Purpose |
|---|---|
| `UPLOAD_MAX_FILE_SIZE_MB` | Per-file upload cap (1–50 MB). Defaults to 20. |
| `UPLOAD_MAX_TEXT_LENGTH` | Extracted document text cap in characters (1,000–400,000). Defaults to 100,000. |

## Health and release checks

- `/api/gateway/health/live` checks the HTTP process. `/api/gateway/health/ready` checks access configuration and storage and returns 503 while unavailable. Protected status and usage are rendered in Settings.
- Run `npm run lint`, `npm run test:gateway`, `npm run build`, then `npm run test:routes` and `npm run test:chat`. The route test starts the production build against isolated temporary SQLite storage and a synthetic loopback provider. It covers transport, scoped access, capacity and slot recovery, provider setup, budget denial, cancellation, event replay and approval recovery across a restart. The chat test covers AI SDK streaming for compatible and native Anthropic fixtures, image input, cancellation, safe errors, the workspace model catalog and upload extraction.
- Verify the intended deployment separately with a persistent volume, TLS, proxy streaming, an actual provider/model, backup and restore, and monitored startup and shutdown. Protect the database and WAL files as conversation and audit data. Use a SQLite-consistent backup procedure.
- Future integration work includes the [OpenTelemetry and SigNoz path](../harness/features/OPERATIONS.md), the [shared PostgreSQL deployment profile](../harness/features/PERSISTENCE.md), an OpenWorker Harness adapter and product delegation. The shipped runtime uses application-owned chat and an inert approval tool. Shell, filesystem, MCP and native provider-protocol endpoints are outside this release scope.

See [performance profiling and deployment](../PERFORMANCE.md) for measurement, caching, and static asset setup.
