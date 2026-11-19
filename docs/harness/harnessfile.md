Learn Harness Engineering — Complete Course Explanation
The central idea: A capable AI model is not enough to build reliable software. You need an engineered environment that controls how the agent understands, plans, executes, verifies, and remembers its work.

The weakest approach to AI coding is giving an agent a large prompt, pointing it at a repository, and expecting it to build production-quality software.

That approach fails because:
- The agent loses context during long tasks.
- It misunderstands existing architecture.
- It changes unrelated functionality.
- It marks incomplete work as completed.
- It does not consistently test its changes.
- A new session may repeat previous mistakes.
- There is no reliable record of what has actually been completed.
The Learn Harness Engineering course addresses these problems through environment design, state management, execution controls, verification, and observability.

The course is organized into four major learning areas:
1. Lectures: Understand why agents fail and the engineering principles behind reliable agents.
2. Projects: Build a harness incrementally through practical exercises.
3. Resource library: Reusable files such as AGENTS.md, feature_list.json, and progress documents.
4. Frontier harness breakdowns: Study how systems such as Pi, Claude Code, Codex, and DeepSeek approach harness design.
I'll explain the concepts as an engineering curriculum, then connect them to your OpenWorker/coding-assistant architecture.

Part 1. The 14 lectures explained
1. Why capable AI agents still fail
Fundamental concept
Source: Lecture 01

A model's intelligence and its ability to complete real engineering work are two different things.

Consider this request:
Build authentication for my application.

The agent must figure out:
- Which authentication system already exists?
- Where are the user models?
- Which database is being used?
- How are sessions managed?
- What security rules apply?
- Which files should be modified?
- How will authentication be tested?
The request doesn't answer these questions.

The agent fills the gaps using assumptions. Those assumptions can produce code that compiles but does not work with your actual application.
The five major failure categories
Failure	What happens
Task specification	Requirements are ambiguous
Context	Important architecture information is missing
Environment	Dependencies or runtime are misconfigured
Verification	Agent cannot prove its implementation works
State management	Agent forgets previous work

Important terminology
- Capability gap: Difference between benchmark performance and real-world performance.
- Verification gap: Difference between the agent claiming success and actual correctness.
- Harness-induced failure: A failure caused by poor infrastructure around the model.
- Diagnostic loop: Execute → observe → identify the cause → fix the harness → execute again.
- Definition of Done: Explicit, testable conditions required for completion.
What you should implement
Instead of:
Build a user authentication system.


Use:
Build the user authentication system.

Requirements:
- Email OTP authentication.
- Secure HTTP-only cookie sessions.
- Existing Supabase authentication integration.
- Role-based authorization.
- Existing API conventions must be preserved.

Verification:
- Authentication integration tests pass.
- Unauthorized requests return 401.
- Expired sessions are rejected.
- Existing functionality remains operational.
- Type checking and production build pass.


The second task reduces ambiguity and gives the agent measurable completion criteria.

My takeaway: Before upgrading the model, investigate whether your instructions, context, environment, verification, or state management are inadequate.

2. What a harness actually is
Core architecture
Source: Lecture 02

This is probably the most important lecture in the course.

A harness is not an AGENTS.md file, a system prompt, or a collection of Markdown documents.

It is the complete infrastructure surrounding an AI model that enables reliable execution.

The course identifies five subsystems.
The five-subsystem harness
AI MODEL

Reasoning and decision-making

1. Instructions

Rules, architecture, constraints, task requirements


2. Tools

Terminal, filesystem, browser, APIs, MCP


3. Environment

Runtime, dependencies, containers, workspaces


4. State

Memory, progress, checkpoints, handoffs



5. Feedback

Tests, lint, type checks, execution results, evaluation

Closed-loop execution

Observe results, correct failures and retry


Let's understand each subsystem.

A. Instructions subsystem

Defines what the agent should do and what it must not do.

Examples:
- AGENTS.md
- ARCHITECTURE.md
- CONVENTIONS.md
- Feature specifications
- Security rules
B. Tools subsystem

Gives the agent the ability to perform work.

Examples:
- Read and write files.
- Run shell commands.
- Execute tests.
- Search the codebase.
- Access browser automation.
- Call MCP tools.
- Interact with Git.
The important principle is least privilege: give agents the tools necessary for their task, not unrestricted access to everything.

C. Environment subsystem

Makes execution predictable.

Examples:
- Node.js version.
- Package manager and lockfile.
- Docker containers.
- Environment variables.
- Database connections.
- Development and testing environments.
If one agent uses Node 22 and another uses Node 20, inconsistent results can occur.

D. State subsystem

Maintains continuity.

Examples:
- PROGRESS.md
- feature_list.json
- Session handoff.
- Checkpoints.
- Persistent project memory.
E. Feedback subsystem

Determines whether the agent's work is actually correct.

Examples:
- Unit tests.
- Integration tests.
- End-to-end tests.
- ESLint.
- TypeScript checks.
- Build validation.
- Independent evaluator.
The course highlights feedback as particularly valuable because an agent needs concrete evidence, not its own confidence.
Important engineering principle
The course recommends removing one subsystem at a time in controlled experiments.

For example, run the same task with:
1. Full harness.
2. No persistent state.
3. No explicit verification.
4. No architecture instructions.
Compare the results.

This tells you which components actually improve performance in your environment.

3. Why the repository must become the system of record
Source: Lecture 03

This lesson is directly relevant to your Spec-Driven Development approach.

Imagine that you have discussed your application architecture across 100 ChatGPT conversations.

You have also discussed:
- Database decisions.
- API conventions.
- Authentication rules.
- Feature requirements.
- UI standards.
- Performance requirements.
But none of this is available inside the repository.

