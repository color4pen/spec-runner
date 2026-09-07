/**
 * TC-044: 無効 job で `resume --from pr-create` が exit 2 で拒否される
 *
 * Given: githubIntegration.enabled === false の job
 * When: resume --from pr-create を実行する
 * Then: Invalid --from value エラーが throw され、exit 2 となる
 *       (resume.ts では PrepareError(2, ...) に変換される)
 */
import { describe, it, expect } from "vitest";
import {
  buildAllowedStepSet,
  resolveResumeStep,
} from "../../../src/core/resume/resolve-step.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";

const PR_CREATE = STEP_NAMES.PR_CREATE;

// ---------------------------------------------------------------------------
// TC-044: disabled job — `--from pr-create` is rejected
// ---------------------------------------------------------------------------

describe("TC-044: resume --from pr-create is rejected for disabled GitHub integration job", () => {
  const DISABLED = { enabled: false };
  const ENABLED = { enabled: true };

  it("buildAllowedStepSet excludes pr-create when disabled", () => {
    const allowed = buildAllowedStepSet([], DISABLED);
    expect(allowed.has(PR_CREATE)).toBe(false);
  });

  it("buildAllowedStepSet includes pr-create when enabled", () => {
    const allowed = buildAllowedStepSet([], ENABLED);
    expect(allowed.has(PR_CREATE)).toBe(true);
  });

  it("resolveResumeStep throws for --from pr-create when disabled", () => {
    const allowed = buildAllowedStepSet([], DISABLED);
    expect(() =>
      resolveResumeStep(PR_CREATE, null, "adr-gen", allowed, []),
    ).toThrow(/Invalid --from value.*pr-create/);
  });

  it("resolveResumeStep does NOT throw for --from pr-create when enabled", () => {
    const allowed = buildAllowedStepSet([], ENABLED);
    expect(() =>
      resolveResumeStep(PR_CREATE, null, "adr-gen", allowed, []),
    ).not.toThrow();
    const result = resolveResumeStep(PR_CREATE, null, "adr-gen", allowed, []);
    expect(result).toBe(PR_CREATE);
  });

  it("error message mentions the requested step name", () => {
    const allowed = buildAllowedStepSet([], DISABLED);
    let thrown: unknown;
    try {
      resolveResumeStep(PR_CREATE, null, "adr-gen", allowed, []);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("pr-create");
  });

  it("state step is NOT changed (buildAllowedStepSet still returns valid steps)", () => {
    const allowed = buildAllowedStepSet([], DISABLED);
    // The design step is still allowed even when GitHub integration is disabled
    expect(allowed.has(STEP_NAMES.DESIGN)).toBe(true);
    expect(allowed.has(STEP_NAMES.IMPLEMENTER)).toBe(true);
    expect(allowed.has(STEP_NAMES.ADR_GEN)).toBe(true);
    // Only pr-create is excluded
    expect(allowed.has(PR_CREATE)).toBe(false);
  });
});
