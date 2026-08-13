/**
 * Unit tests for the inactivity watchdog (TC-010 through TC-013).
 *
 * TC-010: watchdog unit — bump 無しで timeoutMs 経過すると onFire が 1 回発火する
 * TC-011: watchdog unit — 発火後の bump() は再 arm しない
 * TC-012: watchdog unit — clear() 後はタイマーが発火しない
 * TC-013: watchdog unit — formatInactivityTimeoutMessage が step 名と elapsedMs を含む
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createInactivityWatchdog,
  formatInactivityTimeoutMessage,
  DEFAULT_INACTIVITY_TIMEOUT_MS,
} from "../inactivity-watchdog.js";

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// TC-010: bump 無しで timeoutMs 経過すると onFire が 1 回発火する
// ---------------------------------------------------------------------------

describe("TC-010: bump 無しで timeoutMs 経過すると onFire が 1 回発火する", () => {
  it("onFire called exactly once after timeoutMs; fired===true and elapsedMs===timeoutMs", () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const timeoutMs = 1000;
    const watchdog = createInactivityWatchdog(onFire, timeoutMs);

    watchdog.bump(); // arm the timer

    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(timeoutMs);

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(watchdog.fired).toBe(true);
    expect(watchdog.elapsedMs).toBe(timeoutMs);
  });
});

// ---------------------------------------------------------------------------
// TC-011: 発火後の bump() は再 arm しない
// ---------------------------------------------------------------------------

describe("TC-011: 発火後の bump() は再 arm しない", () => {
  it("after fire, bump() is a no-op — onFire is not called a second time", () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const timeoutMs = 500;
    const watchdog = createInactivityWatchdog(onFire, timeoutMs);

    watchdog.bump();
    vi.advanceTimersByTime(timeoutMs);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(watchdog.fired).toBe(true);

    // bump after fire should not re-arm the timer
    watchdog.bump();
    vi.advanceTimersByTime(timeoutMs);

    expect(onFire).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});

// ---------------------------------------------------------------------------
// TC-012: clear() 後はタイマーが発火しない
// ---------------------------------------------------------------------------

describe("TC-012: clear() 後はタイマーが発火しない", () => {
  it("after clear() the armed timer does not fire; multiple clear() calls are safe", () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const timeoutMs = 800;
    const watchdog = createInactivityWatchdog(onFire, timeoutMs);

    watchdog.bump();           // arm timer
    watchdog.clear();          // disarm
    watchdog.clear();          // idempotent — must not throw

    vi.advanceTimersByTime(timeoutMs);

    expect(onFire).not.toHaveBeenCalled();
    expect(watchdog.fired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-013: formatInactivityTimeoutMessage が step 名と elapsedMs を含む
// ---------------------------------------------------------------------------

describe("TC-013: formatInactivityTimeoutMessage が step 名と elapsedMs を含む", () => {
  it("output string contains 'inactivity', the step name, and elapsedMs as string", () => {
    const stepName = "my-step";
    const elapsedMs = 900_000;
    const msg = formatInactivityTimeoutMessage(stepName, elapsedMs);

    expect(msg).toContain("inactivity");
    expect(msg).toContain(stepName);
    expect(msg).toContain(String(elapsedMs));
  });

  it("DEFAULT_INACTIVITY_TIMEOUT_MS equals 900000 (15 minutes)", () => {
    expect(DEFAULT_INACTIVITY_TIMEOUT_MS).toBe(900_000);
  });
});

// ---------------------------------------------------------------------------
// Extra: bump が繰り返されるとタイマーが巻き直される（TC-002 の unit level 検証）
// ---------------------------------------------------------------------------

describe("watchdog unit — bump 繰り返しでタイマーが巻き直される", () => {
  it("repeated bumps within timeoutMs prevent onFire; fire happens timeoutMs after last bump", () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const timeoutMs = 1000;
    const watchdog = createInactivityWatchdog(onFire, timeoutMs);

    // arm at t=0, would fire at t=1000
    watchdog.bump();
    vi.advanceTimersByTime(500); // t=500ms — not yet fired

    // reset at t=500ms, would fire at t=1500ms
    watchdog.bump();
    vi.advanceTimersByTime(500); // t=1000ms — old timer was cancelled, new fires at 1500ms
    expect(onFire).not.toHaveBeenCalled(); // not fired yet

    vi.advanceTimersByTime(500); // t=1500ms — fires now
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});