A coding agent opening your project cannot automatically access those conversations.

The course calls this the Knowledge Visibility Gap.
The solution: Repository as the source of truth
Your repository should contain the authoritative information required to build the product.

For example:
my-project/
│
├── AGENTS.md
│
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── decisions/
│       ├── 001-database.md
│       └── 002-authentication.md
│
├── specs/
│   ├── authentication/
│   ├── conversations/
│   └── agent-execution/
│
├── src/
│
├── tests/
│
└── PROGRESS.md


The key idea is not to put everything into one document.

Put information where it belongs and make it discoverable.
Four important principles
1. Knowledge lives near code: Database constraints should be close to database modules.
2. Standardized entry file: AGENTS.md tells the agent where to start.
3. Minimal but complete: Avoid documentation that does not affect decisions.
4. Documentation changes with code: If architecture changes, update the relevant documentation.
The Fresh Session Test
This is an especially useful exercise.

Start a completely new coding-agent session. Give it access only to the repository.

Ask these five questions:
1. What does this application do?
2. How is the architecture organized?
3. How do I run the application?
4. How do I verify changes?
5. What is the current development status?
If the agent cannot answer, your repository has missing information.
ACID principles applied to agent state
The course applies database transaction concepts to agent work:
Principle	Meaning in agent engineering
Atomicity	Complete a logical task as a unit
Consistency	Preserve project invariants
Isolation	Prevent concurrent agents from conflicting
Durability	Store important decisions in version-controlled files

For example, two agents should not simultaneously modify the same progress file without coordination.

4. Why one giant instruction file fails
Source: Lecture 04

A common mistake is creating an enormous AGENTS.md containing every project requirement.

It looks comprehensive, but it creates problems:
- Every task receives irrelevant instructions.
- Important constraints become difficult to find.
- Context windows get consumed unnecessarily.
- Different rules may contradict each other.
- Updating the document becomes difficult.
Better approach: Progressive disclosure
Use a small root instruction file that acts as an index.

For example:
AGENTS.md
    |
    ├── docs/ARCHITECTURE.md
    ├── docs/SECURITY.md
    ├── docs/TESTING.md
    │
    └── src/features/
          ├── auth/AGENTS.md
          ├── chat/AGENTS.md
          └── agents/AGENTS.md


The agent loads general instructions first and specialized instructions when entering a particular domain.

This is closely related to Just-in-Time Context Loading.

Instead of loading all knowledge at once, retrieve the relevant knowledge when needed.
Example
An agent implementing authentication should load:
- Root project rules.
- Authentication specification.
- Authentication architecture.
- Security requirements.
- Relevant test instructions.
It does not need the entire event-management specification.

My recommendation: Keep root AGENTS.md short. Treat it as a navigation index, not a complete technical manual.

5. Why long-running tasks lose continuity
Source: Lecture 05

An AI agent does not have unlimited context.

Suppose you ask it to build an entire coding assistant.

It works for three hours.

During that time it:
- Explores the repository.
- Implements chat.
- Builds tool execution.
- Fixes streaming.
- Encounters errors.
- Changes architecture.
- Updates dependencies.
Eventually, the session ends or the context window fills.

A new session begins.

Without persistent state, the new agent must rediscover everything.
The solution: Externalized state
Persist information outside the model's temporary conversation context.

For example:

# PROGRESS.md

## Current objective
Implement agent execution and tool orchestration.

## Completed
- [x] Chat message persistence
- [x] Streaming response handler
- [x] Tool registry

## In progress
- [ ] Tool execution lifecycle

## Blocked
- [ ] Browser execution integration
  Reason: Runtime sandbox configuration incomplete.

## Architecture decisions
- Tool execution is server-side.
- Each execution has a unique run ID.
- Tool results are persisted.

## Last verification
- Unit tests: PASS
- TypeScript: PASS
- E2E: NOT RUN

## Next action
Complete tool execution lifecycle and run integration tests.



The next session reads this file and resumes.
Important distinction
There are different types of memory:
Memory	Purpose
Working memory	Current reasoning and context
Session state	What happened during the current execution
Project memory	Long-term architecture and decisions
Execution state	Current task, checkpoints and tool results
Learned knowledge	Reusable improvements discovered through experience

Do not confuse a conversation history with reliable project state.

A conversation can contain thousands of messages but still fail to tell the next agent exactly what remains unfinished.

6. Why initialization needs its own phase
Source: Lecture 06

This lesson introduces a critical concept: Bootstrap or Initialization Phase.

An agent should not immediately start modifying code when a session begins.

It should first understand the current working environment.
Recommended initialization sequence
1. Load global instructions
   
   Read AGENTS.md and project-level constraints.
2. Inspect Git state
   
   Check branch, uncommitted changes and recent commits.
3. Load current progress
   
   Read PROGRESS.md and feature tracking.
4. Inspect environment
   
   Check runtime versions, dependencies and available services.
5. Validate the baseline
   
   Run appropriate tests or health checks.
6. Build the task context
   
   Read the relevant specification, architecture and files.
7. Begin execution
   
   Only now should the agent modify the code.

Why is this important?

Imagine an agent starts working on a project where the previous session left 15 uncommitted changes.

If it immediately starts editing, it might overwrite unfinished work or mistake existing defects for newly introduced defects.

Initialization establishes a known starting state.

For OpenWorker, this should be a first-class lifecycle operation, not just an instruction buried in the system prompt.

7. Why agents overreach and under-finish
Source: Lecture 07

This lesson addresses two opposite problems.

Overreach: The agent does more than requested.

