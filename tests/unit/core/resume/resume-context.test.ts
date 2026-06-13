import { describe, expect, it } from "vitest";
import { buildResumePrompt, type ResumeContextSnapshot } from "../../../../src/core/resume/resume-context.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";

const baseState: JobState = {
  version: 2,
  jobId: "job-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  request: { path: "request.md", title: "Test", type: "spec-change", slug: "test-slug" },
  repository: { owner: "owner", name: "repo" },
  session: null,
  step: "implementer",
  status: "running",
  branch: "change/test",
  history: [],
  error: null,
  steps: {},
};

function makeRun(overrides: Partial<StepRun> = {}): StepRun {
  return {
    attempt: 1,
    sessionId: "session-1",
    outcome: {
      verdict: "escalation",
      findingsPath: "specrunner/changes/test/findings.md",
      error: null,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function makeResumeContext(
  overrides: Partial<ResumeContextSnapshot["resumePoint"]> = {},
): ResumeContextSnapshot {
  return {
    resumePoint: {
      step: "implementer",
      reason: "escalation",
      iterationsExhausted: 2,
      ...overrides,
    },
  };
}

describe("buildResumePrompt", () => {
  it("returns undefined when no automatic context qualifies and no human prompt exists", () => {
    expect(buildResumePrompt({ state: baseState, stepName: "implementer" })).toBeUndefined();
    expect(
      buildResumePrompt({
        state: baseState,
        stepName: "design",
        resumeContext: makeResumeContext(),
      }),
    ).toBeUndefined();
  });

  it("returns the human prompt unchanged when automatic context does not qualify", () => {
    expect(
      buildResumePrompt({
        state: baseState,
        stepName: "design",
        resumeContext: makeResumeContext(),
        humanResumePrompt: "operator note",
      }),
    ).toBe("operator note");
  });

  it("renders attempt numbers, previous verdict, stop metadata, findings path, and resume semantics", () => {
    const state: JobState = {
      ...baseState,
      steps: { implementer: [makeRun()] },
    };

    const prompt = buildResumePrompt({
      state,
      stepName: "implementer",
      resumeContext: makeResumeContext({ exhaustionPhase: "review-exhausted" }),
    });

    expect(prompt).toContain("## Automatic resume context");
    expect(prompt).toContain("- previousAttempt: 1");
    expect(prompt).toContain("- currentAttempt: 2");
    expect(prompt).toContain("- previousVerdict: escalation");
    expect(prompt).toContain("- previousFindingsPath: specrunner/changes/test/findings.md");
    expect(prompt).toContain("- stopReason: escalation");
    expect(prompt).toContain("- iterationsExhausted: 2");
    expect(prompt).toContain("- exhaustionPhase: review-exhausted");
    expect(prompt).toContain("existing worktree artifacts may be from a previous attempt");
    expect(prompt).toContain("do not mean the current attempt is complete");
    expect(prompt).toContain("Work or judge again for this attempt.");
  });

  it("selects the latest prior attempt and calculates the upcoming attempt", () => {
    const state: JobState = {
      ...baseState,
      steps: {
        implementer: [
          makeRun({ attempt: 1, outcome: { verdict: "needs-fix", findingsPath: null, error: null } }),
          makeRun({ attempt: 2, outcome: { verdict: "approved", findingsPath: "latest.md", error: null } }),
        ],
      },
    };

    const prompt = buildResumePrompt({
      state,
      stepName: "implementer",
      resumeContext: makeResumeContext({ reason: "timeout", iterationsExhausted: 0 }),
    });

    expect(prompt).toContain("- previousAttempt: 2");
    expect(prompt).toContain("- currentAttempt: 3");
    expect(prompt).toContain("- previousVerdict: approved");
    expect(prompt).toContain("- previousFindingsPath: latest.md");
    expect(prompt).toContain("- stopReason: timeout");
  });

  it("returns byte-identical output for identical inputs", () => {
    const state: JobState = {
      ...baseState,
      steps: { implementer: [makeRun()] },
    };
    const input = {
      state,
      stepName: "implementer",
      resumeContext: makeResumeContext(),
      humanResumePrompt: "please re-check",
    };

    expect(buildResumePrompt(input)).toBe(buildResumePrompt(input));
  });

  it("renders unknown placeholders for missing optional previous metadata", () => {
    const state: JobState = {
      ...baseState,
      steps: {
        implementer: [
          makeRun({
            outcome: { verdict: null, findingsPath: null, error: null },
          }),
        ],
      },
    };

    const prompt = buildResumePrompt({
      state,
      stepName: "implementer",
      resumeContext: makeResumeContext(),
    });

    expect(prompt).toContain("- previousVerdict: unknown");
    expect(prompt).toContain("- previousFindingsPath: unknown");
    expect(prompt).not.toContain("- exhaustionPhase:");
  });

  it("appends human prompt after automatic context", () => {
    const state: JobState = {
      ...baseState,
      steps: { implementer: [makeRun()] },
    };

    const prompt = buildResumePrompt({
      state,
      stepName: "implementer",
      resumeContext: makeResumeContext(),
      humanResumePrompt: "human supplement",
    });

    expect(prompt).toContain("## Automatic resume context");
    expect(prompt).toContain("## Human supplied resume note");
    expect(prompt?.indexOf("## Automatic resume context")).toBeLessThan(
      prompt?.indexOf("human supplement") ?? -1,
    );
  });
});
