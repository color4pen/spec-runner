/**
 * Compile-time + runtime tests verifying that leaf consumer functions can be called
 * with narrow capability types only — no full RuntimeStrategy required.
 *
 * TC-004: ChangedFilesCapability のみで detectNoOp を呼び出せる（compile-time）
 * TC-006: RevisionContentCapability のみで computeFindingRecency を呼び出せる（compile-time）
 * TC-009: CommitInspectionCapability のみで derivePriorRoundContext を呼び出せる（compile-time）
 * TC-011: custom-reviewer-round-context で as RuntimeStrategy cast が不要になる
 * TC-012: 最小型の deps で computeExtraScopeFindings を呼び出せる（compile-time）
 * TC-023: 対象 leaf consumer が RuntimeStrategy を parameter type として import しない
 * TC-027: derivePostFixContext が CommitInspectionCapability を依存型として受け取る
 * TC-029: capability-consumers.test.ts で leaf consumer が narrow 型のみで呼び出せることを compile-time に検証する
 */
import { describe, it, expect, vi } from "vitest";
import type {
  ChangedFilesCapability,
  CommitInspectionCapability,
  RevisionContentCapability,
} from "../../../../src/core/port/runtime-strategy.js";

import { detectNoOp } from "../../../../src/core/step/no-op-detect.js";
import { computeFindingRecency } from "../../../../src/core/step/finding-recency.js";
import { derivePriorRoundContext } from "../../../../src/core/step/prior-round-context.js";
import { derivePostFixContext } from "../../../../src/core/step/post-fix-context.js";
import { deriveCustomReviewerPriorRound } from "../../../../src/core/step/custom-reviewer-round-context.js";
import { computeExtraScopeFindings } from "../../../../src/core/step/scope-check.js";

// ---------------------------------------------------------------------------
// Minimal job state helper
// ---------------------------------------------------------------------------