Example:

You request a new chat feature.

The agent:
- Rewrites the authentication system.
- Changes the database schema.
- Replaces the UI component library.
- Modifies unrelated API routes.
Under-finish: The agent stops before the feature is actually complete.

Example:

You request a complete chat system.

The agent:
- Builds the UI.
- Adds a message API.
- Does not implement persistence.
- Does not implement streaming.
- Does not test error handling.
The agent reports success anyway.
Solution: Explicit task boundaries
Every task needs:
- Objective.
- Allowed scope.
- Forbidden scope.
- Dependencies.
- Acceptance criteria.
- Verification requirements.
Example:
# Task: Implement Chat Streaming

## Objective
Implement streaming responses for conversations.

## Allowed scope
- Chat API
- Streaming service
- Message persistence
- Related tests

## Forbidden scope
- Authentication redesign
- Database replacement
- Unrelated UI redesign
- Changes to existing tool contracts

## Acceptance criteria
- Streaming begins correctly.
- Tokens arrive incrementally.
- Completed messages are persisted.
- Cancellation works.
- Network errors are handled.
- Existing chat history remains compatible.

## Verification
- Unit tests
- Integration tests
- E2E streaming test
- Production build


This is how you prevent an autonomous agent from turning a small task into an uncontrolled rewrite.

8. Why feature lists are harness primitives
Source: Lecture 08

A feature list is not just a project-management checklist.

It is a machine-readable representation of the product's implementation state.

Consider a coding assistant with these features:
{
  "features": [
    {
      "id": "CHAT-001",
      "name": "Conversation Creation",
      "status": "completed",
      "acceptance_criteria": [
        "Create a conversation",
        "Persist conversation metadata",
        "Display conversation in sidebar"
      ]
    },
    {
      "id": "CHAT-002",
      "name": "Message Streaming",
      "status": "in_progress",
      "acceptance_criteria": [
        "Stream model output",
        "Support cancellation",
        "Persist final assistant response"
      ]
    },
    {
      "id": "TOOL-001",
      "name": "Tool Execution",
      "status": "pending",
      "acceptance_criteria": [
        "Register tools",
        "Execute authorized tools",
        "Persist execution results"
      ]
    }
  ]
}


The agent can inspect the feature list and understand what is complete and what remains.
Why this matters
Without structured feature tracking, an agent can interpret a partially implemented feature as completed.

A feature should only become completed when its acceptance criteria have been verified.

For larger products, I recommend tracking:
- Feature ID.
- Requirement.
- Implementation status.
- Dependencies.
- Acceptance criteria.
- Verification evidence.
- Known limitations.
One important distinction: a feature list records state; it does not replace detailed feature specifications.

9. Why agents declare victory too early
Source: Lecture 09

This is one of the biggest problems in autonomous coding.

The agent writes code, looks at it, and concludes that the implementation is complete.

But writing code is not the same as verifying code.

Example:

The agent implements a payment endpoint.

It may confirm:
- The file exists.
- The function is implemented.
- The code looks correct.
But it may never verify:
- Payment provider integration.
- Invalid payment handling.
- Duplicate payment protection.
- Database consistency.
- Webhook verification.
- Actual end-to-end behavior.
Solution: Independent evaluation
Separate the implementation process from the verification process.
Maker Agent

Implements the feature and produces evidence.


Checker / Evaluator

Independently checks requirements, tests, implementation and regressions.


PASS

Accept implementation


FAIL

Return actionable defects




The evaluator should produce evidence, not merely an opinion.

For example:
Evaluation Result: FAILED

Requirement: Message cancellation

Evidence:
- Cancellation button appears.
- API cancellation request is sent.
- Backend execution continues.
- Streaming connection is not terminated.

Required correction:
Implement execution cancellation and verify
that the run reaches the cancelled state.


This is far more useful than asking another AI to say whether the code looks good.

10. Why end-to-end testing changes results
Source: Lecture 10

Unit tests alone cannot establish that a complete product workflow works.

Consider a chat application:
User types message
      ↓
Frontend sends request
      ↓
Backend receives request
      ↓
Conversation is loaded
      ↓
LLM provider is called
      ↓
Tokens are streamed
      ↓
Message is persisted
      ↓
Frontend renders response


Every individual component can pass its unit tests while the complete workflow still fails.

For example:
- Frontend sends the wrong request payload.
- Backend expects a different field.
- LLM response is not correctly streamed.
- Persistence happens before streaming finishes.
- The UI never receives the final completion event.
Three testing layers
Layer	What it verifies
Unit	Individual functions and modules
Integration	Interaction between components
E2E	Complete user workflows

What I recommend for your coding assistant
Build E2E scenarios for:
1. Create a conversation.
2. Send a user message.
3. Receive a streamed response.
4. Execute a tool call.
5. Display tool execution results.
6. Cancel an active execution.
7. Resume a conversation.
8. Recover after a server restart.
Your acceptance criteria should cover the actual user journey, not just the existence of individual APIs.

11. Why observability belongs inside the harness
Source: Lecture 11

An agent without observability is effectively a black box.

Suppose the agent repeatedly fails to execute a tool.

Without observability, you only see that the tool failed.

With observability, you can inspect:
- Which tool was selected.
- Which arguments were generated.
- Whether validation passed.
- Which permissions were checked.
- Whether execution started.
- What the tool returned.
- How much time it consumed.
- Why it failed.
Recommended observability architecture
Agent Execution

Logs

Events and errors


Traces

Execution path


Metrics

Latency and cost



Evaluation and Debugging


For your architecture, this connects directly with Langfuse.

