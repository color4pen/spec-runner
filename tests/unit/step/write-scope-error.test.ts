/**
 * Unit tests for writeScopeViolationError factory.
 *
 * TC-015: writeScopeViolationError code is "WRITE_SCOPE_VIOLATION"
 * TC-016: writeScopeViolationError message contains all violatedPaths
 *
 * NOTE: These tests are intentionally RED until:
 *   1. ERROR_CODES.WRITE_SCOPE_VIOLATION is added to src/errors.ts
 *   2. writeScopeViolationError factory is added to src/errors.ts
 */
import { describe, it, expect } from "vitest";
import { writeScopeViolationError } from "../../../src/errors.js";

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: writeScopeViolationError — code is WRITE_SCOPE_VIOLATION
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-015: writeScopeViolationError — error code", () => {
  it("returns an error with code WRITE_SCOPE_VIOLATION", () => {
    const violatedPaths = ["specrunner/changes/s/request.md"];
    const err = writeScopeViolationError("implementer", "feat/my-branch", violatedPaths);

    expect(err.code).toBe("WRITE_SCOPE_VIOLATION");
  });

  it("is a SpecRunnerError instance", () => {
    const violatedPaths = ["specrunner/changes/s/request.md"];
    const err = writeScopeViolationError("implementer", "feat/my-branch", violatedPaths);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: writeScopeViolationError — message includes all violatedPaths
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-016: writeScopeViolationError — message includes all violatedPaths", () => {
  it("includes request.md and spec.md in the message when both are violated", () => {
    const violatedPaths = [
      "specrunner/changes/s/request.md",
      "specrunner/changes/s/spec.md",
    ];
    const err = writeScopeViolationError("implementer", "feat/branch", violatedPaths);

    expect(err.message).toContain("specrunner/changes/s/request.md");
    expect(err.message).toContain("specrunner/changes/s/spec.md");
  });

  it("includes all violated paths in the message for a single-violation case", () => {
    const violatedPaths = ["specrunner/changes/s/request.md"];
    const err = writeScopeViolationError("implementer", "feat/branch", violatedPaths);

    expect(err.message).toContain("specrunner/changes/s/request.md");
  });

  it("includes judge artifact paths in the message", () => {
    const violatedPaths = [
      "specrunner/changes/s/request.md",
      "specrunner/changes/s/spec-review-result-001.md",
    ];
    const err = writeScopeViolationError("implementer", "feat/branch", violatedPaths);

    expect(err.message).toContain("specrunner/changes/s/request.md");
    expect(err.message).toContain("specrunner/changes/s/spec-review-result-001.md");
  });

  it("hint mentions worktree inspection and resume for recovery", () => {
    const violatedPaths = ["specrunner/changes/s/request.md"];
    const err = writeScopeViolationError("implementer", "feat/branch", violatedPaths);

    // The hint should guide the user to fix the worktree before resuming
    expect(err.hint).toBeTruthy();
    expect(err.hint.length).toBeGreaterThan(0);
  });
});
