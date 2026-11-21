# HAR-010 sandbox tasks

[Feature spec](SPEC.md) · [Current state](../../../CURRENT_STATE.md)

| Task | Independently verifiable result | Prerequisites |
| --- | --- | --- |
| [HAR-010-01](tasks/HAR-010-01.md) | Contracts, path guard and bounded output fixtures. [Recorded evidence](../../../handoffs/HAR-010-01.md) | HAR-001 contracts |
| [HAR-010-02](tasks/HAR-010-02.md) | A run-owned Git worktree with baseline metadata and recoverable cleanup. | HAR-010-01 |
| [HAR-010-03](tasks/HAR-010-03.md) | A driver that creates, executes in and removes a restricted Kiri session. | HAR-010-01 and Kiri design approval |
| [HAR-010-04](tasks/HAR-010-04.md) | An authorized Harness execution path verified against the live sandbox and interrupted-run recovery. | HAR-010-02, HAR-010-03 and H2 release qualification |

Tasks 02 and 03 each consume the contracts from task 01. Task 04 consumes both adapters. Open each task for implementation status, scope and verification. The [workspace contract](../../../harness/features/WORKSPACE.md) covers the broader production workspace profile, including baseline materialization and scoped repository edits.