I would track:
Data	Example
Run ID	run_123
Session ID	session_456
Agent	frontend-agent
Model	glm-5.3-flash
Tool	filesystem.write
Duration	2.4 seconds
Token usage	Input/output tokens
Cost	Provider-reported usage cost
Outcome	Success/failure
Error	Tool timeout

One important distinction: observability is not just logging errors. You need to reconstruct the complete execution path.

12. Why every session must leave a clean state
Source: Lecture 12

Initialization handles the beginning of a session.

Clean-state management handles the end.

An agent must not simply stop when it runs out of time or finishes generating a response.

It should leave behind a recoverable state.
End-of-session checklist
- Update feature status.
- Record completed work.
- Record incomplete work.
- Record known defects.
- Save important architecture decisions.
- Run final verification.
- Record test results.
- Save the next recommended action.
- Ensure uncommitted changes are understood.
Example:
# Session Handoff

## Completed
- Implemented tool registry.
- Added tool argument validation.

## Incomplete
- Browser execution timeout handling.

## Verification
- Unit tests: PASS
- Integration tests: FAIL

## Remaining defect
Browser execution does not terminate
after the configured timeout.

## Next session
Fix timeout cancellation and rerun
tool execution integration tests.


The next agent should be able to resume without asking you to explain the entire previous session.

13. From manual prompting to autonomous loops
Important for OpenWorker
Source: Lecture 13

This is where the course moves beyond ordinary AI coding assistants.

Instead of repeatedly prompting an agent manually, you create a controlled execution loop.

The basic pattern:
Goal

What needs to be accomplished?

Plan

Break work into executable tasks

Execute

Implement using available tools

Verify

Run tests and evaluate the result

Update State

Persist progress and evidence

Repeat until the completion condition is satisfied

Three loop types
The lecture develops three progressive experiments.

A. Goal loop

The agent repeatedly works toward a defined goal.

Example:
Goal: Complete authentication feature.

Repeat:
1. Inspect incomplete requirements.
2. Implement the next requirement.
3. Run tests.
4. Fix failures.
5. Update feature status.

Stop when all acceptance criteria pass.


B. Timer loop

The agent operates within a defined time budget.

For example:
- Work for 20 minutes.
- Save progress.
- Evaluate results.
- Continue in another execution window.
This is useful for long-running tasks and scheduled agent operations.

C. Maker-checker loop

One agent creates; another independently evaluates.
Maker
  ↓
Implementation
  ↓
Checker
  ↓
Evaluation
  ↓
Pass → Complete
Fail → Maker receives defects


Critical distinction
An autonomous loop must have:
- A clear stopping condition.
- A maximum iteration count.
- A time budget.
- A failure threshold.
- Persistent state.
- A way to detect repeated failures.
- Human approval for risky actions.
Otherwise, you have an uncontrolled loop that can waste tokens, repeat mistakes, or make destructive changes.

14. From single loops to graph engineering
Advanced architecture
Source: Lecture 14

This lecture is especially relevant to the agent architecture you are exploring with LangGraph, Mastra, and other orchestration frameworks.

A simple loop is insufficient when workflows contain multiple specialized stages and conditional paths.

Consider a coding task.

A simple implementation:
Plan → Execute → Verify → Repeat


But a real coding workflow might require:
Requirement Analysis
        ↓
Architecture Inspection
        ↓
Task Planning
        ↓
Implementation
        ↓
Code Review
        ↓
Automated Testing
        ↓
Evaluation


What happens if architecture inspection finds a conflict?

What happens if tests fail?

What happens if security review rejects the implementation?

A graph handles these conditions explicitly.
Example graph
#chatgpt-mermaid-_r_1pf_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_1pf_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1pf_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1pf_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-_r_1pf_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_1pf_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_1pf_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_1pf_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_1pf_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_1pf_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1pf_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1pf_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_1pf_ p{margin:0;}#chatgpt-mermaid-_r_1pf_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_1pf_ .label text,#chatgpt-mermaid-_r_1pf_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .node rect,#chatgpt-mermaid-_r_1pf_ .node circle,#chatgpt-mermaid-_r_1pf_ .node ellipse,#chatgpt-mermaid-_r_1pf_ .node polygon,#chatgpt-mermaid-_r_1pf_ .node path{fill:rgb(226, 242, 230);stroke:rgb(107, 198, 127);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .rough-node .label text,#chatgpt-mermaid-_r_1pf_ .node .label text,#chatgpt-mermaid-_r_1pf_ .image-shape .label,#chatgpt-mermaid-_r_1pf_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_1pf_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .rough-node .label,#chatgpt-mermaid-_r_1pf_ .node .label,#chatgpt-mermaid-_r_1pf_ .image-shape .label,#chatgpt-mermaid-_r_1pf_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_1pf_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_1pf_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1pf_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1pf_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-_r_1pf_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1pf_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1pf_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1pf_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-_r_1pf_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_1pf_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1pf_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_1pf_ .icon-shape,#chatgpt-mermaid-_r_1pf_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1pf_ .icon-shape p,#chatgpt-mermaid-_r_1pf_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-_r_1pf_ .icon-shape .label rect,#chatgpt-mermaid-_r_1pf_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1pf_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_1pf_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_1pf_ .node .neo-node{stroke:rgb(107, 198, 127);}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_1pf_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_1pf_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_1pf_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node .neo-line path{stroke:rgb(107, 198, 127);filter:none;}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_1pf_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_1pf_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1pf_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_1pf_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1pf_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1pf_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1pf_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_1pf_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_1pf_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(237, 250, 242);stroke:rgb(166, 211, 184);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .node rect,#chatgpt-mermaid-_r_1pf_ .node circle,#chatgpt-mermaid-_r_1pf_ .node ellipse,#chatgpt-mermaid-_r_1pf_ .node polygon,#chatgpt-mermaid-_r_1pf_ .node path{fill:rgb(217, 244, 228);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1pf_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_1pf_ .mermaid-decision .label-container{fill:rgb(237, 250, 242);stroke:rgb(195, 220, 205);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_1pf_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_1pf_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1pf_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Receive TaskAnalyze RequirementsInspect ArchitectureCreate PlanImplementRun TestsTests Passed?Diagnose FailureIndependent ReviewReview Passed?Update Project StateComplete TaskNoYesNoYes





