"use client";

import { useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useHarnessRun } from "@/hooks/use-harness-run";
import { scriptedModelId, type FixtureScenario } from "@/lib/harness/scenario";
import { createHarnessSession, type HarnessSubmitInput } from "@/lib/harness/client";

function newInputId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function verdictVariant(verdict: string | undefined): "neutral" | "success" | "warning" {
  return verdict === "completed" ? "success" : verdict === "failed" ? "warning" : "neutral";
}

/** Chat-side connection to the durable harness run projection. */
export function HarnessRunPanel({ sessionId }: { sessionId?: string }) {
  const [activeSession, setActiveSession] = useState(sessionId);
  const harness = useHarnessRun(activeSession);
  const lastInput = useRef<HarnessSubmitInput | undefined>(undefined);
  const [scenario, setScenario] = useState<FixtureScenario>("pass");
  const [localError, setLocalError] = useState<string>();

  const buildInput = (inputId: string): HarnessSubmitInput => ({
    inputId,
    sessionId: sessionId ?? "",
    task: `Verify the zero-value formatter fix in the granted fixture repository (${scenario}).`,
    scope: { repositoryId: "fixture-repository", allowedRoots: ["src/"] },
    pinned: {
      baseRevision: "fixture-base",
      modelId: scriptedModelId(scenario),
      profile: { maxSteps: 4, maxRepairs: 0, maxElapsedMs: 20_000 },
    },
  });

  const submit = async (replay: boolean) => {
    setLocalError(undefined);
    try {
      let target = replay && lastInput.current ? lastInput.current : buildInput(newInputId());
      if (!target.sessionId) {
        const session = await createHarnessSession();
        setActiveSession(session.id);
        target = { ...target, sessionId: session.id };
      }
      lastInput.current = target;
      await harness.start(target);
    } catch {
      // The hook exposes the gateway error for the status line.
    }
  };

  const view = harness.view;
  const entries = view?.entries ?? [];
  const toolEntries = entries.filter((entry) => entry.type === "tool_result" || entry.type === "verification" || entry.type === "handoff");

  return (
    <Card width="100%" padding={3} data-testid="harness-run-panel">
      <Stack direction="vertical" gap={2}>
        <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
          <Text type="large" as="h2">Harness run</Text>
          <Badge variant={verdictVariant(view?.outcome?.status === "completed" ? "completed" : view?.verification?.verdict)} label={view?.phase ?? "idle"} />
          {harness.connecting && <Badge variant="info" label="connecting" />}
        </Stack>

        <Text type="body">
          {view
            ? `Step ${view.step} · ${view.status} · ${view.outcome?.status ?? "in progress"}`
            : "Run a scoped fixture task to inspect, use an inert tool and verify a known check."}
        </Text>

        {harness.error || localError ? (
          <Text type="body" role="alert">{localError ?? harness.error}</Text>
        ) : null}

        <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
          <label>
            <span>Fixture outcome</span>{" "}
            <select value={scenario} onChange={(event) => setScenario(event.target.value as FixtureScenario)}>
              <option value="pass">pass</option>
              <option value="fail">fail</option>
              <option value="cancel">cancel</option>
              <option value="malformed">malformed tool call</option>
            </select>
          </label>
          <Button label="Run task" variant="primary" size="sm" isDisabled={harness.busy} clickAction={() => void submit(false)} />
          {harness.runId && (
            <Button label="Resubmit same input" variant="secondary" size="sm" isDisabled={harness.busy} clickAction={() => void submit(true)} />
          )}
          {harness.runId && (
            <Button label="Stop" variant="destructive" size="sm" isDisabled={harness.busy} clickAction={() => void harness.stop()} />
          )}
          <Button label="Recover runs" variant="ghost" size="sm" isDisabled={harness.busy} clickAction={() => void harness.recover()} />
        </Stack>

        {harness.runId && <Text type="body">Run {harness.runId}</Text>}

        {view?.verification && (
          <Stack direction="vertical" gap={1}>
            <Badge
              variant={verdictVariant(view.verification.verdict)}
              label={`Verification: ${view.verification.verdict}`}
            />
            {view.verification.results.map((result) => (
              <Text key={result.criterionId} type="body">
                {result.criterionId}: {result.status} — {result.detail}
              </Text>
            ))}
          </Stack>
        )}

        {toolEntries.length > 0 && (
          <Collapsible trigger={<Text type="body">Run evidence ({toolEntries.length})</Text>} defaultIsOpen={false}>
            <Stack direction="vertical" gap={1}>
              {toolEntries.map((entry) => (
                <Text key={entry.id} type="body">
                  {entry.type} · step {entry.step} · {JSON.stringify(entry.data).slice(0, 240)}
                </Text>
              ))}
            </Stack>
          </Collapsible>
        )}
      </Stack>
    </Card>
  );
}
