/**
 * Unit tests for retryWithBackoff helper.
 *
 * Tests cover both throw-based (isTransientError) and
 * return-value-based (shouldRetryResult) retry paths.
 */
import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "../../src/util/retry.js";

const noop = () => Promise.resolve();

describe("retryWithBackoff", () => {
  it("returns result immediately on first success (no retry)", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true });

    const result = await retryWithBackoff(fn, { sleepFn: noop });

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shouldRetryResult: retries twice then returns 3rd result", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const result = await retryWithBackoff(fn, {
      shouldRetryResult: (r: { ok: boolean }) => !r.ok,
      maxAttempts: 4,
      sleepFn: noop,
    });

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("isTransientError: retries once then returns 2nd result", async () => {
    const transient = new Error("transient");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce("success");

    const result = await retryWithBackoff(fn, {
      isTransientError: (e) => e === transient,
      maxAttempts: 4,
      sleepFn: noop,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("shouldRetryResult exhausted: returns last result without throwing", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false });

    const result = await retryWithBackoff(fn, {
      shouldRetryResult: (r: { ok: boolean }) => !r.ok,
      maxAttempts: 3,
      sleepFn: noop,
    });

    expect(result).toEqual({ ok: false });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("isTransientError exhausted: re-throws last error", async () => {
    const err = new Error("transient");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, {
        isTransientError: () => true,
        maxAttempts: 3,
        sleepFn: noop,
      }),
    ).rejects.toThrow("transient");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("onRetry is called with correct attempt numbers and info", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ n: 1, ok: false })
      .mockResolvedValueOnce({ n: 2, ok: false })
      .mockResolvedValueOnce({ n: 3, ok: true });

    const onRetry = vi.fn();

    await retryWithBackoff(fn, {
      shouldRetryResult: (r: { n: number; ok: boolean }) => !r.ok,
      maxAttempts: 4,
      sleepFn: noop,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]).toEqual([1, { result: { n: 1, ok: false } }]);
    expect(onRetry.mock.calls[1]).toEqual([2, { result: { n: 2, ok: false } }]);
  });

  it("delay is exponential: sleepFn called with 1000, 2000, 4000", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await retryWithBackoff(fn, {
      shouldRetryResult: (r: { ok: boolean }) => !r.ok,
      maxAttempts: 4,
      baseDelayMs: 1000,
      sleepFn,
    });

    expect(sleepFn).toHaveBeenCalledTimes(3);
    expect(sleepFn.mock.calls[0]![0]).toBe(1000);
    expect(sleepFn.mock.calls[1]![0]).toBe(2000);
    expect(sleepFn.mock.calls[2]![0]).toBe(4000);
  });

  it("shouldRetryResult undefined: returns result without retry", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false });

    const result = await retryWithBackoff(fn, { sleepFn: noop });

    expect(result).toEqual({ ok: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isTransientError undefined: re-throws error without retry", async () => {
    const err = new Error("boom");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(retryWithBackoff(fn, { sleepFn: noop })).rejects.toThrow("boom");

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