Why graph engineering is better
It provides:
- Explicit execution stages.
- Conditional transitions.
- Retry paths.
- Error handling.
- Specialized agents.
- State checkpoints.
- Human approval gates.
- More predictable execution.
Loop versus graph
Single loop	Graph engineering
One repeated workflow	Multiple connected workflows
Simple execution	Conditional execution
Limited branching	Explicit decision nodes
Basic retries	Specialized recovery paths
Simple state	Structured shared state

My conclusion: A loop is a useful starting point. A graph becomes necessary when your product has multiple agents, tools, evaluators, approval gates, and recovery paths.

Part 2. The seven practical projects
The lectures explain the theory. The projects teach you how to implement it.

The course has seven progressive projects, numbered 01–08 because the automated-loop and graph projects are additional advanced exercises.

Complete Projects section.
Project 01 — Prompt-only vs. Rules-first
Open Project 01Objective: Prove that the same model behaves differently when given a proper harness.

You build a small Electron knowledge-base application.

First run:
- Give the agent only a prompt.
- No architecture instructions.
- No feature tracking.
- No initialization script.
- No verification requirements.
Second run:
- Add AGENTS.md.
- Add init.sh.
- Add feature_list.json.
- Add architecture and product documents.
- Add a progress file.
Then compare:
- Did the application launch?
- Were all features implemented?
- How many retries were needed?
- Did the agent stop prematurely?
- Did the agent follow architectural boundaries?
The experiment requires isolated working directories to avoid contaminating the weak-harness run with files from the strong-harness run.

What you learn: Harness quality should be measured experimentally, not assumed.
Project 02 — Agent-readable workspace
Open Project 02Objective: Make your repository understandable to a completely new agent.

The project introduces:
- Expanded architecture documentation.
- Product documentation.
- Feature tracking.
- Session handoff files.
- Local persistence.
The important experiment is running the same project across two separate agent sessions.

The second session should understand what the first session accomplished without you explaining it.

What you learn: Your repository must be understandable without depending on previous conversation history.
Project 03 — Multi-session continuity
Open Project 03Objective: Ensure agents can resume work without losing progress.

The product work includes:
1. Document chunking.
2. Metadata extraction.
3. Indexing progress display.
4. Citation-based question answering.
The harness introduces:
- feature_list.json
- init.sh
- session-handoff.md
- claude-progress.md
- clean-state-checklist.md
Each feature needs verification evidence before it can be marked as passing.

What you learn: Persistent state must be structured, actionable and verifiable.
Project 04 — Runtime feedback and scope control
Open Project 04Objective: Give the agent enough runtime information to diagnose problems.

The course deliberately introduces a bug in large-file document chunking.

The agent must identify and fix it.

You introduce:
- Structured logging.
- Architecture boundary documentation.
- Architecture checking scripts.
- Runtime diagnostics.
- Clean-state verification.
For example, instead of:
Indexing failed.


Your runtime should report:
event: document.index.failed
document_id: doc_123
stage: chunking
error: maximum_chunk_size_exceeded
duration_ms: 1250


The actual error should include enough information to identify the underlying defect.

What you learn: Agents need runtime feedback to diagnose problems rather than guessing from source code.
Project 05 — Self-verification and role separation
Open Project 05Objective: Prevent agents from approving their own incomplete work.

This project focuses on grounded Q&A and independent verification.

The important architecture is:
- Maker: implements functionality.
- Checker: verifies implementation.
- Evidence: records what was actually tested.
- Acceptance: determines whether the feature is complete.
You should not allow a maker to mark a feature as passing just because it believes the implementation is correct.

What you learn: Completion must be established by independent evidence.
Project 06 — Complete harness (capstone)
Open Project 06Objective: Combine the previous projects into one complete agent environment.

This is where the individual pieces become a working system:
- Instructions.
- Agent-readable repository.
- Persistent state.
- Initialization.
- Feature tracking.
- Runtime feedback.
- Verification.
- Session handoff.
- Clean-state management.
The important part is that these are not independent Markdown files. They must work together as one execution process.
Project 07 — Your first automated loop
Open Project 07Objective: Remove the need for manually prompting the agent after every task.

The project progresses through:
- Goal-based loop.
- Time-budgeted loop.
- Maker-checker loop.
It also introduces important operational considerations:
- Iteration limits.
- Time budgets.
- Stop conditions.
- Failure handling.
- Progress persistence.
This is the first step towards an autonomous coding system.
Project 08 — Draw your workflow as a graph
Open Project 08Objective: Convert a linear workflow into an explicit graph.

You identify:
- Nodes representing execution stages.
- Edges representing transitions.
- Conditions representing decisions.
- Checkpoints representing persistent state.
- Recovery paths representing error handling.
For example, a failed test should not send the agent blindly back to the beginning. It should send it to a diagnosis and correction stage.

This is where graph-based orchestration becomes useful.

Part 3. Resource library — actual files you should use
Immediately applicable
Source: Resource Library.

