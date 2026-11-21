# Spec: kiri-sandbox (Execution Sandbox & Workspace Isolation)

**Module ID:** `kiri-sandbox`  
**Parent Initiative:** Kantha Autonomous Coding Engine Modernization  
**Architecture Domain:** Harness Subsystem (`src/lib/harness/sandbox/`)  
**Specification Level:** Level 2 — Implementation Specification  
**Status:** DRAFT — Awaiting Human Approval (Gate 1)  

---

## 1. Objective

Provide a robust, hardware-isolated execution sandbox for all autonomous agent tool executions and shell commands using **Kiri** (`libracoder/kiri`), a lightweight Rust-based microVM container runtime.

### The Problem
When coding agents execute AI-generated code or shell commands:
1. **Application-level permissions are insufficient:** Clicking "Approve `npm test`" in the UI does not stop a malicious postinstall script or rogue test from accessing host credentials (`~/.ssh`, `~/.aws`, `.env`) or installing persistent backdoors.
2. **Traditional container runtimes are too heavy:** Standard Docker Desktop takes seconds to boot, consumes gigabytes of background memory, and drains battery, making it prohibitive for fast local agent loops.
3. **Unconfined worktrees leak:** Plain Git worktrees isolate the Git branch, but still run in the host shell with full access to host files, host network, and host environment variables.

### The Solution: Kiri MicroVM Sandboxing
Kiri boots a tailored 10MB Linux kernel in ~2.5ms and exposes a standard Docker Engine API. Kantha uses Kiri to enforce a true OS/hypervisor boundary:
- Ephemeral Git worktrees are mounted at `/workspace`.
- Host filesystem and host credentials are completely excluded.
- The root filesystem is read-only.
- Linux capabilities are dropped (`DROP ALL`).
- Memory, CPU, and process count (PIDs) are hard-capped via cgroups v2.
- Outbound network access is disabled by default (`--network none`).

---

## 2. Tech Stack

| Component | Technology | Version / Requirement | Justification |
|---|---|---|---|
| **Host Runtime** | Kiri (`libracoder/kiri`) | Native binary (macOS / Windows / Linux) | Rust-based microVM; ~2.5ms startup; auto-sleeps at 0% CPU; 100% Docker API compatible. |
| **API Client** | `dockerode` | `^3.3.5` | Standard Node.js Docker API client communicating over Unix socket or Windows named pipe. |
| **Type Definitions**| `@types/dockerode` | `^3.3.38` | Strict TypeScript types for container and exec lifecycles. |
| **Workspace Base** | Host Git CLI | 2.5+ (worktree support) | Spawns isolated branch worktrees under `.gateway-data/workspaces/<runId>`. |
| **Path Guard** | Node.js `node:fs` & `node:path` | Node.js 24 LTS | Realpath canonicalization to prevent path traversal and symlink escapes before mounting. |
| **Output Bounding** | Buffer streams (`node:stream`) | Node.js 24 LTS | Strict 8,192-byte head/tail output bounding with full log spillover to disk. |

---

## 3. Commands

| Action | Executable Command | Description |
|---|---|---|
| **Build** | `npm run build` | Compiles Next.js and server harness packages. |
| **Test Unit** | `node --test scripts/test-kiri-sandbox.mjs` | Tests sandbox driver contracts, path guards, and mock Docker API payloads. |
| **Test Integration**| `node scripts/test-kiri-sandbox-live.mjs` | Spawns a real test container in Kiri and verifies command isolation and credential exclusion. |
| **Lint** | `npm run lint` | Enforces ESLint and TypeScript boundary checks. |
| **Check Kiri Daemon**| `curl --unix-socket /var/run/docker.sock http://localhost/info` | Probes Kiri daemon health via Docker Engine API (on Windows: named pipe probe). |

---

## 4. Project Structure

