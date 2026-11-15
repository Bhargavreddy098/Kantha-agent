"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEvent, RunStateChangedPayload } from "@/lib/gateway/contracts/event";
import type { GatewayApproval } from "@/lib/gateway/contracts/approval";
import type { GatewayRun, RunSnapshot, RunStatus } from "@/lib/gateway/contracts/run";
import { gatewayMessage, gatewayRequest, GatewayRequestError, jsonBody } from "./gateway-client";

function isTerminal(status: RunStatus) {
  return status === "completed" || status === "cancelled" || status === "failed" || status === "interrupted";
}

export function useGatewayEvents(sessionId: string | undefined, onSnapshot: (snapshot: RunSnapshot) => void) {
  const [run, setRun] = useState<GatewayRun | null>(null);
  const [approval, setApproval] = useState<GatewayApproval | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const [loadedSession, setLoadedSession] = useState<string>();
  const snapshotCallback = useRef(onSnapshot);
  const reload = useRef<() => Promise<RunSnapshot | undefined>>(async () => undefined);

  useEffect(() => {
    snapshotCallback.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<RunSnapshot | undefined> | undefined;
    let cursor = 0;
    const path = "/api/gateway/sessions/" + encodeURIComponent(sessionId);

    const refresh = () => {
      if (controller.signal.aborted) return Promise.resolve(undefined);
      if (pending) return pending;
      pending = gatewayRequest<RunSnapshot>(path, { signal: controller.signal }).then((snapshot) => {
        if (controller.signal.aborted) return undefined;
        setRun(snapshot.run);
        setLoadedSession(sessionId);
        setError(undefined);
        setApproval((previous) => {
          if (snapshot.pendingApproval) {
            if (previous?.id === snapshot.pendingApproval.id &&
                previous.status !== "waiting" && snapshot.pendingApproval.status === "waiting") return previous;
            return snapshot.pendingApproval;
          }
          return previous?.sessionId === sessionId && previous.runId === snapshot.run?.id ? previous : null;
        });
        snapshotCallback.current(snapshot);
        return snapshot;
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return undefined;
        setLoadedSession(sessionId);
        if (error instanceof GatewayRequestError && error.status === 404) {
          setRun(null);
          setApproval(null);
          setError("This conversation is unavailable. Start a new conversation to continue.");
        } else {
          setError(gatewayMessage(error, "Could not refresh this conversation."));
        }
        throw error;
      }).finally(() => {
        pending = undefined;
      });
      return pending;
    };
    reload.current = refresh;

    const scheduleSnapshot = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        const earlier = pending;
        void (async () => {
          await earlier?.catch(() => undefined);
          await refresh().catch(() => undefined);
        })();
      }, 350);
    };

    const reconnect = () => {
      source?.close();
      if (retry) return;
      setConnecting(true);
      retry = setTimeout(() => {
        retry = undefined;
        void connect();
      }, 1500);
    };

    const connect = async () => {
      try {
        const snapshot = await refresh();
        if (!snapshot || controller.signal.aborted) return;
        cursor = snapshot.watermark;
      } catch (error) {
        if (!controller.signal.aborted && (!(error instanceof GatewayRequestError) || ![401, 403, 404].includes(error.status))) {
          reconnect();
        }
        return;
      }

      const query = new URLSearchParams({ sessionId, cursor: String(cursor) });
      source = new EventSource("/api/gateway/events?" + query.toString());
      source.onopen = () => setConnecting(false);
      source.onerror = reconnect;
      source.onmessage = (message) => {
        let event: GatewayEvent;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        if (event.type === "resync.requested") {
          reconnect();
          return;
        }
        if (event.sessionId !== sessionId || event.sequence <= cursor) return;
        cursor = event.sequence;
        if (event.type === "run.state_changed") {
          const { newState } = event.data as RunStateChangedPayload;
          if (newState && event.runId) {
            const runId = event.runId;
            setRun((current) => current?.id === runId ? { ...current, status: newState } : current);
          }
          scheduleSnapshot();
        }
        if (event.type === "approval.requested") {
          setApproval(event.data as GatewayApproval);
          scheduleSnapshot();
        }
        if (event.type === "run.delta" || event.type === "approval.resolved" ||
            event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
          scheduleSnapshot();
        }
      };
    };

    void connect();
    return () => {
      controller.abort();
      source?.close();
      if (retry) clearTimeout(retry);
      if (refreshTimer) clearTimeout(refreshTimer);
      reload.current = async () => undefined;
    };
  }, [sessionId]);

  const approvalId = approval?.id;
  const approvalSession = approval?.sessionId;
  const approvalStatus = approval?.status;
  const approvalExpiry = approval?.expiresAt;
  useEffect(() => {
    if (!approvalId || !approvalExpiry || approvalStatus !== "waiting" || approvalSession !== sessionId) return;
    const controller = new AbortController();
    const expiry = Math.max(Date.parse(approvalExpiry) - Date.now() + 200, 0);
    const timer = setTimeout(() => {
      const path = "/api/gateway/approvals/" + encodeURIComponent(approvalId);
      gatewayRequest<GatewayApproval>(path, { signal: controller.signal })
        .then((latest) => { if (!controller.signal.aborted) setApproval(latest); })
        .catch(() => undefined);
    }, expiry);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [approvalId, approvalExpiry, approvalSession, approvalStatus, sessionId]);

  const resolveApproval = useCallback(async (approvalId: string, decision: "approve" | "reject", actionVersion: number) => {
    const path = "/api/gateway/approvals/" + encodeURIComponent(approvalId);
    try {
      const decisionResult = await gatewayRequest<GatewayApproval>(path, {
        method: "POST",
        ...jsonBody({ decision, actionVersion }),
      });
      setApproval(decisionResult);
      void reload.current().catch(() => undefined);
    } catch (error) {
      const observed = await gatewayRequest<GatewayApproval>(path).catch(() => undefined);
      if (observed) setApproval(observed);
      void reload.current().catch(() => undefined);
      if (!observed || observed.status !== (decision === "approve" ? "approved" : "rejected")) {
        throw error;
      }
    }
  }, []);

  const cancel = useCallback(async (runId: string) => {
    const cancelled = await gatewayRequest<GatewayRun>("/api/gateway/runs/" + encodeURIComponent(runId) + "/cancel", {
      method: "POST",
      ...jsonBody({ reason: "Cancelled from Chat" }),
    });
    setRun(cancelled);
    return cancelled;
  }, []);
  const refresh = useCallback(() => reload.current(), []);

  return {
    run: run?.sessionId === sessionId ? run : null,
    approval: approval?.sessionId === sessionId ? approval : null,
    loading: Boolean(sessionId && loadedSession !== sessionId),
    reconnecting: Boolean(sessionId && connecting && (!run || !isTerminal(run.status))),
    error: sessionId ? error : undefined,
    refresh,
    rememberApproval: setApproval,
    resolveApproval,
    cancel,
  };
}
