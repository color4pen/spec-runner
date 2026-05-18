/**
 * TC-010: NULL_PARSE_RESULT 定数の共有 — 4 step 適合性
 */
import { describe, it, expect } from "vitest";
import { NULL_PARSE_RESULT } from "../../../../src/core/step/types.js";
import { verificationResultPath } from "../../../../src/util/paths.js";
import { DesignStep } from "../../../../src/core/step/design.js";
import { SpecFixerStep } from "../../../../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../../../../src/core/step/implementer.js";
import { BuildFixerStep } from "../../../../src/core/step/build-fixer.js";
import type { StepDeps } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {
      // Give build-fixer a verification result so it doesn't set state.error
      verification: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "failed" as const,
            findingsPath: verificationResultPath("test-slug"),
            error: null,
          },
          startedAt: "2026-01-01",
          endedAt: "2026-01-01",
        },
      ],
    },
  };
}

function makeMinimalDeps(): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false },
    slug: "test-slug",
  };
}

describe("TC-010: NULL_PARSE_RESULT 定数の共有 — 4 step 適合性", () => {
  it("NULL_PARSE_RESULT の shape は { verdict: null, findingsPath: null, fileContent: null }", () => {
    expect(NULL_PARSE_RESULT).toEqual({
      verdict: null,
      findingsPath: null,
      fileContent: null,
    });
  });

  it("DesignStep.parseResult('any') は NULL_PARSE_RESULT と deep-equal", () => {
    const deps = makeMinimalDeps();
    const result = DesignStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });

  it("SpecFixerStep.parseResult('any') は NULL_PARSE_RESULT と deep-equal", () => {
    const deps = makeMinimalDeps();
    const result = SpecFixerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });

  it("ImplementerStep.parseResult('any') は NULL_PARSE_RESULT と deep-equal", () => {
    const deps = makeMinimalDeps();
    const result = ImplementerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });

  it("BuildFixerStep.parseResult('any') は NULL_PARSE_RESULT と deep-equal", () => {
    const deps = makeMinimalDeps();
    const result = BuildFixerStep.parseResult("any content", deps);
    expect(result).toEqual(NULL_PARSE_RESULT);
  });
});
