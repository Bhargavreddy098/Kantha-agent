import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CircuitBreakerRegistry,
  classifyGatewayError,
  computeBackoffMs,
} from "../circuit-breaker";

describe("Gateway Resilience: classifyGatewayError & computeBackoffMs", () => {
  it("classifies 429 rate limits as retryable and circuit-tripping, honoring Retry-After", () => {
    const res = classifyGatewayError({
      statusCode: 429,
      message: "Temporarily rate-limited upstream",
      responseHeaders: { "retry-after": "3" },
    });
    assert.equal(res.kind, "rate_limit");
    assert.equal(res.retryable, true);
    assert.equal(res.shouldTripCircuit, true);
    assert.equal(res.retryAfterMs, 3000);
  });

  it("classifies 401/403 auth and 402 budget errors as non-retryable and non-tripping", () => {
    const auth = classifyGatewayError({ statusCode: 401, message: "Invalid API key" });
    assert.equal(auth.kind, "auth");
    assert.equal(auth.retryable, false);
    assert.equal(auth.shouldTripCircuit, false);

    const budget = classifyGatewayError({ statusCode: 402, message: "Budget exceeded" });
    assert.equal(budget.kind, "budget");
    assert.equal(budget.retryable, false);
    assert.equal(budget.shouldTripCircuit, false);
  });

  it("classifies 503 server errors and timeouts as retryable", () => {
    const srv = classifyGatewayError({ statusCode: 503, message: "Service unavailable" });
    assert.equal(srv.kind, "server_error");
    assert.equal(srv.retryable, true);
    assert.equal(srv.shouldTripCircuit, true);

    const to = classifyGatewayError({ name: "TimeoutError", message: "Request timed out" });
    assert.equal(to.kind, "timeout");
    assert.equal(to.retryable, true);
  });

  it("computes bounded exponential backoff with deterministic jitter and Retry-After precedence", () => {
    assert.equal(computeBackoffMs(0, 400, 6000, undefined, () => 0), 400);
    assert.equal(computeBackoffMs(1, 400, 6000, undefined, () => 0), 800);
    assert.equal(computeBackoffMs(2, 400, 6000, undefined, () => 1), 2000);
    assert.equal(computeBackoffMs(10, 400, 6000, undefined, () => 1), 6000);
    assert.equal(computeBackoffMs(0, 400, 6000, 2500, () => 0), 2500);
  });
});

describe("Gateway Resilience: CircuitBreakerRegistry", () => {
  it("opens after failureThreshold, transitions to half_open after cooldown, and closes on probe success", () => {
    const reg = new CircuitBreakerRegistry({ failureThreshold: 3, cooldownMs: 1000 });
    const target = "openrouter:google/gemma-4-31b-it:free";

    assert.equal(reg.canExecute(target, 100).allowed, true);

    reg.recordFailure(target, "429", true, 100);
    reg.recordFailure(target, "429", true, 200);
    assert.equal(reg.canExecute(target, 250).allowed, true);

    // 3rd consecutive failure opens the circuit
    const state = reg.recordFailure(target, "429", true, 300);
    assert.equal(state, "open");
    assert.equal(reg.canExecute(target, 500).allowed, false);
    assert.equal(reg.getSnapshot(500).status, "degraded");

    // After cooldown -> half_open
    const probe = reg.canExecute(target, 1400);
    assert.equal(probe.allowed, true);
    assert.equal(probe.state, "half_open");

    // Successful probe closes circuit and updates latency EMA
    reg.recordSuccess(target, 320, 1500);
    const snap = reg.getSnapshot(1500);
    assert.equal(snap.status, "healthy");
    assert.equal(snap.providers[0].state, "closed");
    assert.equal(snap.providers[0].latencyEmaMs, 320);
    assert.equal(snap.totals.successes, 1);
    assert.equal(snap.totals.failures, 3);
  });

  it("tracks retries and fallbacks in health snapshots", () => {
    const reg = new CircuitBreakerRegistry();
    reg.recordRetry("openrouter:openrouter/free");
    reg.recordFallback("openrouter:openrouter/free");
    reg.recordSuccess("openrouter:google/gemma-4-31b-it:free", 450);

    const snap = reg.getSnapshot();
    assert.equal(snap.totals.retries, 1);
    assert.equal(snap.totals.fallbacks, 1);
    assert.equal(snap.totals.requests, 1);
  });
});
