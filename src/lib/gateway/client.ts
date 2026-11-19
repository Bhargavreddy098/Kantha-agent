export const MODEL_CATALOG_CHANGED = "kantha:catalog-changed";
export const GATEWAY_ACCESS_CHANGED = "kantha:access-changed";

export class GatewayRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

export async function readGatewayError(response: Response): Promise<GatewayRequestError> {
  let data: { message?: string; error?: string; code?: string } | null = null;
  try {
    data = (await response.json()) as { message?: string; error?: string; code?: string };
  } catch {
    data = null;
  }
  const message =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    `Gateway request failed (HTTP ${response.status}).`;
  return new GatewayRequestError(message, response.status, data?.code);
}

export async function gatewayRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/gateway/access") {
      window.dispatchEvent(new Event(GATEWAY_ACCESS_CHANGED));
    }
    throw await readGatewayError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function jsonBody(body: unknown): Pick<RequestInit, "headers" | "body"> {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function gatewayMessage(error: unknown, fallback: string): string {
  return error instanceof GatewayRequestError ? error.message : fallback;
}
