/**
 * Tests for the shared pid resolver (T-01).
 *
 * TC-013: resolveJobPid — statePid wins over sidecar
 * TC-014: resolveJobPid — sidecar adopted on jobId match
 * TC-015: resolveJobPid — sidecar rejected on jobId mismatch
 *
 * All tests are pure (no fs I/O required).
 */
import { describe, it, expect } from "vitest";
import { resolveJobPid } from "../../../../src/core/liveness/resolve-pid.js";

// Minimal sidecar shape used by resolveJobPid
function makeSidecar(pid: number | null, jobId: string | null) {
  return { pid, jobId };
}

describe("resolveJobPid — pure unit tests", () => {
  // TC-013
  it("TC-013: statePid wins over sidecar when statePid is set", () => {
    const sidecar = makeSidecar(5678, "job-a");
    const result = resolveJobPid({ statePid: 1234, sidecar, expectedJobId: "job-a" });

    expect(result.pid).toBe(1234);
    expect(result.source).toBe("state");
  });

  // TC-013 edge: statePid present even when sidecar has different pid and matching jobId
  it("TC-013 (edge): statePid wins even when sidecar pid differs", () => {
    const sidecar = makeSidecar(9999, "job-x");
    const result = resolveJobPid({ statePid: 42, sidecar, expectedJobId: "job-x" });

    expect(result.pid).toBe(42);
    expect(result.source).toBe("state");
  });

  // TC-014
  it("TC-014: sidecar pid adopted when statePid is null and jobId matches", () => {
    const sidecar = makeSidecar(5678, "job-a");
    const result = resolveJobPid({ statePid: null, sidecar, expectedJobId: "job-a" });

    expect(result.pid).toBe(5678);
    expect(result.source).toBe("sidecar");
  });

  // TC-015
  it("TC-015: sidecar pid rejected when jobId does not match", () => {
    const sidecar = makeSidecar(5678, "job-b");
    const result = resolveJobPid({ statePid: null, sidecar, expectedJobId: "job-a" });

    expect(result.pid).toBeNull();
    expect(result.source).toBeNull();
  });

  // TC-015 edge: null sidecar is handled
  it("TC-015 (edge): null sidecar yields null pid", () => {
    const result = resolveJobPid({ statePid: null, sidecar: null, expectedJobId: "job-a" });

    expect(result.pid).toBeNull();
    expect(result.source).toBeNull();
  });
});