function makeMinimalJobState() {
  return {
    jobId: "job-001",
    slug: "test-slug",
    status: "running" as const,
    step: "design" as const,
    request: { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", path: "/request.md", adr: false },
    repository: { owner: "testowner", name: "testrepo" },
    steps: {},
    pipelineId: "standard",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// TC-004: detectNoOp accepts ChangedFilesCapability
// ---------------------------------------------------------------------------

describe("TC-004: detectNoOp accepts ChangedFilesCapability narrow type", () => {
  it("can be called with a ChangedFilesCapability object (no RuntimeStrategy needed)", async () => {
    const narrow: ChangedFilesCapability = {
      listChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: [] }),
    };

    const step = {
      kind: "agent" as const,
      name: "implementer",
      noOpDetect: true,
      agent: {} as never,
      buildMessage: () => "",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };

    // Should not throw a type error — narrow type is accepted
    const result = await detectNoOp(step, narrow, {
      headBeforeStep: "abc123",
      cwd: "/cwd",
      branch: "main",
      completionReason: "success",
    });

    // listChangedFiles returns [] → no source files → no-op detected
    expect(result).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-006: computeFindingRecency accepts RevisionContentCapability
// ---------------------------------------------------------------------------

describe("TC-006: computeFindingRecency accepts RevisionContentCapability narrow type", () => {
  it("can be called with a RevisionContentCapability object (no RuntimeStrategy needed)", async () => {
    const narrow: RevisionContentCapability = {
      readRevisionContent: vi.fn().mockResolvedValue({ current: "line one\nline two", prior: "line one" }),
    };

    const findings = [
      { severity: "high" as const, resolution: "fixable" as const, file: "src/foo.ts", line: 1, title: "Finding", rationale: "because" },
    ];

    // Should not throw a type error
    const results = await computeFindingRecency(findings, "abc123", "/cwd", "main", narrow);

    expect(results).toHaveLength(1);
    // line 1 = "line one" exists in prior → "late"
    expect(results[0]?.recency).toBe("late");
  });

  it("can be called with an empty RevisionContentCapability (no readRevisionContent) → indeterminate", async () => {
    const narrow: RevisionContentCapability = {};

    const findings = [
      { severity: "high" as const, resolution: "fixable" as const, file: "src/foo.ts", line: 1, title: "Finding", rationale: "because" },
    ];

    const results = await computeFindingRecency(findings, "abc123", "/cwd", "main", narrow);
    expect(results[0]?.recency).toBe("indeterminate");
  });
});

// ---------------------------------------------------------------------------
// TC-009: derivePriorRoundContext accepts CommitInspectionCapability
// ---------------------------------------------------------------------------

describe("TC-009: derivePriorRoundContext accepts CommitInspectionCapability narrow type", () => {
  it("can be called with CommitInspectionCapability | undefined (no RuntimeStrategy needed)", async () => {
    const narrow: CommitInspectionCapability = {};

    const state = makeMinimalJobState();

    // iteration < 2 → null (no prior round)
    const result = await derivePriorRoundContext({
      state: state as never,
      iteration: 1,
      cwd: "/cwd",
      runtimeStrategy: narrow,
    });

    expect(result).toBeNull();
  });

  it("can be called with undefined runtimeStrategy → null (no capability)", async () => {
    const state = makeMinimalJobState();

    const result = await derivePriorRoundContext({
      state: state as never,
      iteration: 2,
      cwd: "/cwd",
      runtimeStrategy: undefined,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-027: derivePostFixContext accepts CommitInspectionCapability
// ---------------------------------------------------------------------------

describe("TC-027: derivePostFixContext accepts CommitInspectionCapability narrow type", () => {
  it("can be called with minimal CommitInspectionCapability object (no RuntimeStrategy needed)", async () => {
    const narrow: CommitInspectionCapability = {
      listCommitChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: ["src/a.ts"] }),
    };

    const state = makeMinimalJobState();

    // No code-fixer runs → null (no fixer rounds recorded)
    const result = await derivePostFixContext({
      state: state as never,
      cwd: "/cwd",
      runtimeStrategy: narrow,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-011: deriveCustomReviewerPriorRound accepts CommitInspectionCapability (no as cast)
// ---------------------------------------------------------------------------

describe("TC-011: deriveCustomReviewerPriorRound accepts CommitInspectionCapability (no as-cast)", () => {
  it("can be called with CommitInspectionCapability | undefined (no RuntimeStrategy cast needed)", async () => {
    const narrow: CommitInspectionCapability = {};
    const state = makeMinimalJobState();

    // iteration < 2 → null
    const result = await deriveCustomReviewerPriorRound({
      state: state as never,
      reviewerName: "my-reviewer",
      iteration: 1,
      cwd: "/cwd",
      runtimeStrategy: narrow,
    });

    expect(result).toBeNull();
  });

  it("undefined runtimeStrategy → null (no capability)", async () => {
    const state = makeMinimalJobState();

    const result = await deriveCustomReviewerPriorRound({
      state: state as never,
      reviewerName: "my-reviewer",
      iteration: 2,
      cwd: "/cwd",
      runtimeStrategy: undefined,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-012: computeExtraScopeFindings accepts minimal deps with ChangedFilesCapability
// ---------------------------------------------------------------------------

describe("TC-012: computeExtraScopeFindings accepts minimal deps type", () => {
  it("can be called with minimal deps containing ChangedFilesCapability (no PipelineDeps needed)", async () => {
    const narrow: ChangedFilesCapability = {
      listChangedFiles: vi.fn().mockResolvedValue({ kind: "success", files: [] }),
    };

    const minimalDeps = {
      slug: "test-slug",
      request: { baseBranch: "main" },
      cwd: "/cwd",
      runtimeStrategy: narrow,
    };

    const state = makeMinimalJobState();

    // No permissionScope declared → []
    const result = await computeExtraScopeFindings(
      "code-review",
      undefined,
      state as never,
      minimalDeps,
    );

    expect(result).toEqual([]);
  });

  it("can be called with undefined runtimeStrategy in minimal deps", async () => {
    const minimalDeps = {
      slug: "test-slug",
      request: { baseBranch: "main" },
      cwd: "/cwd",
      runtimeStrategy: undefined,
    };

    const state = makeMinimalJobState();

    const result = await computeExtraScopeFindings(
      "code-review",
      { checkpoint: "code-review", forbidden: [] },
      state as never,
      minimalDeps,
    );

    // runtimeStrategy undefined → []
    expect(result).toEqual([]);
  });
});
