"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { GATEWAY_ACCESS_CHANGED, gatewayMessage, gatewayRequest, jsonBody } from "@/lib/gateway/client";

export interface GatewayAccess {
  authenticated: boolean;
  workspaceId?: string;
  actorId?: string;
  roles?: string[];
}

const accessPath = "/api/gateway/access";
const AccessContext = createContext<GatewayAccess | null>(null);

export function useGatewayAccess() {
  return useContext(AccessContext);
}

export function GatewayAccessGate({ children }: { children: ReactNode }) {
  const parent = useGatewayAccess();
  return parent ? children : <GatewaySignIn>{children}</GatewaySignIn>;
}

function GatewaySignIn({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<GatewayAccess>();
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    try {
      sessionStorage.removeItem("kantha:active_token");
      for (const key of ["api_key", "base_url", "model", "fetched_for_url", "all_models"]) {
        localStorage.removeItem("kantha_provider_" + key);
      }
    } catch {
      // The cookie session works with browser storage disabled.
    }

    function check(event?: Event) {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const headers = event?.type === GATEWAY_ACCESS_CHANGED
        ? { "x-kantha-signed-out": "true" }
        : undefined;
      void gatewayRequest<GatewayAccess>(accessPath, { signal: controller.signal, headers })
        .then((result) => {
          if (!controller.signal.aborted) setAccess(result);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setAccess({ authenticated: false });
          setError("Workspace access is unavailable. Try signing in again.");
        });
    }

    check();
    window.addEventListener(GATEWAY_ACCESS_CHANGED, check);
    window.addEventListener("focus", check);
    return () => {
      request.current?.abort();
      window.removeEventListener(GATEWAY_ACCESS_CHANGED, check);
      window.removeEventListener("focus", check);
    };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!token.trim() || pending) return;
    request.current?.abort();
    setPending(true);
    setError(undefined);
    try {
      const result = await gatewayRequest<GatewayAccess>(accessPath, {
        method: "POST",
        ...jsonBody({ token: token.trim() }),
      });
      request.current?.abort();
      setAccess(result);
      setToken("");
    } catch (cause) {
      setError(gatewayMessage(cause, "Could not sign in. Try again."));
    } finally {
      setPending(false);
    }
  }

  if (access?.authenticated) {
    return (
      <AccessContext.Provider key={JSON.stringify([access.workspaceId, access.actorId])} value={access}>
        {children}
      </AccessContext.Provider>
    );
  }

  return (
    <Center padding={4} height="100%">
      {access ? (
        <Card maxWidth={420} width="100%" padding={5}>
          <VStack gap={4}>
            <Heading level={1}>Sign in to Kantha</Heading>
            <Text as="p">Enter the access token issued for your workspace.</Text>
            <form onSubmit={signIn}>
              <FormLayout>
                <TextInput label="Workspace access token" type="password" value={token}
                  onChange={setToken} autoComplete="off" isDisabled={pending} />
                {error && <Banner status="error" role="alert" title={error} />}
                <Button type="submit" label="Sign in" variant="primary" isLoading={pending} isDisabled={!token.trim()} />
              </FormLayout>
            </form>
          </VStack>
        </Card>
      ) : <Text role="status">Loading workspace…</Text>}
    </Center>
  );
}

export function GatewaySignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);
    try {
      await gatewayRequest(accessPath, { method: "DELETE" });
      window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
    } catch (cause) {
      setError(gatewayMessage(cause, "Could not sign out. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <VStack gap={2}>
      <Button label="Sign out" variant="secondary" isLoading={pending} onClick={signOut} />
      {error && <Banner role="alert" status="error" title={error} />}
    </VStack>
  );
}
