"use client";

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { GATEWAY_ACCESS_CHANGED, gatewayMessage, gatewayRequest, jsonBody } from "./gateway-client";

interface GatewayAccess {
  authenticated: boolean;
  workspaceId?: string;
  actorId?: string;
  roles?: string[];
}

const AccessContext = createContext<GatewayAccess | null>(null);

export function useGatewayAccess() {
  return useContext(AccessContext);
}

export function GatewayAccessGate({ children }: { children: ReactNode }) {
  const parent = useGatewayAccess();
  return parent ? children : <GatewaySignIn>{children}</GatewaySignIn>;
}

function GatewaySignIn({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<GatewayAccess | null>(null);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let controller: AbortController | undefined;
    try {
      for (const key of ["api_key", "base_url", "model", "fetched_for_url", "all_models"]) {
        localStorage.removeItem("kantha_provider_" + key);
      }
    } catch {
      // Browser storage may be disabled.
    }
    const check = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      gatewayRequest<GatewayAccess>("/api/gateway/access", { signal: request.signal })
        .then((data) => { if (!request.signal.aborted) setAccess(data); })
        .catch(() => {
          if (!request.signal.aborted) {
            setAccess((previous) => previous ?? { authenticated: false });
            setError("Gateway access is unavailable. Try again when the service is ready.");
          }
        });
    };
    check();
    window.addEventListener(GATEWAY_ACCESS_CHANGED, check);
    window.addEventListener("focus", check);
    return () => {
      controller?.abort();
      window.removeEventListener(GATEWAY_ACCESS_CHANGED, check);
      window.removeEventListener("focus", check);
    };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await gatewayRequest<GatewayAccess>("/api/gateway/access", {
        method: "POST",
        ...jsonBody({ token }),
      });
      setToken("");
      setAccess(result);
      window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
    } catch (error) {
      setError(gatewayMessage(error, "Could not sign in to the gateway. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  if (access?.authenticated) {
    return <AccessContext.Provider key={access.workspaceId + ":" + access.actorId} value={access}>{children}</AccessContext.Provider>;
  }

  return (
    <Card className="mx-auto my-12 w-[calc(100%-2rem)] max-w-md">
      <CardHeader>
        <CardTitle>Gateway sign-in</CardTitle>
        <CardDescription>Enter the access token for your workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        {!access ? (
          <p role="status" className="text-sm text-neutral-600">Checking workspace access…</p>
        ) : (
          <form className="space-y-4" onSubmit={signIn}>
            <TextInput
              label="Workspace access token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={setToken}
            />
            {process.env.NODE_ENV !== "production" && (
              <div className="flex items-center justify-between text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
                <span className="truncate mr-2">Dev token configured in <code className="font-mono">.env</code></span>
                <button
                  type="button"
                  onClick={() => setToken("kantha-dev-workspace-access-token-32chars")}
                  className="shrink-0 text-neutral-900 hover:underline font-semibold cursor-pointer"
                >
                  Fill Dev Token
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <DashboardButton type="submit" disabled={!token || submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </DashboardButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function GatewaySignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);
    try {
      await gatewayRequest("/api/gateway/access", { method: "DELETE" });
      window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
    } catch (error) {
      setError(gatewayMessage(error, "Could not sign out. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <DashboardButton variant="secondary" size="sm" onClick={signOut} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </DashboardButton>
      {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