```
src/lib/harness/sandbox/
├── contracts.ts          # ISandboxDriver, SandboxExecutionOptions, SandboxResult contracts
├── kiri-driver.ts        # Kiri Docker Engine API client (dockerode connection, container pool)
├── worktree.ts           # Git worktree lifecycle (create, baseline diff, prune, delete)
├── path-guard.ts         # Symlink resolution and path boundary validator (realpathSync)
├── stream-limiter.ts     # 8KB head/tail buffer truncate with artifact file logging
└── index.ts              # Unified sandbox factory & export seam

scripts/
├── test-kiri-sandbox.mjs       # Unit & mock fixture verification suite
└── test-kiri-sandbox-live.mjs  # Live Kiri integration verification test

docs/specs/
├── CAPABILITY-MAP.md           # Master coding engine decomposition
└── SPEC-kiri-sandbox.md        # This specification document

docs/decisions/
└── ADR-006-kiri-microvm-execution-sandbox.md # Formal Architecture Decision Record
```

---

## 5. Code Style & Implementation Pattern

### 5.1 Sandbox Interface Contract (`contracts.ts`)

```typescript
export interface SandboxExecutionOptions {
  runId: string;
  command: string[];
  worktreePath: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  allowNetwork?: boolean;
}

export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
  timedOut: boolean;
}

export interface ISandboxDriver {
  /** Check if Kiri daemon is running and responsive */
  ping(): Promise<boolean>;
  /** Initialize an isolated container for a run mounted to its worktree */
  createSession(runId: string, worktreePath: string): Promise<string>;
  /** Execute a command inside the container */
  exec(sessionId: string, options: SandboxExecutionOptions): Promise<SandboxExecutionResult>;
  /** Teardown and destroy the container session */
  destroySession(sessionId: string): Promise<void>;
}
```

### 5.2 Kiri Driver Implementation Pattern (`kiri-driver.ts`)

```typescript
import Docker from 'dockerode';
import { ISandboxDriver, SandboxExecutionOptions, SandboxExecutionResult } from './contracts';
import { validateScopedPath } from './path-guard';
import { BoundedOutputBuffer } from './stream-limiter';

export class KiriSandboxDriver implements ISandboxDriver {
  private docker: Docker;

  constructor() {
    // Kiri exposes standard Docker API on platform socket / named pipe
    const isWindows = process.platform === 'win32';
    this.docker = new Docker(
      isWindows
        ? { socketPath: '//./pipe/docker_engine' }
        : { socketPath: '/var/run/docker.sock' }
    );
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async createSession(runId: string, worktreePath: string): Promise<string> {
    const canonicalWorktree = validateScopedPath(worktreePath);

    const container = await this.docker.createContainer({
      Image: 'kantha-sandbox-base:latest',
      Cmd: ['tail', '-f', '/dev/null'], // Keep alive for run duration
      Tty: false,
      User: '1000:1000', // Non-root
      NetworkDisabled: true, // Block network by default
      HostConfig: {
        Binds: [`${canonicalWorktree}:/workspace:rw`],
        ReadonlyRootfs: true,
        CapDrop: ['ALL'], // Drop all Linux capabilities
        Memory: 2 * 1024 * 1024 * 1024, // 2 GB hard cap
        NanoCpus: 2 * 1000000000, // 2.0 cores
        PidsLimit: 256, // Prevent fork bombs
        AutoRemove: true,
      },
      WorkingDir: '/workspace',
    });

    await container.start();
    return container.id;
  }

  async exec(sessionId: string, options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const container = this.docker.getContainer(sessionId);
    const exec = await container.exec({
      Cmd: options.command,
      AttachStdout: true,
      AttachStderr: true,
      User: '1000:1000',
      WorkingDir: '/workspace',
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    const buffer = new BoundedOutputBuffer(8192);

    const startTime = Date.now();
    // Demux multiplexed Docker stdout/stderr stream with timeout
    const result = await buffer.captureWithTimeout(stream, options.timeoutMs ?? 30000);

    const inspectData = await exec.inspect();
    return {
      exitCode: inspectData.ExitCode ?? 0,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
      durationMs: Date.now() - startTime,
      timedOut: result.timedOut,
    };
  }

  async destroySession(sessionId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(sessionId);
      await container.stop({ t: 1 });
      await container.remove({ force: true });
    } catch {
      // Container may have already terminated
    }
  }
}
```

