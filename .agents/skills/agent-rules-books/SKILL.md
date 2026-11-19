---
name: agent-rules-books
description: Apply a book-specific engineering rule set to architecture, reliability, data-intensive design, domain modeling, refactoring, or legacy-code work in Kantha. Use when a book is named or one of its methods directly fits the task.
---

# Agent Rules Books

Choose the mini rule set that best fits the task. Read it before making design decisions. Add a second rule set only when it addresses a distinct part of the task. Apply the guidance within the user's scope and Kantha's repository instructions.

For gateway reliability work, start with Release It! For durable state, event replay, transactional boundaries, or consistency, start with Designing Data-Intensive Applications. Use the gateway's current contracts and system design guide to determine what has shipped.

| Rule set | Use it for |
| --- | --- |
| [A Philosophy of Software Design](references/a-philosophy-of-software-design.mini.md) | Module depth, interfaces, and complexity |
| [Clean Architecture](references/clean-architecture.mini.md) | Dependency direction and application boundaries |
| [Clean Code](references/clean-code.mini.md) | Readability, naming, and responsibilities |
| [Code Complete](references/code-complete.mini.md) | Construction, defensive programming, and verification |
| [Designing Data-Intensive Applications](references/designing-data-intensive-applications.mini.md) | Transactions, consistency, streams, and schema evolution |
| [Domain-Driven Design](references/domain-driven-design.mini.md) | Ubiquitous language and bounded contexts |
| [Domain-Driven Design Distilled](references/domain-driven-design-distilled.mini.md) | Lightweight domain and context modeling |
| [Implementing Domain-Driven Design](references/implementing-domain-driven-design.mini.md) | Aggregates, domain events, and integrations |
| [Patterns of Enterprise Application Architecture](references/patterns-of-enterprise-application-architecture.mini.md) | Service, persistence, and integration patterns |
| [Refactoring](references/refactoring.mini.md) | Behavior-preserving structural changes |
| [Refactoring.Guru](references/refactoring-guru.mini.md) | Code smells and technique selection |
| [Release It!](references/release-it.mini.md) | Timeouts, overload, isolation, and recovery |
| [The Pragmatic Programmer](references/the-pragmatic-programmer.mini.md) | Engineering trade-offs and fast feedback |
| [Working Effectively with Legacy Code](references/working-effectively-with-legacy-code.mini.md) | Characterization tests and safe seams |

These MIT-licensed rule sets come from [Agent Rules Books](https://github.com/mattpocock/agent-rules-books/tree/a7d7649044505b9c377c8dca28d2d6a543bc7f8c). The local wrapper selects the relevant rule set. The reference files preserve the upstream text, and the [license](LICENSE) records attribution.
