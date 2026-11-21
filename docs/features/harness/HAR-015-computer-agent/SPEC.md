# Orgo computer-use agent

The Gateway offers a server-side computer agent powered by the Vercel AI SDK. An assigned workspace owner submits a task for a dedicated Orgo desktop. The Harness takes a new screenshot before each decision and supports a left click, text entry, and navigation keys.

The Gateway keeps the computer UUID and credential server-side, verifies the operator and model selection, and meters every physical provider call. A run may take up to five actions and has a 50-second deadline. Each action has a committed journal entry before dispatch. An uncertain acknowledgement ends the run and the submitted run ID cannot be reused.

## Configure and run

1. Provision a dedicated Orgo computer and start it. For the first smoke run, use a Linux desktop with a harmless app open.
2. Configure `ORGO_API_KEY`, `GATEWAY_ORGO_COMPUTER_ID`, `GATEWAY_ORGO_WORKSPACE_ID`, and `GATEWAY_ORGO_ACTOR_ID` in the Gateway process environment. For local development, use `.env.local`. Prefer an Orgo key restricted to the assigned computer.
3. In Gateway settings, save an active provider connection and choose an eligible model that supports both image input and function tools. The model provider receives the task and screenshots during the run.
4. Authenticate to the Gateway as the assigned owner and submit the following JSON to `POST /api/gateway/computer-agent`.

```http
POST /api/gateway/computer-agent
Content-Type: application/json

{
  "runId": "19aa7527-8866-4ef8-bd85-41994233bcde",
  "task": "Read the title of the open window and report it.",
  "connectionId": "<saved provider connection ID>",
  "modelId": "<eligible model ID>"
}
```

The response includes `runId`, `status` (`answered` or `step_limit`), `text`, and the ordered `actions` by kind. Use a fresh UUID for each new task. After a failed or interrupted run, inspect the desktop before resubmitting instructions that could repeat an effect.

This pilot runs on the existing single-Gateway deployment with durable SQLite. Desktop lifecycle, screen selection, public URLs, chat UI, OpenCode integration, and Composio are separate work. Run and action receipts are kept in SQLite. Screenshots, prompts, and typed text are omitted from those receipts. [Vercel AI SDK agent overview](https://ai-sdk.dev/docs/agents/overview) · [Orgo screenshot API](https://docs.orgo.ai/api-reference/computers/screenshot)
