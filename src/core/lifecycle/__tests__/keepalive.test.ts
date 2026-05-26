import { describe, it, expect } from "vitest";
import { KeepAlive } from "../keepalive.js";

describe("KeepAlive", () => {
  it("isActive is false before acquire()", () => {
    const ka = new KeepAlive();
    expect(ka.isActive).toBe(false);
    ka.release(); // cleanup (no-op)
  });

  it("acquire → isActive === true", () => {
    const ka = new KeepAlive();
    ka.acquire();
    expect(ka.isActive).toBe(true);
    ka.release();
  });

  it("release → isActive === false", () => {
    const ka = new KeepAlive();
    ka.acquire();
    ka.release();
    expect(ka.isActive).toBe(false);
  });

  it("acquire 2回 → idempotent (timer は 1 つ)", () => {
    const ka = new KeepAlive();
    ka.acquire();
    const firstId = (ka as unknown as { _timerId: unknown })._timerId;
    ka.acquire();
    const secondId = (ka as unknown as { _timerId: unknown })._timerId;
    expect(firstId).toBe(secondId);
    expect(ka.isActive).toBe(true);
    ka.release();
  });

  it("release 2回 → 安全 (error なし)", () => {
    const ka = new KeepAlive();
    ka.acquire();
    ka.release();
    expect(() => ka.release()).not.toThrow();
    expect(ka.isActive).toBe(false);
  });

  it("acquire → release → acquire → 再取得可能", () => {
    const ka = new KeepAlive();
    ka.acquire();
    ka.release();
    expect(ka.isActive).toBe(false);
    ka.acquire();
    expect(ka.isActive).toBe(true);
    ka.release();
  });
});
