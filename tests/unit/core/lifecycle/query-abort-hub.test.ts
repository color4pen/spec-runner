/**
 * Tests for QueryAbortHub (T-05).
 *
 * TC-017: drain resolves promptly when last controller deregisters
 * TC-018: drain resolves at the bound when controller never deregisters
 * TC-019: abortActive on empty hub is a no-op (no throw)
 *
 * Tests are intentionally RED until src/core/lifecycle/query-abort-hub.ts is created.
 */
import { describe, it, expect } from "vitest";
import { QueryAbortHub } from "../../../../src/core/lifecycle/query-abort-hub.js";

describe("QueryAbortHub", () => {
  // TC-019
  it("TC-019: abortActive on empty hub does not throw", () => {
    const hub = new QueryAbortHub();
    expect(() => hub.abortActive()).not.toThrow();
  });

  // TC-019 edge: register then deregister then abortActive
  it("TC-019 (edge): abortActive after all deregistered does not throw", () => {
    const hub = new QueryAbortHub();
    const controller = new AbortController();
    const deregister = hub.register(controller);
    deregister();
    expect(() => hub.abortActive()).not.toThrow();
  });

  // TC-017: register → abortActive → drain resolves promptly
  it("TC-017: drain resolves promptly once controller deregisters after abort", async () => {
    const hub = new QueryAbortHub();
    const controller = new AbortController();

    // Register the controller and wire it to auto-deregister on abort
    const deregister = hub.register(controller);
    controller.signal.addEventListener("abort", deregister, { once: true });

    const fakeSleep = (_ms: number): Promise<void> => Promise.resolve();

    // abortActive aborts the controller → fires deregister → set empties
    hub.abortActive();
    expect(controller.signal.aborted).toBe(true);

    // drain should resolve immediately (set is already empty)
    const start = Date.now();
    await hub.drain(5000, fakeSleep);
    const elapsed = Date.now() - start;

    // Should resolve well before the 5s bound (effectively instantly with fakeSleep)
    expect(elapsed).toBeLessThan(500);
  });

  // TC-017 edge: abortActive sets controller aborted
  it("TC-017 (edge): register then abortActive marks controller as aborted", () => {
    const hub = new QueryAbortHub();
    const controller = new AbortController();
    hub.register(controller);

    hub.abortActive();

    expect(controller.signal.aborted).toBe(true);
  });

  // TC-018: drain resolves at bound when controller never deregisters
  it("TC-018: drain resolves at bound when controller never deregisters", async () => {
    const hub = new QueryAbortHub();
    const controller = new AbortController();
    hub.register(controller);
    // NOTE: do NOT deregister — controller stays in the set

    let sleepCallCount = 0;
    // Fake sleep that counts invocations but resolves immediately
    const fakeSleep = (_ms: number): Promise<void> => {
      sleepCallCount++;
      return Promise.resolve();
    };

    const timeoutMs = 200;
    await hub.drain(timeoutMs, fakeSleep);

    // drain must have returned (did not hang)
    // sleepCallCount > 0 confirms the poll loop ran
    expect(sleepCallCount).toBeGreaterThan(0);
    // controller is still registered (was never deregistered)
    // — drain must not deregister it (only abortActive does)
  });

  // TC-018 edge: drain with zero registered controllers returns immediately
  it("TC-018 (edge): drain on empty hub resolves immediately", async () => {
    const hub = new QueryAbortHub();
    let slept = false;
    const fakeSleep = (_ms: number): Promise<void> => {
      slept = true;
      return Promise.resolve();
    };

    await hub.drain(1000, fakeSleep);

    // Empty hub — no sleep needed
    expect(slept).toBe(false);
  });
});
