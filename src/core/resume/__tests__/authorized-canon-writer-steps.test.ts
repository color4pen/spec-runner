/**
 * Integration test for authorizedCanonWriterSteps helper (tamper-provenance-baseline T-02).
 *
 * TC-017: authorizedCanonWriterSteps が標準 pipeline で test-case-gen / spec-fixer / operator-apply を含む
 *
 * Source: tasks.md > T-02
 *
 * This test uses the actual pipeline descriptor steps (integration test) to verify
 * that the helper correctly identifies which steps own test-cases.md.
 */

import { describe, it, expect } from "vitest";
import { authorizedCanonWriterSteps } from "../canon-provenance.js";
import { STANDARD_DESCRIPTOR } from "../../pipeline/registry.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../../step/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-authorized-writers-slug";

function makeMinimalState(): JobState {
  return {
    version: 2,
    jobId: "job-authorized-writers-test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test authorized canon writers",
      type: "new-feature",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "bite-evidence",
    status: "running",
    branch: `change/${SLUG}-abc12345`,
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): StepDeps {
  return {
    slug: SLUG,
    cwd: "/tmp/test",
    config: {
      runtime: "local",
      version: 1,
    } as never,
    request: {
      type: "new-feature",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "",
      adr: false,
      path: `specrunner/changes/${SLUG}/request.md`,
    },
  } as unknown as StepDeps;
}

// ---------------------------------------------------------------------------
// TC-017: authorizedCanonWriterSteps が標準 pipeline で正しい集合を返す
// ---------------------------------------------------------------------------

describe("TC-017: authorizedCanonWriterSteps が標準 pipeline で test-case-gen / spec-fixer / operator-apply を含む", () => {
  it("TC-017: 標準 pipeline descriptor で test-case-gen と spec-fixer と operator-apply が返る", () => {
    const canonPath = `specrunner/changes/${SLUG}/test-cases.md`;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const writers = authorizedCanonWriterSteps(canonPath, STANDARD_DESCRIPTOR.steps, state, deps);

    // Must include all authorized step/operator tokens
    expect(writers).toBeInstanceOf(Set);
    expect(writers.has("test-case-gen")).toBe(true);
    expect(writers.has("spec-fixer")).toBe(true);
    expect(writers.has("operator-apply")).toBe(true);

    // Should not include unauthorized steps
    expect(writers.has("implementer")).toBe(false);
    expect(writers.has("code-review")).toBe(false);
    expect(writers.has("verification")).toBe(false);
  });

  it("TC-017: 空の steps 配列は operator-apply のみを含む集合を返す", () => {
    const canonPath = `specrunner/changes/${SLUG}/test-cases.md`;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const writers = authorizedCanonWriterSteps(canonPath, [], state, deps);

    // operator-apply is always added
    expect(writers.has("operator-apply")).toBe(true);
    // No steps contributed
    expect(writers.has("test-case-gen")).toBe(false);
    expect(writers.has("spec-fixer")).toBe(false);
  });

  it("TC-017: 異なる canonPath (bite-evidence-result.md) では test-case-gen/spec-fixer は含まれない", () => {
    // bite-evidence-result.md is written only by BiteEvidenceStep, not test-case-gen/spec-fixer
    const otherPath = `specrunner/changes/${SLUG}/bite-evidence-result.md`;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const writers = authorizedCanonWriterSteps(otherPath, STANDARD_DESCRIPTOR.steps, state, deps);

    // operator-apply is always present
    expect(writers.has("operator-apply")).toBe(true);
    // test-case-gen and spec-fixer don't own bite-evidence-result.md
    expect(writers.has("test-case-gen")).toBe(false);
    expect(writers.has("spec-fixer")).toBe(false);
  });

  it("TC-017: 返り値は Set<string> インスタンスで size > 0", () => {
    const canonPath = `specrunner/changes/${SLUG}/test-cases.md`;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const writers = authorizedCanonWriterSteps(canonPath, STANDARD_DESCRIPTOR.steps, state, deps);

    expect(writers instanceof Set).toBe(true);
    expect(writers.size).toBeGreaterThan(0);
  });
});