This section is particularly useful because it gives you actual reusable templates.

The course recommends four files as the minimal harness.
1. AGENTS.md — Instruction entry point
Purpose: Tell the agent how to work inside the repository.

Recommended contents:
# Project Instructions

## Project Overview
What the application does.

## Technology Stack
Frameworks, languages, database and versions.

## Architecture
Major modules and responsibilities.

## Coding Standards
Naming conventions and implementation rules.

## Non-Negotiable Constraints
Rules the agent must never violate.

## Development Commands
Installation, development and build.

## Verification
Tests, lint, typecheck and build.

## Documentation
Links to detailed specifications.


Do not put every feature requirement here.
2. feature_list.json — Machine-readable feature state
Purpose: Tell the agent what exists, what is incomplete and what must be verified.

Example:
{
  "id": "CHAT-001",
  "name": "Message Streaming",
  "status": "in_progress",
  "dependencies": ["CHAT-000"],
  "acceptance_criteria": [
    "Stream responses incrementally",
    "Support cancellation",
    "Persist completed responses"
  ],
  "verification": {
    "unit": "pending",
    "integration": "pending",
    "e2e": "pending"
  },
  "evidence": []
}


This should be validated against a JSON Schema. Define allowed statuses and transitions so an agent cannot arbitrarily change feature state.
3. Progress file — Session continuity
Purpose: Save the current development state.

Recommended information:
# Progress

## Current Objective

## Completed

## In Progress

## Blocked

## Last Verification

## Known Issues

## Next Actions


The course historically calls this claude-progress.md, but it is not Claude-specific. You can use PROGRESS.md for OpenWorker.
4. init.sh — Initialization
Purpose: Establish a known development environment before work begins.

Example:
#!/usr/bin/env bash

set -euo pipefail

echo "Checking runtime..."

node --version
npm --version

echo "Checking dependencies..."

test -f package.json
test -f package-lock.json

echo "Checking repository..."

git status --short

echo "Running baseline checks..."

npm run typecheck
npm run lint


This is only a minimal illustration. Your real script must match your package manager, available services and project-specific baseline checks. It should not modify dependencies or overwrite user changes unexpectedly.
Additional recommended files
File	Responsibility
session-handoff.md	Information passed to the next session
clean-state-checklist.md	End-of-session requirements
evaluator-rubric.md	Independent evaluation criteria
ARCHITECTURE.md	System architecture
PRODUCT.md	Product behavior and requirements

The library also includes an advanced OpenAI-style repository pack for larger projects.

Important: These files are not magic. An agent only uses them if its instructions and runtime explicitly make them part of the workflow.

Part 4. Skills — the reusable harness creator
Source: Skills section.

The course includes a skill called harness-creator.

This is interesting because instead of manually creating every harness, you can give an AI coding agent a specialized skill to assess, create and improve its harness.

Installation command provided by the course:
npx skills add walkinglabs/learn-harness-engineering --skill harness-creator


The skill covers five core subsystems:
1. Instructions.
2. State.
3. Verification.
4. Scope.
5. Session lifecycle.
It also includes seven reference areas:
Reference	Purpose
Memory Persistence	Store knowledge across sessions
Skill Runtime	Package reusable workflows
Context Engineering	Load relevant context efficiently
Tool Registry	Tool safety and concurrency
Multi-Agent Coordination	Coordinate specialized agents
Lifecycle & Bootstrap	Initialization and background execution
Gotchas	Common non-obvious failure modes

It provides templates and Node.js scripts for scaffolding, validation and structural assessment.

This is worth testing against your own repository rather than blindly adopting all its defaults.

Part 5. Frontier harness design breakdowns
This is the section I would study after the lectures because it moves from theory to real coding-agent architecture.

The course includes detailed breakdowns of established systems.










Pi Harness

Minimal, extensible coding-agent architecture
Read Pi breakdown












Claude Code Harness

Agent instructions, tools, hooks and execution lifecycle
Read Claude Code breakdown












Codex Harness

Repository-centered development, isolated execution and verification
Read Codex breakdown


These are architecture breakdowns, not complete source-code audits. Their purpose is to understand design patterns and architectural decisions.

I would compare the three on:
- How instructions are loaded.
- How tools are registered.
- How execution is controlled.
- How context is maintained.
- How permissions work.
- How workspaces are isolated.
- How failures are recovered.
- How verification is performed.
Do not simply copy one agent's implementation. Identify which design decisions solve your actual problems.

Part 6. How I would apply this to your OpenWorker project
This is where the course becomes useful for your actual product.

Your objective is not simply to create another coding chatbot. You want a stateful agent system that can execute substantial work, preserve knowledge, recover from failures and improve workflows over time.

