/**
 * Unit tests for buildRunResult and formatRunResultJson.
 *
 * TC-005: awaiting-archive → pr-created
 * TC-006: escalation (awaiting-resume) → awaiting-human
 * TC-007: loop 枯渇 (awaiting-resume) → awaiting-human
 * TC-008: 恒久失敗 (failed) → failed
 * TC-009: pr-created has prUrl, reason is null
 * TC-010: failed has reason, prUrl is null
 * TC-011: awaiting-human has halted step and reason
 * TC-015: awaiting-resume without resumePoint uses error for reason
 * TC-016: awaiting-archive without PR URL → prUrl null
 * TC-017: failed without error → reason has fallback message
 * TC-018: schemaVersion is 1 for all kinds
 * TC-019: buildRunResult is pure (no side effects)
 * TC-020: formatRunResultJson returns 2-space indent + trailing newline
 */
import { describe, it, expect, vi } from "vitest";
import { buildRunResult, formatRunResultJson } from "../../../../src/core/command/run-result.js";
import type { RunResultContract } from "../../../../src/core/command/run-result.js";
import type { JobState } from "../../../../src/state/schema.js";

function baseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "job-abc-123",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-feature" },
    repository: { owner: "org", name: "repo" },
    session: null,
    step: "pr-create",
    status: "running",
    branch: "feat/test-feature-abc",
    history: [],
    error: null,
    ...overrides,
  };
}

// TC-005 / TC-009: awaiting-archive → pr-created, prUrl set, reason null
describe("TC-005/TC-009: awaiting-archive maps to pr-created", () => {
  it("returns pr-created with prUrl when pullRequest is set", () => {
    const state = baseState({
      status: "awaiting-archive",
      step: "pr-create",
      pullRequest: { url: "https://github.com/org/repo/pull/42", number: 42, createdAt: "2026-01-01" },
    });
    const contract = buildRunResult(state, "test-feature");

    expect(contract.result).toBe("pr-created");
    expect(contract.prUrl).toBe("https://github.com/org/repo/pull/42");
    expect(contract.reason).toBeNull();
    expect(contract.step).toBe("pr-create");
    expect(contract.slug).toBe("test-feature");
    expect(contract.jobId).toBe("job-abc-123");
    expect(contract.schemaVersion).toBe(1);
  });
});

// TC-016: awaiting-archive without pullRequest → prUrl null
describe("TC-016: awaiting-archive without pullRequest → prUrl null", () => {
  it("returns prUrl null when no pullRequest", () => {
    const state = baseState({ status: "awaiting-archive", step: "pr-create" });
    const contract = buildRunResult(state, "test-feature");

    expect(contract.result).toBe("pr-created");
    expect(contract.prUrl).toBeNull();
    expect(contract.reason).toBeNull();
  });
});

// TC-006 / TC-011: awaiting-resume (escalation) → awaiting-human
describe("TC-006/TC-011: awaiting-resume (escalation) maps to awaiting-human", () => {
  it("returns awaiting-human with resumePoint step and reason", () => {
    const state = baseState({
      status: "awaiting-resume",
      step: "spec-review",
      resumePoint: {
        step: "spec-review",
        reason: "escalation: requires human judgment",
        iterationsExhausted: 3,
      },
    });
    const contract = buildRunResult(state, "my-slug");

    expect(contract.result).toBe("awaiting-human");
    expect(contract.step).toBe("spec-review");
    expect(contract.reason).not.toBeNull();
    expect(contract.reason!.message).toBe("escalation: requires human judgment");
    expect(contract.reason!.code).toBeNull();
    expect(contract.prUrl).toBeNull();
    expect(contract.slug).toBe("my-slug");
    expect(contract.jobId).toBe("job-abc-123");
    expect(contract.schemaVersion).toBe(1);
  });
});

// TC-007: awaiting-resume (loop 枯渇) → awaiting-human
describe("TC-007: awaiting-resume (loop 枯渇) maps to awaiting-human", () => {
  it("returns awaiting-human for loop exhaustion case", () => {
    const state = baseState({
      status: "awaiting-resume",
      step: "code-review",
      resumePoint: {
        step: "code-review",
        reason: "code-review did not approve after 5 iterations",
        iterationsExhausted: 5,
        exhaustionPhase: "review-exhausted",
      },
    });
    const contract = buildRunResult(state, "feature-x");

    expect(contract.result).toBe("awaiting-human");
    expect(contract.step).toBe("code-review");
    expect(contract.reason!.message).toBe("code-review did not approve after 5 iterations");
  });
});

// TC-015: awaiting-resume without resumePoint → error used for reason
describe("TC-015: awaiting-resume without resumePoint uses error for reason", () => {
  it("returns awaiting-human with error code/message when resumePoint is absent", () => {
    const state = baseState({
      status: "awaiting-resume",
      step: "code-fixer",
      resumePoint: null,
      error: { code: "ERR_X", message: "something failed", hint: "" },
    });
    const contract = buildRunResult(state, "my-slug");

    expect(contract.result).toBe("awaiting-human");
    expect(contract.reason!.code).toBe("ERR_X");
    expect(contract.reason!.message).toBe("something failed");
    expect(contract.step).toBe("code-fixer");
  });
});

