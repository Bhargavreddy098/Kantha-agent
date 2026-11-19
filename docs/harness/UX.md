# Repository task UX

This is the proposed Chat experience for a single Kantha repository task. A user should always be able to answer three questions from the conversation itself. Which repository is Kantha working in? Does it need me to act? What evidence supports the result?

The current H0–H1 Chat expander runs a scripted formatter fixture with an inert tool. The screens below describe the target experience. Real inference, repository access, approvals, verification and reopening evidence depend on the corresponding release gates. [Current fixture evidence](HANDOFF-H0-H1.md) · [Harness release gates](IMPLEMENTATION-PLAN.md)

## Navigation and layout

| Surface | What belongs there |
| --- | --- |
| Chat composer | An explicit **Chat / Repository task** mode, using the existing composer and model selection. Fresh conversations default to Chat. Reopened conversations restore their saved context. |
| Conversation | The request, pinned repository and revision, streamed response, one run status summary, any current approval, and the final outcome. Each run stays attached to its original turn. |
| Run details | One on-demand surface opened from the turn. Overview, Activity, Changes and Checks are sections in that order. **Review action**, **Review changes** and **View checks** open the relevant section directly. |
| Conversation history | Repository task rows have a human-readable title, repository and meaningful status such as **Approval needed** or **Completed**. Reopening returns to the same conversation and run, with earlier runs still attached to their own turns. |
| Settings | Existing provider, access and usage surfaces remain the places to resolve configuration issues. The task links to the relevant surface only when the current actor can use it. |

Keep the Neutral shell and a single reading column. At wide widths, target a conversation measure around 720 px and a 480–560 px end drawer for details. At narrow widths, the details drawer uses the available viewport and replaces the visible conversation until dismissed. Use the same section order and actions at both sizes. Use existing theme typography, spacing, dividers and semantic status styles. Lead with the task and its status, put revision and timings in supporting text, and keep IDs in Overview for support. Reserve elevated emphasis for a pending decision or a terminal outcome.

### Wireframes

These use the formatter scenario to illustrate layout and copy. Paths, revisions, check counts and outcomes in the implemented UI come from authorized run data.

```text
CHAT · BEFORE SUBMISSION
┌──────────────────────────────────────────────────────────────────┐
│ Chat                                             History         │
│                                                                  │
│ [Chat] [Repository task]                                         │
│ Repository  formatter ▾       Model  Selected model ▾           │
│ Target       main · 8d20fa1    [View scope]                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Keep zero visible in the formatter. Preserve existing edits. │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                  [Start task]   │
└──────────────────────────────────────────────────────────────────┘

CHAT · APPROVAL PAUSE
┌──────────────────────────────────────────────────────────────────┐
│ You  Keep zero visible in the formatter. Preserve existing edits. │
│      formatter · 8d20fa1                                         │
│                                                                  │
│ Kantha  I found the formatter treats zero as an empty value.      │
│                                                                  │
│ Approval needed                                   [Stop task]   │
│ Apply a patch to src/format-value.ts                             │
│ formatter · Expires at 14:32 local time                          │
│ [Review action]                                 [Run details]   │
└──────────────────────────────────────────────────────────────────┘

CHAT · COMPLETED                         RUN DETAILS · CHECKS
┌─────────────────────────────────────┐  ┌────────────────────────────┐
│ Completed · 2/2 required checks pass│  │ Run details          Close │
│ Zero values stay visible.           │  │ formatter · 8d20fa1        │
│ 1 file changed · baseline preserved │  │                            │
│ [Review changes] [View checks]      │  │ Checks                     │
└─────────────────────────────────────┘  │ Passed · Zero stays visible│
                                         │ [View evidence]            │
                                         │ Passed · Baseline intact   │
                                         │ [View evidence]            │
                                         └────────────────────────────┘
```

## Start a task

1. Choose **Repository task** in Chat. Keep the draft when switching modes. If repository tasks do not support attachments, retain attached files in the Chat draft and show **Attachments are available in Chat** next to the mode control. Label the task input **What should Kantha do in this repository?** and the submit action **Start task**. A scope disclosure shows granted paths and applicable capability limits in plain language.
2. Select from repositories granted by the gateway and models eligible for a repository task. If exactly one repository is eligible, preselect it and show its name. Show the target preview the server supplies, and label any disclosed fence in the target's scope. Offer retained candidates only when the server lists them as eligible. After admission, show the actual pinned base revision and model. If the preview is unavailable, omit it until the server resolves it. If access or model eligibility changes, keep the draft, explain the specific blocker, and allow the user to choose an eligible option. Offer Settings links only for destinations returned as usable for the current actor. If task mode is unavailable in the deployment, keep Chat usable and expose task mode only when enabled.
3. While submitting, show **Starting task…** and suppress duplicate sends. If the response is lost, **Check submission** reconnects or retries the original submission with the same identity and payload. Resolve its status before offering a fresh submission. On definitive rejection, preserve the draft and show the reason by the relevant field or composer. Once accepted, replace the pending UI with the original user turn and its run summary.
4. During preflight, show **Preparing workspace** with a short, projected status. Overview shows check availability and known baseline failures when available. Checks shows the pinned criteria as soon as they are available. A missing required prerequisite names the dependency and what the user can do. A known unrelated baseline failure stays visible in Checks and in the handoff if relevant. If a material choice blocks the task, show **Clarification needed** with the exact question and let the user start a new task with their answer. The composer retains any follow-up draft while the session is busy and explains when it can be sent.