I would translate the course into the following architecture.
1. OpenWorker harness architecture
#chatgpt-mermaid-_r_1s1_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_1s1_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1s1_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1s1_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-_r_1s1_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_1s1_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_1s1_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_1s1_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_1s1_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_1s1_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s1_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s1_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_1s1_ p{margin:0;}#chatgpt-mermaid-_r_1s1_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_1s1_ .label text,#chatgpt-mermaid-_r_1s1_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .node rect,#chatgpt-mermaid-_r_1s1_ .node circle,#chatgpt-mermaid-_r_1s1_ .node ellipse,#chatgpt-mermaid-_r_1s1_ .node polygon,#chatgpt-mermaid-_r_1s1_ .node path{fill:rgb(226, 242, 230);stroke:rgb(107, 198, 127);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .rough-node .label text,#chatgpt-mermaid-_r_1s1_ .node .label text,#chatgpt-mermaid-_r_1s1_ .image-shape .label,#chatgpt-mermaid-_r_1s1_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_1s1_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .rough-node .label,#chatgpt-mermaid-_r_1s1_ .node .label,#chatgpt-mermaid-_r_1s1_ .image-shape .label,#chatgpt-mermaid-_r_1s1_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_1s1_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_1s1_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s1_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s1_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-_r_1s1_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1s1_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s1_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s1_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-_r_1s1_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_1s1_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s1_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_1s1_ .icon-shape,#chatgpt-mermaid-_r_1s1_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1s1_ .icon-shape p,#chatgpt-mermaid-_r_1s1_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-_r_1s1_ .icon-shape .label rect,#chatgpt-mermaid-_r_1s1_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s1_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_1s1_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_1s1_ .node .neo-node{stroke:rgb(107, 198, 127);}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_1s1_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_1s1_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_1s1_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node .neo-line path{stroke:rgb(107, 198, 127);filter:none;}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_1s1_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_1s1_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s1_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_1s1_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s1_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1s1_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1s1_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_1s1_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_1s1_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(237, 250, 242);stroke:rgb(166, 211, 184);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .node rect,#chatgpt-mermaid-_r_1s1_ .node circle,#chatgpt-mermaid-_r_1s1_ .node ellipse,#chatgpt-mermaid-_r_1s1_ .node polygon,#chatgpt-mermaid-_r_1s1_ .node path{fill:rgb(217, 244, 228);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1s1_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_1s1_ .mermaid-decision .label-container{fill:rgb(237, 250, 242);stroke:rgb(195, 220, 205);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_1s1_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_1s1_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s1_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}User RequestOrchestratorContext EngineeringSpecification and Task PlannerExecution GraphAgent RuntimeTool RegistryExecution EnvironmentFeedback and VerificationFailure DiagnosisIndependent EvaluatorPersistent StateMemory and KnowledgeSession HandoffObservabilityFailedPassedRejectedApproved





Here is how I would divide the system.
Subsystem	OpenWorker responsibility
Instruction engine	AGENTS.md, project rules, task constraints
Context engine	Relevant files, architecture, history, specifications
Planner	Requirements decomposition and task planning
Agent runtime	Model execution and agent lifecycle
Tool registry	Filesystem, terminal, browser, MCP
Environment manager	Workspaces, dependencies, isolation
State manager	Runs, checkpoints, feature progress
Feedback engine	Tests, builds, runtime diagnostics
Evaluator	Independent implementation review
Observability	Logs, traces, metrics, token usage
Memory system	Persistent project knowledge and reusable learnings
Graph orchestrator	Conditional workflows, retries and approvals

Notice that the harness is larger than the orchestration framework.

LangGraph, Mastra or another framework can manage graph execution, but they do not automatically provide all the repository intelligence, environment isolation, verification policies and persistent engineering state you need.
2. How your technology choices fit
Technology	Recommended responsibility
Next.js	Frontend
Node.js + TypeScript	Backend and agent runtime
Zod	Runtime schema validation
LangGraph or Mastra	Graph orchestration
Supabase	Application persistence
Redis	Queues, coordination and transient state
Langfuse	Observability and evaluations
MCP	External tool integration
Browser-use	Browser automation
Docker	Isolated execution environments

One important architectural distinction:
- Gateway: Handles model-provider connectivity, authentication, routing and related request policies.
- Harness: Controls how an agent performs work.
- Orchestrator: Coordinates execution stages and agents.
- Runtime: Executes model turns and tools.
- Memory: Preserves information between execution sessions.
- Evaluator: Determines whether the result satisfies requirements.
These should have explicit responsibilities rather than being merged into one giant service.
3. What the actual execution lifecycle should look like
I would implement this lifecycle:
#chatgpt-mermaid-_r_1s8_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_1s8_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1s8_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_1s8_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-_r_1s8_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_1s8_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_1s8_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_1s8_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_1s8_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_1s8_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s8_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s8_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-_r_1s8_ p{margin:0;}#chatgpt-mermaid-_r_1s8_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_1s8_ .label text,#chatgpt-mermaid-_r_1s8_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .node rect,#chatgpt-mermaid-_r_1s8_ .node circle,#chatgpt-mermaid-_r_1s8_ .node ellipse,#chatgpt-mermaid-_r_1s8_ .node polygon,#chatgpt-mermaid-_r_1s8_ .node path{fill:rgb(226, 242, 230);stroke:rgb(107, 198, 127);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .rough-node .label text,#chatgpt-mermaid-_r_1s8_ .node .label text,#chatgpt-mermaid-_r_1s8_ .image-shape .label,#chatgpt-mermaid-_r_1s8_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_1s8_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .rough-node .label,#chatgpt-mermaid-_r_1s8_ .node .label,#chatgpt-mermaid-_r_1s8_ .image-shape .label,#chatgpt-mermaid-_r_1s8_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_1s8_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_1s8_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s8_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s8_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-_r_1s8_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1s8_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s8_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s8_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-_r_1s8_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_1s8_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-_r_1s8_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_1s8_ .icon-shape,#chatgpt-mermaid-_r_1s8_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-_r_1s8_ .icon-shape p,#chatgpt-mermaid-_r_1s8_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-_r_1s8_ .icon-shape .label rect,#chatgpt-mermaid-_r_1s8_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-_r_1s8_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_1s8_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_1s8_ .node .neo-node{stroke:rgb(107, 198, 127);}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_1s8_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_1s8_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_1s8_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node .neo-line path{stroke:rgb(107, 198, 127);filter:none;}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_1s8_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_1s8_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s8_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_1s8_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_1s8_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1s8_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 105, 42);}#chatgpt-mermaid-_r_1s8_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_1s8_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_1s8_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(237, 250, 242);stroke:rgb(166, 211, 184);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .node rect,#chatgpt-mermaid-_r_1s8_ .node circle,#chatgpt-mermaid-_r_1s8_ .node ellipse,#chatgpt-mermaid-_r_1s8_ .node polygon,#chatgpt-mermaid-_r_1s8_ .node path{fill:rgb(217, 244, 228);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_1s8_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_1s8_ .mermaid-decision .label-container{fill:rgb(237, 250, 242);stroke:rgb(195, 220, 205);stroke-dasharray:2,2;}#chatgpt-mermaid-_r_1s8_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_1s8_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-_r_1s8_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}New User TaskInitialize SessionLoad Project InstructionsInspect Repository and GitLoad Relevant MemoryAnalyze RequirementsCreate Task SpecificationPlan and Create FeatureRecordsExecute TaskRun VerificationPassed?Diagnose and RepairIndependent EvaluationApproved?Persist Evidence and StateUpdate Reusable KnowledgeClean Session and HandoffNoYesNoYes