// TC-015b: awaiting-resume with neither resumePoint nor error → fallback message
describe("TC-015b: awaiting-resume with no resumePoint and no error → fallback message", () => {
  it("uses default fallback message when neither resumePoint nor error is set", () => {
    const state = baseState({
      status: "awaiting-resume",
      step: "implementer",
      resumePoint: null,
      error: null,
    });
    const contract = buildRunResult(state, "slug");

    expect(contract.result).toBe("awaiting-human");
    expect(contract.reason!.message).toBe("awaiting human judgment");
    expect(contract.reason!.code).toBeNull();
  });
});

// TC-008 / TC-010: failed → failed kind, reason set, prUrl null
describe("TC-008/TC-010: failed maps to failed kind", () => {
  it("returns failed with error code and message, prUrl null when no PR", () => {
    const state = baseState({
      status: "failed",
      step: "spec-review",
      error: { code: "SESSION_TERMINATED", message: "Session was terminated", hint: "" },
    });
    const contract = buildRunResult(state, "my-slug");

    expect(contract.result).toBe("failed");
    expect(contract.reason!.code).toBe("SESSION_TERMINATED");
    expect(contract.reason!.message).toBe("Session was terminated");
    expect(contract.prUrl).toBeNull();
    expect(contract.step).toBe("spec-review");
    expect(contract.slug).toBe("my-slug");
    expect(contract.jobId).toBe("job-abc-123");
    expect(contract.schemaVersion).toBe(1);
  });
});

// TC-017: failed without error → fallback message in reason
describe("TC-017: failed without error → reason has fallback message", () => {
  it("returns failed with non-empty fallback reason message when error is null", () => {
    const state = baseState({ status: "failed", step: "verification", error: null });
    const contract = buildRunResult(state, "slug");

    expect(contract.result).toBe("failed");
    expect(contract.reason).not.toBeNull();
    expect(contract.reason!.code).toBeNull();
    expect(typeof contract.reason!.message).toBe("string");
    expect(contract.reason!.message.length).toBeGreaterThan(0);
  });
});

// TC-018: schemaVersion is always 1
describe("TC-018: schemaVersion is 1 for all result kinds", () => {
  it("returns schemaVersion: 1 for awaiting-archive", () => {
    const state = baseState({ status: "awaiting-archive" });
    expect(buildRunResult(state, "s").schemaVersion).toBe(1);
  });

  it("returns schemaVersion: 1 for awaiting-resume", () => {
    const state = baseState({
      status: "awaiting-resume",
      resumePoint: { step: "spec-review", reason: "esc", iterationsExhausted: 1 },
    });
    expect(buildRunResult(state, "s").schemaVersion).toBe(1);
  });

  it("returns schemaVersion: 1 for failed", () => {
    const state = baseState({ status: "failed" });
    expect(buildRunResult(state, "s").schemaVersion).toBe(1);
  });
});

// TC-019: buildRunResult is a pure function (no side effects, deterministic)
describe("TC-019: buildRunResult is pure", () => {
  it("returns identical output on repeated calls with the same input", () => {
    // Spy on global I/O to verify no side effects
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    const stderrSpy = vi.spyOn(process.stderr, "write");

    const state = baseState({ status: "awaiting-archive", step: "pr-create" });
    const contract1 = buildRunResult(state, "slug");
    const contract2 = buildRunResult(state, "slug");

    expect(contract1).toEqual(contract2);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

// TC-020: formatRunResultJson returns JSON.stringify(contract, null, 2) + "\n"
describe("TC-020: formatRunResultJson format", () => {
  it("returns 2-space indented JSON with trailing newline", () => {
    const contract: RunResultContract = {
      schemaVersion: 1,
      result: "pr-created",
      slug: "my-feature",
      jobId: "abc-123",
      step: "pr-create",
      prUrl: "https://github.com/org/repo/pull/1",
      reason: null,
    };
    const output = formatRunResultJson(contract);
    expect(output).toBe(JSON.stringify(contract, null, 2) + "\n");
    expect(output.endsWith("\n")).toBe(true);
  });
});

// Additional: awaiting-resume with PR URL
describe("awaiting-resume with pullRequest URL", () => {
  it("includes prUrl in awaiting-human result", () => {
    const state = baseState({
      status: "awaiting-resume",
      step: "code-review",
      pullRequest: { url: "https://github.com/org/repo/pull/9", number: 9, createdAt: "2026-01-01" },
      resumePoint: { step: "code-review", reason: "needs review", iterationsExhausted: 0 },
    });
    const contract = buildRunResult(state, "slug");

    expect(contract.result).toBe("awaiting-human");
    expect(contract.prUrl).toBe("https://github.com/org/repo/pull/9");
  });
});

// All fields populated: slug, jobId, step
describe("all required fields are populated", () => {
  it("pr-created has slug, jobId, step", () => {
    const state = baseState({ status: "awaiting-archive", step: "pr-create" });
    const contract = buildRunResult(state, "the-slug");

    expect(contract.slug).toBe("the-slug");
    expect(contract.jobId).toBe("job-abc-123");
    expect(contract.step).toBe("pr-create");
  });

  it("failed has slug, jobId, step", () => {
    const state = baseState({ status: "failed", step: "verification" });
    const contract = buildRunResult(state, "the-slug");

    expect(contract.slug).toBe("the-slug");
    expect(contract.jobId).toBe("job-abc-123");
    expect(contract.step).toBe("verification");
  });
});