[Workspace preparation](features/WORKSPACE.md) · [Sessions and execution](features/SESSIONS.md) · [Inference](features/INFERENCE.md)

## Follow progress and stop

The turn summary shows one current stage and one useful detail, such as **Working · Inspecting the formatter**. **Run details** opens the activity record. Publish meaningful milestones such as workspace prepared, repository guidance or skill loaded, a safe tool outcome, checks started, or a repair underway. Group routine reads by step and give expandable details a clear summary. A failed tool or decision that affects the outcome gets an individual row. Omit internal context reduction and provider retry mechanics from the main conversation unless they affect the user's ability to proceed. Use a short source and version under Activity or Overview when authorized.

| Server or client condition | User sees and can do |
| --- | --- |
| Admitted or preparing | **Queued** or **Preparing workspace**. Show **Stop task** when the server can accept it. |
| Planning | **Planning task**, with a short detail when available. Show the pinned criteria in Checks once recorded. |
| Executing | **Working**, with the latest meaningful activity. Apply gateway SSE text deltas to the assistant message in the same turn. |
| Waiting for approval | **Approval needed**, with the exact action summary and **Review action** visible inline. |
| Running checks or bounded repair | **Checking results** or **Fixing a failed check** when the projection identifies the repair. Show the affected criterion and elapsed check time when available. |
| Finishing | **Finalizing**, until the server publishes the outcome and cleanup disposition. |
| Stop requested | **Requesting stop…** while sending, then **Stopping** after acknowledgement. Keep partial output and confirmed effects visible. If the response is lost, refresh the same run before offering another Stop request. |
| Browser feed disconnected | **Reconnecting to task** beside the last confirmed status and its freshness. Keep known content visible and refresh before taking a new approval decision. If reconnection stalls, offer **Reconnect** to the same run. |
| Server reports recovery | **Recovering task**. Keep the same run and show the last confirmed activity. |
| Clarification required | **Clarification needed**, with the exact question and **Answer question**. This label and its attention style take precedence over the generic failed badge. The action opens a new task draft linked to the original run. The user can submit just the answer. |
| Other terminal outcomes | **Completed**, **Failed**, **Stopped** or **Interrupted**. Use the persisted verdict and reason. If Stop races with completion, show the actual outcome. |

Opening another conversation leaves the run in history. Reload restores the selected conversation and fetches an authorized run snapshot. Resume the event feed from the snapshot watermark when needed, deduplicate replay, and retain one approval and one final outcome per applicable identity. If the cursor expired, refresh from the watermark of a new snapshot. Preserve reading position while the user reads earlier messages and offer **Jump to latest** when new activity is out of view. Keep connection status distinct from the run's confirmed state.

[Chat integration and recovery](features/CHAT-EVENTS.md) · [Tools](features/TOOLS.md) · [Context and skills](features/CONTEXT-AND-SKILLS.md)

## Review a pending action

Show a single actionable row in the conversation. **Review action** opens Run details with the decision section before the standard sections. On a narrow screen, the review body scrolls while the decision controls remain reachable. The decision view presents information in this order:

| Order | Content |
| --- | --- |
| 1 | Plain-language verb, target and expected effect derived from the exact action, such as **Apply patch to src/format-value.ts**. Place any agent-provided explanation below the action and label it **Agent rationale**. |
| 2 | Repository, scoped target, exact parameters or patch the actor is authorized to review, and the server's expiry shown in local time. A check request shows its approved command profile and what it will run. |
| 3 | **Deny** and **Approve once**. Approval is tied to the displayed action and version. The actor needs current permission and the full authorized decision material before approval is available. Closing the drawer leaves the request pending. |

During either decision show **Saving decision…**, prevent double submission, and wait for confirmation. Keep recorded approval separate from actual execution. After approval, the row can say **Approved · Waiting to apply** until dispatch is confirmed. After denial, expiry, revocation or cancellation, remove decision controls and show the recorded disposition. If another tab decides first, refresh and show its authoritative outcome. If the proposal changed, identify the new proposal and require a fresh review. If Stop and approval race, display the server's decision and action status independently until both are settled.

If an action's effects are unresolved, show exactly the permitted target under **Interrupted** and the operator reconciliation step from the handoff. Show the recorded disposition when available. Keep dependent work blocked while the effect is unresolved. If the server confirms a known result during recovery, show it once in the original activity row.

[Permissions and approvals](features/APPROVALS.md) · [Action and result boundaries](features/TOOLS.md)

## Review the result