I would also add:
- Maximum retries.
- Maximum execution time.
- Budget limits.
- Tool permission checks.
- Human approval for destructive operations.
- Cancellation and recovery.
- Idempotent state updates.
This makes the execution predictable and recoverable.

Part 7. What the course gets right and what it does not cover sufficiently
The course is a useful foundation, but it is not a complete production architecture specification.

Here is my assessment.
Area	Assessment
Repository instructions	Strong
Feature tracking	Strong
Session continuity	Strong
Initialization	Strong
Independent verification	Strong
Runtime feedback	Strong
Autonomous loops	Good foundation
Graph orchestration	Good foundation
Multi-agent concurrency	Needs deeper engineering
Distributed execution	Needs deeper engineering
Memory quality and retrieval	Needs deeper engineering
Security and sandboxing	Needs deeper engineering
Evaluation datasets and regression benchmarks	Needs deeper engineering
Self-improvement governance	Needs deeper engineering

Five additional concepts I would implement
1. Harness regression testing

Every time you change the harness, run a standard set of coding tasks and compare:
- Completion rate.
- Defect rate.
- Cost per completed task.
- Time to completion.
- Number of retries.
- Verification failures.
Otherwise, changing the harness could make it worse without you noticing.

2. Failure classification

Every failed execution should have a classified cause:
TASK_AMBIGUITY
CONTEXT_MISSING
TOOL_FAILURE
ENVIRONMENT_FAILURE
MODEL_FAILURE
STATE_CORRUPTION
VERIFICATION_FAILURE
PERMISSION_DENIED


Use these records to decide what to improve.

3. Memory quality control

Do not automatically save every agent observation as permanent knowledge.

Store candidate learnings, validate them, deduplicate them and promote only useful information.

4. Multi-agent isolation

Agents need independent workspaces, execution ownership, file conflict detection and controlled merging.

Otherwise, parallel agents can corrupt each other's work.

5. Self-improvement evaluation

An agent should not be allowed to modify its own system instructions or tools and declare itself improved.

A proposed improvement must pass regression tests against the previous version.

Part 8. My recommended implementation order
Do not attempt to implement all of this simultaneously.

Build it incrementally.
OpenWorker harness roadmap
1. Phase 1 — Foundation
   Start here
   - AGENTS.md instruction system
   - Repository scanner
   - Architecture documentation
   - Feature specifications
   - Feature state tracking
   - Definition of Done
2. Phase 2 — Session continuity
   - Initialization lifecycle
   - Progress persistence
   - Session handoff
   - Checkpoints
   - Git state inspection
   - Recovery after restart
3. Phase 3 — Execution environment
   - Tool registry
   - Permission system
   - Workspace isolation
   - Terminal execution
   - Runtime configuration
   - Cancellation and timeouts
4. Phase 4 — Verification
   - Unit and integration tests
   - E2E testing
   - Independent evaluator
   - Evidence-based completion
   - Regression checks
5. Phase 5 — Observability
   - Structured logs
   - Execution traces
   - Token usage
   - Latency and cost
   - Failure classification
6. Phase 6 — Autonomous execution
   - Goal loops
   - Time-budgeted loops
   - Maker-checker
   - Retry policies
   - Human approval gates
7. Phase 7 — Advanced graph engineering
   - Conditional workflows
   - Multi-agent coordination
   - Parallel execution
   - Checkpoint recovery
   - Dynamic task routing
8. Phase 8 — Self-improving harness
   - Failure analysis
   - Learning extraction
   - Reusable skill generation
   - Harness optimization
   - Automated regression evaluation


Part 9. What you should study next
I recommend studying these resources in this order:
Priority	Resource	Why
1	Harness resource library	Actual templates
2	Harness creator skill	Automated harness creation
3	Claude Code breakdown	Practical coding-agent design
4	Codex breakdown	Repository-centric engineering
5		Autonomous execution
6		Advanced orchestration

The last two lecture references are the actual lecture pages linked earlier in this course; you can also navigate to them through the lecture index.
Final verdict
The most important lesson from this entire course is:

Don't build an AI agent that merely knows how to write code. Build an engineering environment in which the agent is forced to understand the project, execute within boundaries, verify its work, preserve its state and learn from failures.

For OpenWorker, I would prioritize three things above everything else:
1. Reliable stateful execution: Every task must be resumable.
2. Evidence-based verification: No feature is complete without proof.
3. Controlled self-improvement: Every learned improvement must be evaluated before becoming part of the production harness.
That is the foundation of a reliable, self-improving coding-agent system.