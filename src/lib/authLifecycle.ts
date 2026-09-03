export type AuthenticatedFailure =
  | { kind: "unauthorized"; message: string }
  | { kind: "http"; message: string }
  | { kind: "network"; message: string };

export async function logoutWithLocalTeardown(
  teardown: () => void,
  revokeSession: () => Promise<void>
): Promise<void> {
  teardown();
  try {
    await revokeSession();
  } catch {
    // Local logout must complete even when the backend is unreachable.
  }
}

export function classifyAuthenticatedFailure(
  error: unknown,
  fallbackMessage = "Unable to connect to FastAPI"
): AuthenticatedFailure {
  if (
    error instanceof Error
    && error.name === "ApiError"
    && "status" in error
    && typeof error.status === "number"
  ) {
    return {
      kind: error.status === 401 ? "unauthorized" : "http",
      message: error.message
    };
  }
  return {
    kind: "network",
    message: error instanceof Error ? error.message : fallbackMessage
  };
}

export function shouldReconnectDashboardWebSocket(
  stopped: boolean,
  closeCode: number
): boolean {
  return !stopped && closeCode !== 1008;
}