Put the verdict before the narrative. In the turn, show the outcome, a short account of the verified change, required check counts if known, and the most useful next action. **Review changes** opens Changes and **View checks** opens Checks. On failure, lead with the first unresolved required criterion or blocker. On Stop, distinguish confirmed changes, pending cleanup and any unknown effects. On interruption, lead with what needs reconciliation. Provide a follow-up task only when the gateway permits a new action against the relevant scope.

| Run details section | Reading order and behavior |
| --- | --- |
| Overview | Task, verified outcome or current stage, repository and base/candidate identity, remaining work and next safe action, baseline edits and cleanup disposition. Put model and diagnostic IDs below the handoff. |
| Activity | Chronological milestones, safe scope and tool summaries, decisions, repair attempts and recovery. Keep proposed, approved and executed distinct. Link from any failure to its authorized evidence when available. |
| Changes | List authorized changed paths and change summaries. Open the selected file's scoped patch on demand. State that these changes are in the isolated candidate and show where the patch is available. Label available changes as verified, partial or unverified according to the candidate evidence. Call out baseline protection only when confirmed. |
| Checks | Show the current candidate, required criteria first, each result and reason, then optional checks and known baseline issues. Expand a result for the check identity, expected and observed behavior, and authorized evidence. Label older results **Stale** when affected by candidate changes and exclude them from current pass counts. Distinguish **Failed**, **Blocked**, and **Pending**. |

**Completed** requires a persisted completed outcome, current passing required evidence, and recorded cleanup disposition. Assistant text is rendered as conversation content. Evidence access is rechecked on open, and an unavailable artifact leaves the run summary usable. On expired or inaccessible evidence, show **Evidence unavailable** without leaking metadata the actor cannot read. Use loading and retry states scoped to the affected section. If transcript export ships with the authorized export contract, place **Export transcript** with run metadata and describe it as a snapshot of recorded conversation.

Show reported usage only when the gateway supplies it. Represent unknown usage explicitly and link to Settings when useful. Use safe projected labels and summaries. Keep raw event JSON, provider payloads and secrets out of the product UI. Authorized evidence reads and exports are separate from diagnostics. [Verification and handoff](features/VERIFICATION.md) · [Persistence](features/PERSISTENCE.md) · [Operations](features/OPERATIONS.md)

## Interaction and accessibility

- Keep the page heading and shell navigation. Preserve keyboard focus while text streams. Announce meaningful phase changes politely, and announce an approval or terminal blocker once without stealing focus. Keep token deltas and countdown ticks out of live announcements.
- Opening Run details moves focus to its heading or selected section. Closing returns focus to the trigger, or to the run summary if the trigger disappeared. Opening the decision never focuses **Approve once** by default. Escape dismisses the details surface. The pending request remains visible in the conversation.
- Use text labels for every state. Use theme status colors as support. At 320 px, keep the key action and navigation in reading order, allow paths to wrap, and confine horizontal scrolling for code to its evidence region. Keep one overlay active at a time, including history and details.
- Use public Astryx building blocks for the existing shell, composer, navigation, drawer, controls and feedback. The implementation agent chooses the exact composition and confirms supported slots and keyboard behavior against the installed package. A scoped text patch in the existing CodeBlock is sufficient for the Changes view when the authorized artifact supplies a patch. [Frontend reuse rules](../frontend/README.md)

## Browser acceptance

| Gate | Walkthrough and observable result |
| --- | --- |
| A1–A3 | Start with ordinary Chat and verify the existing stream, models, attachments and Stop. Switch to Repository task and submit once. Drop the admission response and double-click the recovery action. Observe one task. Show eligible models, explain unavailable configuration, and show an actionable capacity or budget refusal when reported. |
| A4–A5 | Open the exact scoped patch review with keyboard and touch. Approve once, then repeat in separate runs with denial, expiry, revocation and a stale decision from a second tab. Show one decision outcome and keep approval separate from tool effects. Stop during execution and check the eventual verdict plus confirmed changes. |
| A6 | Reload mid-message and during approval. Repeat with duplicate and missing text deltas, an expired cursor and a recovering worker. Keep exact assistant text, one run, one approval request and one terminal outcome. Reopen a conversation with both modes and answer a clarification without retyping the original task. |
| A7 | Complete the formatter example and reopen it from history. The scoped patch, current required checks, preserved baseline and cleanup are readable. Repeat with a missing check, a changed candidate and a partial stop. A passing historical check or an assistant success message cannot label the current run complete. |
| A8–A9 | Try to open another workspace's run or artifact by ID, and check expired evidence. Confirm the same navigation and verdict hierarchy for a second repository with multiple criteria. Exercise both wide and 320 px layouts, keyboard-only review, screen-reader status announcements and long file paths. |

Use scripted fixtures for render and state coverage. Qualify the full production flow in staging through Chat with the enabled model, repository executor, approval service, verification and artifact boundary. The [implementation plan](IMPLEMENTATION-PLAN.md#acceptance-matrix) remains the release authority.
