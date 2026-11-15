export const MODEL_CATALOG_CHANGED = "kantha:catalog-changed";
export const GATEWAY_ACCESS_CHANGED = "kantha:access-changed";

export class GatewayRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
  }
}

export async function readGatewayError(response: Response): Promise<GatewayRequestError> {
  const data = await response.json().catch(() => null);
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
  return response.status === 204 ? (undefined as T) : response.json();
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
