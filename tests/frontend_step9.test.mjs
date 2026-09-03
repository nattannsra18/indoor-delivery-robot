import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiError,
  getCurrentUser,
  setUnauthorizedHandler
} from "../src/lib/api.ts";
import {
  classifyAuthenticatedFailure,
  logoutWithLocalTeardown,
  shouldReconnectDashboardWebSocket
} from "../src/lib/authLifecycle.ts";

test("logout tears down local auth before awaiting server revocation", async () => {
  const events = [];
  let resolveRequest;
  const request = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const logout = logoutWithLocalTeardown(
    () => events.push("teardown"),
    async () => {
      events.push("request-started");
      await request;
    }
  );
  assert.deepEqual(events, ["teardown", "request-started"]);
  resolveRequest();
  await logout;
});

test("logout completes when server revocation has a network failure", async () => {
  let tornDown = false;
  await logoutWithLocalTeardown(
    () => { tornDown = true; },
    async () => { throw new TypeError("NetworkError"); }
  );
  assert.equal(tornDown, true);
});

test("401 remains distinct and causes session loss rather than offline", () => {
  const failure = classifyAuthenticatedFailure(
    new ApiError(401, "Authentication required")
  );
  assert.deepEqual(failure, {
    kind: "unauthorized",
    message: "Authentication required"
  });
});

test("an authenticated API 401 notifies the auth lifecycle", async () => {
  const originalFetch = globalThis.fetch;
  let lost = false;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ detail: "Authentication required" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" }
    }
  );
  setUnauthorizedHandler(() => { lost = true; });
  try {
    await assert.rejects(
      getCurrentUser(),
      (error) => error instanceof ApiError && error.status === 401
    );
    assert.equal(lost, true);
  } finally {
    setUnauthorizedHandler(undefined);
    globalThis.fetch = originalFetch;
  }
});

test("403 remains an authorization error and does not cause logout", () => {
  const failure = classifyAuthenticatedFailure(
    new ApiError(403, "Administrator access required")
  );
  assert.equal(failure.kind, "http");
});

test("genuine network failure is classified as backend offline", () => {
  const failure = classifyAuthenticatedFailure(new TypeError("NetworkError"));
  assert.deepEqual(failure, { kind: "network", message: "NetworkError" });
});

test("logout and policy close cannot start a WebSocket reconnect loop", () => {
  assert.equal(shouldReconnectDashboardWebSocket(true, 1000), false);
  assert.equal(shouldReconnectDashboardWebSocket(false, 1008), false);
  assert.equal(shouldReconnectDashboardWebSocket(false, 1006), true);
});
