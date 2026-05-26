import { describe, it, expect } from "vitest";
import { KeepAlive } from "../keepalive.js";

/**
 * Behavioral assertions about KeepAlive lifecycle during async work.
 * These tests verify that the event loop stays alive during work and is
 * released after completion (or on error via finally).
 */
describe("KeepAlive integration", () => {
  it("KeepAlive stays active during async work", async () => {
    const ka = new KeepAlive();
    ka.acquire();

    let activeMiddle = false;
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        activeMiddle = ka.isActive;
        resolve();
      });
    });

    expect(activeMiddle).toBe(true);
    ka.release();
  });

  it("KeepAlive is released after work completes", async () => {
    const ka = new KeepAlive();
    ka.acquire();

    await Promise.resolve(); // simulated async work

    ka.release();
    expect(ka.isActive).toBe(false);
  });

  it("KeepAlive is released in finally even on error", async () => {
    const ka = new KeepAlive();
    ka.acquire();

    let caughtError: Error | null = null;
    try {
      await Promise.reject(new Error("simulated pipeline failure"));
    } catch (err) {
      caughtError = err as Error;
    } finally {
      ka.release();
    }

    expect(caughtError?.message).toBe("simulated pipeline failure");
    expect(ka.isActive).toBe(false);
  });

  it("After release, can re-acquire for next pipeline", () => {
    const ka = new KeepAlive();
    ka.acquire();
    ka.release();
    expect(ka.isActive).toBe(false);

    ka.acquire();
    expect(ka.isActive).toBe(true);
    ka.release();
    expect(ka.isActive).toBe(false);
  });
});
