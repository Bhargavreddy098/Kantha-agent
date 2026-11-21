# Target Backend Architecture & Structure

**Status:** PROPOSED ARCHITECTURE  
**Date:** 2026-11-21  
**Auditor:** Principal TypeScript Architect, Backend Engineer & AI Agent Runtime Architect  

---

## 1. Architectural Boundaries & Principles

Kantha enforces clean, non-negotiable boundaries between three principal tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Gateway Tier                     │
│  - Authentication, Workspace Grants, Session Tokens         │
│  - Encrypted Secret Vault & Provider Credentials            │
│  - Two-Phase Attempt Ledger (Reserve / Settle)              │
│  - SSRF-Safe Egress Firewall                                │
│  - Public API & SSE Event Distribution                      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Injected Contracts (SPI)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Native Harness Tier                      │
│  - Session Inbox & Idempotent Submission Admission          │
│  - Generation-Fenced Leases (Single Writer per Session)     │
│  - Autonomous Agent Reasoning Loop                          │
│  - Write-Ahead Action Intent & Append-Only Journal          │
│  - Context Engineering, Skill Loading & Token Budgets       │
│  - Safe Tool Registry (capUtf8, Sequential Batches)         │
│  - Isolated Git Worktree Sandbox & Path Guard               │
│  - Deterministic Verifier & Interruption Recovery           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Provider-Neutral Tool Contracts
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 External Capability Adapters                │
│  - Orgo Cloud Computers (Linux, macOS, Windows)             │
│  - Composio Connectors & Provider-Neutral MCP Client        │
│  - AgentMail (Inboxes, Messages, Calendar)                  │
│  - AgentPhone (SMS, MMS, WhatsApp, Voice Calls)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Recommended Target Folder Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   ├── route.ts                 # Unified chat streaming endpoint
│   │   │   └── models/route.ts          # Decorated model catalog
│   │   ├── upload/
│   │   │   └── route.ts                 # File upload & document extraction
│   │   └── gateway/
│   │       ├── access/                  # Auth token exchange & cookies
│   │       ├── approvals/               # Operator approvals ([id])
│   │       ├── connections/             # LLM provider connections ([id], test, discover)
│   │       ├── events/                  # Real-time SSE updates
│   │       ├── harness/                 # Harness lifecycle (runs, runs/[id], recover)
│   │       ├── health/                  # Health probes (live, ready)
│   │       ├── runs/                    # Run control (runs/[id]/cancel)
│   │       ├── sessions/                # Session lifecycle ([id])
│   │       ├── status/                  # Subsystem status & capacity metrics
│   │       └── usage/                   # Budget and token accounting reports
│
├── lib/
│   ├── gateway/                         # SOVEREIGN AUTHORITY
│   │   ├── contracts/                   # Data schemas, error types, and validation
│   │   │   ├── access.ts
│   │   │   ├── adapters.ts
│   │   │   ├── approval.ts
│   │   │   ├── connection.ts
│   │   │   ├── errors.ts
│   │   │   ├── event.ts
│   │   │   ├── health.ts
│   │   │   ├── index.ts
│   │   │   ├── model.ts
│   │   │   ├── run.ts
│   │   │   ├── session.ts
│   │   │   ├── usage.ts
│   │   │   └── validation.ts
│   │   ├── server/                      # Server-side authority implementations
│   │   │   ├── access.ts                # Cookie & token crypto
│   │   │   ├── approval-service.ts      # Operator approval transitions
│   │   │   ├── capacity.ts              # Concurrency semaphores
│   │   │   ├── connection-store.ts      # Provider CRUD
│   │   │   ├── ingress.ts               # withGatewayIngress security perimeter
│   │   │   ├── lifecycle.ts             # Process lifecycle manager
│   │   │   ├── registry.ts              # Server DI container
│   │   │   ├── secret-store.ts          # AES-GCM credential vault
│   │   │   ├── usage-service.ts         # Attempt reservation & settlement
│   │   │   └── storage/
│   │   │       └── database.ts          # SQLite/Postgres persistence
│   │   ├── providers/                   # Egress and provider adapters
│   │   │   ├── egress.ts                # SSRF firewall
│   │   │   ├── language-model.ts        # Outbound LLM HTTP stream adapter
│   │   │   ├── model-catalog.ts         # Remote & static model registry
│   │   │   ├── pricing.ts               # Token pricing ledger
│   │   │   └── connection-test.ts       # Provider ping verification
│   │   └── runs/                        # Session state & distribution
│   │       ├── event-feed.ts            # SSE event broker
│   │       ├── session-service.ts       # Public run ID and submission outbox
│   │       └── state.ts                 # Run state transitions
│   │
│   ├── harness/                         # AUTONOMOUS AGENT RUNTIME
│   │   ├── contracts.ts                 # SPI interfaces (IHarnessStore, IHarnessInference, etc.)
│   │   ├── create.ts                    # Harness DI factory
│   │   ├── agent/
│   │   │   ├── runner.ts                # Core reasoning & execution loop
│   │   │   ├── tokens.ts                # Token allocation & context estimation
│   │   │   └── subagents.ts             # (Future) Delegation subsystem
│   │   ├── journal/
│   │   │   └── journal.ts               # Append-only fenced execution journal
│   │   ├── tools/
│   │   │   └── tools.ts                 # Tool registry, capUtf8, batching
│   │   ├── inference/
│   │   │   └── inference.ts             # Provider-neutral model streaming & attempt ledger
│   │   ├── sandbox/                     # Isolation boundaries
│   │   │   ├── contracts.ts
│   │   │   ├── path-guard.ts            # Traversal prevention
│   │   │   ├── stream-limiter.ts        # Output memory limits
│   │   │   └── worktree.ts              # Ephemeral Git worktree isolation
│   │   ├── service.ts                   # Gateway-facing submission & projection service
│   │   └── gateway-adapter.ts           # Storage & projection bridge
│   │
│   ├── integrations/                    # EXTERNAL CAPABILITY ADAPTERS
│   │   ├── computers/
│   │   │   └── orgo/                    # Orgo Cloud Computers adapter
│   │   │       ├── client.ts            # Orgo REST client
│   │   │       ├── prompt.ts            # Vision & action prompting
│   │   │       └── service.ts           # Computer agent task runner
│   │   ├── connectors/
│   │   │   └── composio/                # (Future) Composio & MCP client
│   │   └── comms/
│   │       ├── mail/                    # (Future) AgentMail adapter
│   │       └── phone/                   # (Future) AgentPhone adapter
│   │
│   └── client/                          # BROWSER CLIENT LIBRARIES
│       ├── gateway-client.ts            # Base gatewayRequest HTTP client
│       ├── harness-client.ts            # Browser client for Harness endpoints
│       └── chat-store.ts                # IndexedDB client cache
│
└── tests/                               # TEST INFRASTRUCTURE (Separated from src/)
    ├── fixtures/
    │   ├── gateway/
    │   └── harness/
    └── scripts/
```

---

## 3. Migration Invariants

1. **No OpenCode Runtime Dependency:** The Harness is 100% native TypeScript.
2. **Gateway Retains Sole Authority:** Provider secrets and billing admission stay strictly in `src/lib/gateway/server/`.
3. **Zero Test Mocks in Production Tree:** Fixtures and test assertions live in `tests/`, keeping production bundles lean.
4. **No Empty Directory Bloat:** Directories under `integrations/` are only created when their implementation task is active.
