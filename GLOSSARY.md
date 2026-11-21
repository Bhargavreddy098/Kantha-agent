## Glossary
This file defines the domain terminology for Kantha Harness Engineering.

### Core Concepts

* **Harness**: The complete infrastructure surrounding an AI model that enables reliable execution, comprising five subsystems: Instructions, Tools, Environment, State, and Feedback.
* **Capability Gap**: The difference between an AI model's benchmark performance and its real-world engineering performance.
* **Verification Gap**: The difference between an agent claiming a task is complete and its actual correctness.
* **Harness-Induced Failure**: A system failure caused by inadequate infrastructure (e.g., poor state management, lack of verification) rather than model limitations.
* **Diagnostic Loop**: The cycle of execute, observe, identify the cause, fix the harness, and execute again.
* **Definition of Done**: Explicit, testable conditions required to mark a task as completed.
* **Knowledge Visibility Gap**: The disconnection between knowledge discussed in chat sessions and the authoritative information available in the repository.

### Authentication & Access Control

* **Automatic Local Session Authentication**: A zero-friction, cryptographic authentication model where the local daemon binds to loopback, generates a secure session secret, and grants browser access via a short-lived single-use pairing ticket without requiring manual credential entry.
  * _Avoid_: Loopback Trust, Anonymous Loopback, Implicit Localhost Trust, Manual Token Auth
* **Pairing Ticket**: A single-use, cryptographically random, short-lived (e.g. 60-second TTL) token passed via the initial launch URL that the client workbench exchanges once for an authenticated session cookie.
  * _Avoid_: Magic link, pairing code, handshake token, launch secret
* **Session Secret**: Cryptographic signing material generated in-memory by the daemon per process instance, used to issue and validate authenticated browser session cookies and WebSocket upgrade requests.
  * _Avoid_: Local token, auth token, master password
* **Authenticated Browser Session**: A server-validated local session represented by an `HttpOnly`, `SameSite=Strict`, host-only cookie (`kantha_session`) issued after pairing ticket exchange, authenticating REST, SSE, and WebSocket channels.
  * _Avoid_: Bearer token in localStorage, query param token, anonymous session
* **Origin & Host Fencing**: Strict daemon HTTP/WebSocket middleware verifying that the `Host` header exactly matches loopback and `Origin` matches authorized local workbench origins, defending against DNS rebinding and cross-site request forgery.
  * _Avoid_: Permissive CORS, open loopback, localhost whitelist
