/**
 * Unit tests for DeltaSpecFixerStep
 *
 * TC-DSF-01: validation result file path is included in buildMessage
 * TC-DSF-02: agent definition uses SPEC_FIXER_SYSTEM_PROMPT
 * TC-DSF-03: completionVerdict is "approved"
 * TC-DSF-04: continuation prompt on second run
 */
import { describe, it, expect } from "vitest";
import { DeltaSpecFixerStep } from "../../../src/core/step/delta-spec-fixer.js";
import { NULL_PARSE_RESULT } from "../../../src/core/step/types.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/spec-fixer-system.js";
import { AGENT_TOOLSET_TYPE } from "../../../src/core/agent/definition.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { deltaSpecValidationResultPath, changeFolderPath } from "../../../src/util/paths.js";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "delta-spec-fixer",
    status: "running",
    branch: "feat/my-change",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(slug: string = "my-change"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug, baseBranch: "main", content: "content", enabled: [] },
    slug,
  };
}

// ---------------------------------------------------------------------------
// TC-DSF-01: buildMessage includes validation result file path
// ---------------------------------------------------------------------------
describe("TC-DSF-01: buildMessage includes validation result file path", () => {
  it("initial buildMessage contains the validation result file path", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    const expectedPath = deltaSpecValidationResultPath("my-change");
    expect(message).toContain(expectedPath);
  });

  it("initial buildMessage contains Change folder path", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain(changeFolderPath("my-change"));
  });

  it("initial buildMessage contains branch name", () => {
    const state = makeMinimalState({ branch: "feat/my-change" });
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("feat/my-change");
  });

  it("initial buildMessage contains fix instructions for canonical path", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("specs/<capability-name>/spec.md");
  });

  it("initial buildMessage is wrapped in <user-request> tags", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });

  it("initial message does NOT contain continuation phrase", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).not.toContain("前回の修正後に");
  });
});

// ---------------------------------------------------------------------------
// TC-DSF-01b: continuation prompt on second run
// ---------------------------------------------------------------------------
describe("TC-DSF-01b: continuation prompt on second run", () => {
  function makeStateWithPreviousDeltaSpecFixerRun(sessionId: string): JobState {
    return makeMinimalState({
      steps: {
        "delta-spec-fixer": [
          {
            attempt: 1,
            sessionId,
            outcome: { verdict: "approved" as const, findingsPath: null, error: null },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        "delta-spec-validation": [
          {
            attempt: 2,
            sessionId: null,
            outcome: {
              verdict: "needs-fix" as const,
              findingsPath: deltaSpecValidationResultPath("my-change"),
              error: null,
            },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
  }

  it("returns continuation prompt when previous session exists", () => {
    const state = makeStateWithPreviousDeltaSpecFixerRun("sess-dsf-001");
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain("前回の修正後に");
  });

  it("continuation prompt does not contain 'You are the delta-spec-fixer'", () => {
    const state = makeStateWithPreviousDeltaSpecFixerRun("sess-dsf-001");
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    // Should not contain the initial-message-specific phrase
    expect(message).not.toContain("You are the delta-spec-fixer");
  });

  it("continuation prompt contains the validation result path from state", () => {
    const state = makeStateWithPreviousDeltaSpecFixerRun("sess-dsf-001");
    const deps = makeMinimalDeps("my-change");
    const message = DeltaSpecFixerStep.buildMessage(state, deps);
    expect(message).toContain(deltaSpecValidationResultPath("my-change"));
  });
});

// ---------------------------------------------------------------------------
// TC-DSF-02: agent definition uses SPEC_FIXER_SYSTEM_PROMPT
// ---------------------------------------------------------------------------
describe("TC-DSF-02: agent definition uses SPEC_FIXER_SYSTEM_PROMPT", () => {
  it("agent.system equals SPEC_FIXER_SYSTEM_PROMPT", () => {
    expect(DeltaSpecFixerStep.agent.system).toBe(SPEC_FIXER_SYSTEM_PROMPT);
  });

  it("agent.role is 'delta-spec-fixer'", () => {
    expect(DeltaSpecFixerStep.agent.role).toBe("delta-spec-fixer");
  });

  it("agent.name is 'specrunner-delta-spec-fixer'", () => {
    expect(DeltaSpecFixerStep.agent.name).toBe("specrunner-delta-spec-fixer");
  });

  it("agent tools include AGENT_TOOLSET_TYPE", () => {
    expect(DeltaSpecFixerStep.agent.tools).toContainEqual({ type: AGENT_TOOLSET_TYPE });
  });
});

// ---------------------------------------------------------------------------
// TC-DSF-03: completionVerdict is "approved"
// ---------------------------------------------------------------------------
describe("TC-DSF-03: completionVerdict is 'approved'", () => {
  it("completionVerdict equals 'approved'", () => {
    expect(DeltaSpecFixerStep.completionVerdict).toBe("approved");
  });

  it("kind is 'agent'", () => {
    expect(DeltaSpecFixerStep.kind).toBe("agent");
  });

  it("name is 'delta-spec-fixer'", () => {
    expect(DeltaSpecFixerStep.name).toBe("delta-spec-fixer");
  });

  it("phase is 'spec'", () => {
    expect(DeltaSpecFixerStep.phase).toBe("spec");
  });

  it("requiresCommit is true", () => {
    expect(DeltaSpecFixerStep.requiresCommit).toBe(true);
  });

  it("resultFilePath returns null", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    expect(DeltaSpecFixerStep.resultFilePath(state, deps)).toBeNull();
  });

  it("parseResult returns NULL_PARSE_RESULT", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const result = DeltaSpecFixerStep.parseResult("anything", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });
});
