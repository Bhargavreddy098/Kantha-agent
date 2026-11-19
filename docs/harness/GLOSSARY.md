## Glossary
This glossary uses the terminology in the [harness specification](HARNESS.md) and [feature contracts](features/README.md).

### Core Concepts

* **Harness**: The complete infrastructure surrounding an AI model that enables reliable execution, comprising five subsystems: Instructions, Tools, Environment, State, and Feedback.
* **Capability Gap**: The difference between an AI model's benchmark performance and its real-world engineering performance.
* **Verification Gap**: The difference between an agent claiming a task is complete and its actual correctness.
* **Harness-Induced Failure**: A system failure caused by inadequate infrastructure (e.g., poor state management, lack of verification) rather than model limitations.
* **Diagnostic Loop**: The cycle of execute, observe, identify the cause, fix the harness, and execute again.
* **Definition of Done**: Explicit, testable conditions required to mark a task as completed.
* **Knowledge Visibility Gap**: The disconnection between knowledge discussed in chat sessions and the authoritative information available in the repository.
* **Bootstrap (Initialization) Phase**: The phase at the start of a session where the agent understands the working environment before modifying code.
* **Overreach**: The failure mode where an agent does more than requested, modifying unrelated functionality.
* **Under-finish**: The failure mode where an agent stops before the feature is actually complete and reports success prematurely.
* **System of Record**: The principle that the repository must contain the authoritative information required to build the product.
