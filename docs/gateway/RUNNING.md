# Running the Kantha Local Daemon & Workbench

Kantha uses an **automated local-first architecture** modeled after modern coding assistants (OpenCode, Cursor, Claude Code). There are **no manual access tokens, no login forms, and no cloud databases to configure**.

## Quick Start (Zero-Friction Launch)

Run the daemon and web workbench concurrently:

```bash
# Start both daemon and web workbench
pnpm dev

# Or run them individually:
pnpm dev:daemon   # Starts Bun Effect Daemon on http://localhost:4000
pnpm dev:web      # Starts Vite React 19 Workbench on http://localhost:3000
```

Open `http://localhost:3000` in your browser. The web workbench **automatically authenticates via loopback trust** and instantly auto-discovers your local git repository and active branch.

---

## How Modern Coding Assistants Automate This

### 1. Zero-Touch Loopback Trust (No Manual Access Tokens)
Legacy tools forced developers to generate random tokens via shell commands (`node -e "..."`), copy them into clipboard, and paste them into a blocking login form (`"Workspace access token"`). If the server was slow or restarted, users got locked out with:
> *"Workspace access is unavailable. Try signing in again."*

**Modern Automated Approach:**
- Kantha binds to the developer's local loopback network (`127.0.0.1` / `localhost`).
- The Web Workbench executes an automated handshake with `/api/auth/handshake` on mount.
- Requests originating from the local machine are granted immediate local operator access.
- Ephemeral session tokens are rotated transparently under `.kantha-data/auth_token` without prompting the user.

### 2. Automatic Workspace & Git Discovery
- The daemon automatically discovers:
  - Repository name (e.g. `kantha-agent`)
  - Active Git branch (e.g. `main`, `feat/auth`)
  - Project file tree and package structure
- The workbench header immediately displays the active workspace and git status pill:
  `📁 kantha-agent` • `🌿 main` • `🟢 Local Trust Active`

### 3. Automated Model Provider Egress
- Rather than demanding a "workspace token", Kantha inspects local environment variables and local inference servers:
  - `ANTHROPIC_API_KEY` (Claude 3.7 Sonnet, Claude 3.5 Sonnet)
  - `OPENAI_API_KEY` (GPT-4o, o3-mini)
  - Local Ollama (`http://localhost:11434`) for offline local LLMs
- Detected providers are surfaced in the Model Selector without blocking the workspace UI.

### 4. Self-Healing Daemon Connection
- If the daemon process is restarting or offline, the UI does **not** fail with an unrecoverable login error.
- The workbench displays a clean connection health banner with an automated retry loop:
  `🟡 Connecting to Kantha Local Daemon on :4000... (Auto-reconnecting)`
- Once the daemon is started with `pnpm dev:daemon`, the UI transitions smoothly to `🟢 Local Trust Active` in real-time.

---

## Configuration (`.env`)

Add model provider keys to `.env` in the root directory (optional if using local Ollama):

```env
# Optional Cloud Model Provider Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Daemon Port (defaults to 4000)
PORT=4000

# Local Data & SQLite Storage Path (defaults to .kantha-data)
KANTHA_DATA_DIR=.kantha-data
```