---

## 6. Testing Strategy

1. **Unit Tests (`scripts/test-kiri-sandbox.mjs`):**
   - Verify path canonicalization rejects symlinks pointing to `~/.ssh`, `~/.aws`, or parent directories (`../../`).
   - Mock Docker socket responses to verify container configuration payload:
     - Assert `User: '1000:1000'`.
     - Assert `ReadonlyRootfs: true`.
     - Assert `CapDrop: ['ALL']`.
     - Assert `PidsLimit: 256`.
     - Assert `NetworkDisabled: true`.
   - Verify `BoundedOutputBuffer` truncates streams exceeding 8,192 bytes while preserving head and tail.

2. **Integration Tests (With Live Kiri Daemon):**
   - Ping test: Verify Kantha detects running Kiri daemon within 10ms.
   - Filesystem test: Attempt to write to `/root` or `/etc` inside container — assert `EACCES` / read-only filesystem error.
   - Traversal test: Verify host files outside `/workspace` cannot be read or listed.
   - Resource test: Run a fork bomb (`:(){ :|:& };:`) — assert container PID limit stops it without freezing the host.
   - Timeout test: Run `sleep 60` with a 1,000ms timeout — assert execution is halted and `timedOut: true` is returned.

---

## 7. Boundaries

- **Always:**
  - Mount only the validated Git worktree path into `/workspace`.
  - Enforce `ReadonlyRootfs: true` and `CapDrop: ['ALL']`.
  - Cap memory at 2GB, CPU at 2.0 cores, and PIDs at 256.
  - Truncate command output to 8,192 bytes before returning to the Harness journal or UI.
  - Teardown containers and prune Git worktrees upon run finalization or failure.
- **Ask First:**
  - Granting temporary outbound network access (e.g. allowing npm registry downloads).
  - Mounting extra volumes or caches (e.g. persistent `.pnpm-store`).
- **Never:**
  - Mount host home directory (`~`), host root directory, or host `.git` folder.
  - Run container processes as `root` (UID 0) or enable `--privileged`.
  - Pass host environment variables or credentials directly into the container.

---

## 8. Success Criteria

1. **Isolation Verification:** An intentional `cat ~/.ssh/id_rsa` or `cat .env` inside the sandbox returns "No such file or directory" or permission denied.
2. **Speed & Latency:** Container creation and initial command execution in Kiri completes in `< 50ms` (compared to >2,000ms in Docker Desktop).
3. **Zero Host Leakage:** Agent file edits are applied strictly within `.gateway-data/workspaces/<runId>` worktree and are invisible in the developer's working directory until explicitly committed or approved.
4. **Resilience:** Uncaught infinite loops or memory allocations terminate cleanly after `timeoutMs` without leaving orphan host processes.

---

## 9. Open Questions for Human Review

1. **Base Sandbox Image:** Should Kantha provide a lightweight pre-built Dockerfile (e.g., Node.js 24 + Git + Ripgrep based on Alpine or Debian slim) that Kiri pulls/builds on first run, or should it pull a published image from GHCR?
2. **Package Manager Cache:** By default, `--network none` and an ephemeral `/workspace` mean `npm install` inside the sandbox would re-download packages on every run. Should we provide a read-only bind-mount for a host npm/pnpm global store, or keep it completely air-gapped?
3. **Fallback Mode:** If Kiri is not running on a developer machine during local development, should Kantha:
   - Option A: Refuse execution until Kiri is started (strict security).
   - Option B: Fallback to Tier 1 Git worktrees with unconfined Node child processes (with an explicit warning banner in the UI)?
