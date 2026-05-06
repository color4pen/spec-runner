/**
 * Unit tests for finish preflight — MERGED bypass and UNKNOWN retry.
 *
 * TC-013: MERGED + mergeStateStatus UNKNOWN → bypass retry, return success immediately
 * TC-014: OPEN + mergeStateStatus UNKNOWN → retry logic runs (existing behavior)
 */
import { describe, it, expect, vi } from "vitest";
import { fetchPrViewWithRetryForTest } from "../../../../src/core/finish/preflight.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// TC-013: MERGED PR with UNKNOWN mergeStateStatus → bypass retry, success
// ---------------------------------------------------------------------------

describe("TC-013: preflight MERGED bypass — MERGED + UNKNOWN → immediate success", () => {
  it("returns ok:true without retrying when state=MERGED and mergeStateStatus=UNKNOWN", async () => {
    const spawnCalls: number[] = [];

    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        spawnCalls.push(1);
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "MERGED",
            mergeStateStatus: "UNKNOWN",
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("MERGED");
    }
    // Should NOT have slept — bypass returns immediately
    expect(sleepFn).not.toHaveBeenCalled();
    // gh pr view called only once (no retry)
    expect(spawnCalls).toHaveLength(1);
  });

  it("returns the parsed MERGED PR data in the success result", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, _args: string[]) =>
      Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({
          state: "MERGED",
          mergeStateStatus: "UNKNOWN",
          headRefName: "feat/my-feature",
        }),
        stderr: "",
      }),
    );

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 99,
      cwd: "/tmp",
      spawn,
      slug: "my-feature",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.headRefName).toBe("feat/my-feature");
      expect(result.data.mergeStateStatus).toBe("UNKNOWN");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-014: OPEN PR with UNKNOWN mergeStateStatus → retry logic runs as before
// ---------------------------------------------------------------------------

describe("TC-014: preflight MERGED bypass — OPEN + UNKNOWN → retry logic runs", () => {
  it("retries when state=OPEN and mergeStateStatus=UNKNOWN (MERGED bypass does not fire)", async () => {
    let callCount = 0;

    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        callCount++;
        // First two calls: OPEN + UNKNOWN; third call: OPEN + CLEAN
        const mergeStateStatus = callCount < 3 ? "UNKNOWN" : "CLEAN";
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "OPEN",
            mergeStateStatus,
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("OPEN");
      expect(result.data.mergeStateStatus).toBe("CLEAN");
    }
    // Should have slept at least once (retry fired)
    expect(sleepFn).toHaveBeenCalled();
    // Called more than once (retried)
    expect(callCount).toBeGreaterThan(1);
  });

  it("escalates after all retries exhausted for OPEN + UNKNOWN", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "OPEN",
            mergeStateStatus: "UNKNOWN",
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("UNKNOWN");
    }
  });
});
