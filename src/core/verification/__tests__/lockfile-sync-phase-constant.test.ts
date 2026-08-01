/**
 * Cross-boundary tooth: LOCKFILE_SYNC_PHASE consistency.
 *
 * runner.ts keeps a local `const LOCKFILE_SYNC_PHASE = "lockfile-sync"` to avoid
 * a static import of lockfile-sync.ts (which would trigger vi.mock TDZ errors in tests).
 * lockfile-sync.ts exports `LOCKFILE_SYNC_PHASE` independently.
 *
 * If either value drifts, the fail-fast skip result written by runner.ts and the gate
 * result written by runLockfileSyncGate will carry different phase names — producing
 * a malformed verification-result.md that no other gate catches.
 *
 * This test pins the canonical value so any divergence causes a deterministic failure.
 *
 * TC-LSP-01: LOCKFILE_SYNC_PHASE export from lockfile-sync.ts equals "lockfile-sync".
 *             If this fails, update runner.ts's local const to match (or vice versa).
 */
import { describe, it, expect } from "vitest";
import { LOCKFILE_SYNC_PHASE } from "../lockfile-sync.js";

// Canonical value — must match the local const in runner.ts:28.
const RUNNER_LOCAL_CONST = "lockfile-sync" as const;

describe("TC-LSP-01: LOCKFILE_SYNC_PHASE cross-boundary invariant", () => {
  it("LOCKFILE_SYNC_PHASE export equals the canonical string 'lockfile-sync'", () => {
    expect(LOCKFILE_SYNC_PHASE).toBe(RUNNER_LOCAL_CONST);
  });

  it("LOCKFILE_SYNC_PHASE export is the string literal 'lockfile-sync' (not a superset)", () => {
    // Exact string check: protects against rename without updating runner.ts.
    expect(LOCKFILE_SYNC_PHASE).toStrictEqual("lockfile-sync");
  });
});
