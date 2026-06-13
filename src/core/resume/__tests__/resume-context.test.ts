import { describe, expect, it } from "vitest";
import { buildResumePrompt, type ResumeContextSnapshot } from "../resume-context.js";
import type { JobState, StepRun } from "../../../state/schema.js";

function makeStepRun(overrides: Partial<StepRun> = {}): StepRun {
  return {
    attempt: 1,
    sessionId: "session-1",
    startedAt: "2026-06-12T00:00:00.000Z",
    endedAt: "2026-06-12T00:05:00.000Z",
    outcome: {
      verdict: "escalation",
      findingsPath: "specrunner/changes/example/result.md",
      error: null,
      toolResult: null,
    },
    ...overrides,
  };
}

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-1",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    request: {
      path: "specrunner/changes/example/request.md",
      title: "Example",
      type: "bug-fix",
      slug: "example",
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/example",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeResumeContext(step = "design"): ResumeContextSnapshot {
  return {
    resumePoint: {
      step,
      reason: "timeout",
      iterationsExhausted: 2,
    },
  };
}

describe("buildResumePrompt", () => {
  it("returns undefined for a non-resume run", () => {
    const prompt = buildResumePrompt({
      state: makeState(),
      stepName: "design",
    });

    expect(prompt).toBeUndefined();
  });

  it("renders deterministic automatic resume context from state", () => {
    const prompt = buildResumePrompt({
      state: makeState({
        steps: {
          design: [makeStepRun()],
        },
      }),
      stepName: "design",
      resumeContext: makeResumeContext("design"),
    });

    expect(prompt).toContain("## Automatic resume context");
    expect(prompt).toContain("- resumedStep: design");
    expect(prompt).toContain("- previousAttempt: 1");
    expect(prompt).toContain("- currentAttempt: 2");
    expect(prompt).toContain("- previousVerdict: escalation");
    expect(prompt).toContain("- stopReason: timeout");
    expect(prompt).toContain("- iterationsExhausted: 2");
    expect(prompt).toContain(
      "Resume semantics: existing worktree artifacts may be from a previous attempt and do not mean the current attempt is complete.",
    );
  });

  it("appends a human resume note after the automatic context", () => {
    const prompt = buildResumePrompt({
      state: makeState({
        steps: {
          design: [makeStepRun()],
        },
      }),
      stepName: "design",
      resumeContext: makeResumeContext("design"),
      humanResumePrompt: "Please verify the prior escalation before proceeding.",
    });

    expect(prompt).toContain("## Automatic resume context");
    expect(prompt).toContain("## Human supplied resume note");
    expect(prompt).toContain("Please verify the prior escalation before proceeding.");
    expect(prompt?.indexOf("## Automatic resume context")).toBeLessThan(
      prompt?.indexOf("## Human supplied resume note") ?? -1,
    );
  });
});
