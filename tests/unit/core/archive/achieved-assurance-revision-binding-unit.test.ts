/**
 * Unit tests for deriveAchievedAssurance: revision-binding.
 *
 *   - TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）
 *   - TC-002: 協調改竄 — commit-OID 束縛が fail-closed
 *   - TC-003: scenario が anchor から HEAD まで不変（positive）→ testDerivation=frozen
 *   - TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed 各ケース）
 *   - TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）
 *   - TC-006: spec.md が承認から HEAD まで不変（positive）
 *   - TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed 各ケース）
 *   - TC-017: testDerivation depends only on scenario binding (blob freeze removed)
 *   - TC-018: specReview block は floor.specReview が constrain するときのみ I/O を実行
 *   - TC-019: isSpecRequired によって specReview 束縛を緩めない
 *
 * biteEvidence dimension removed; assertions updated to testDerivation only.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { deriveAchievedAssurance } from "../../../../src/core/archive/achieved-assurance.js";
import type { AssuranceProvenanceRuntime } from "../../../../src/core/archive/achieved-assurance.js";

type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/test-repo-rev-unit";
const SLUG = "my-slug";
const FINAL_HEAD_OID = "archive-head-sha-rev-unit-001";

const TEST_CASE_GEN_OID = "test-case-gen-commit-sha-rev-unit-001";
const SPEC_REVIEW_OID = "spec-review-commit-sha-rev-unit-001";

const SCENARIO_ANCHOR_CONTENT = "# Test Cases (anchor)\n\n## TC-001: sample\nAnchor scenario content.\n";

const SCENARIO_TAMPERED_CONTENT = "# Test Cases (TAMPERED)\n\n## TC-001: sample (MODIFIED)\nThis content was changed after test-case-gen.\n";
const _SCENARIO_TAMPERED_HASH = "sha256:" + createHash("sha256")
  .update(Buffer.from(SCENARIO_TAMPERED_CONTENT, "utf8"))
  .digest("hex");

const SPEC_ANCHOR_CONTENT = "# Spec\n\n## Requirements\nOriginal specification.\n";
const SPEC_TAMPERED_CONTENT = "# Spec\n\n## Requirements (MODIFIED)\nSpecification was changed after spec-review.\n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(overrides: {
  type?: string;
  slug?: string | null;
  testCaseGenOid?: string | null;
  specReviewRuns?: Array<{ verdict: string | null; commitOid?: string }>;
} = {}) {
  const {
    type = "new-feature",
    slug = SLUG,
    specReviewRuns,
  } = overrides;
  const testCaseGenOid = "testCaseGenOid" in overrides ? overrides.testCaseGenOid : TEST_CASE_GEN_OID;

  const steps: Record<string, unknown[]> = {};

  steps["implementer"] = [
    {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:02:00.000Z",
      commitOid: "candidate-sha-rev-unit-001",
    },
  ];

  if (testCaseGenOid !== undefined) {
    const run: Record<string, unknown> = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:45.000Z",
      endedAt: "2026-01-01T00:00:50.000Z",
    };
    if (testCaseGenOid !== null) {
      run["commitOid"] = testCaseGenOid;
    }
    steps["test-case-gen"] = [run];
  }

  if (specReviewRuns !== undefined) {
    steps["spec-review"] = specReviewRuns.map((r, i) => {
      const run: Record<string, unknown> = {
        attempt: i + 1,
        sessionId: null,
        outcome: { verdict: r.verdict, findingsPath: null, error: null },
        startedAt: "2026-01-01T00:00:20.000Z",
        endedAt: "2026-01-01T00:00:25.000Z",
      };
      if (r.commitOid !== undefined) {
        run["commitOid"] = r.commitOid;
      }
      return run;
    });
  }

  return {
    version: 2,
    jobId: "rev-unit-test-job",
    status: "awaiting-archive",
    worktreePath: null,
    branch: `change/${SLUG}-abc12345`,
    noWorktree: false,
    request: {
      path: `/repo/specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type,
      slug: slug as string,
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    steps,
    synthesizedCommits: ["bootstrap-commit-sha-rev-unit-001"],
    pullRequest: {
      url: "https://github.com/user/repo/pull/1",
      number: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFakeRuntime(options: {
  testCasesMdAtAnchor?: CommitFileResult | "unavailable";
  testCasesMdAtHead?: CommitFileResult | "unavailable";
  specMdAtAnchor?: CommitFileResult | "unavailable";
  specMdAtHead?: CommitFileResult | "unavailable";
} = {}): AssuranceProvenanceRuntime {
  const defaultTcAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT,
  };
  const defaultTcAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
    content: SCENARIO_ANCHOR_CONTENT, // same as anchor → freeze intact
  };
  const defaultSpecAtAnchor: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT,
  };
  const defaultSpecAtHead: CommitFileResult = {
    kind: "found",
    path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
    content: SPEC_ANCHOR_CONTENT, // same → binding intact
  };

  const resolvedTcAtAnchor = options.testCasesMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@anchor unavailable" }
    : (options.testCasesMdAtAnchor ?? defaultTcAtAnchor);

  const resolvedTcAtHead = options.testCasesMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake test-cases.md@head unavailable" }
    : (options.testCasesMdAtHead ?? defaultTcAtHead);

  const resolvedSpecAtAnchor = options.specMdAtAnchor === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@anchor unavailable" }
    : (options.specMdAtAnchor ?? defaultSpecAtAnchor);

  const resolvedSpecAtHead = options.specMdAtHead === "unavailable"
    ? { kind: "unavailable" as const, reason: "fake spec.md@head unavailable" }
    : (options.specMdAtHead ?? defaultSpecAtHead);

  return {
    async readFileAtCommit(oid: string, pathSuffix: string, _cwd: string): Promise<CommitFileResult> {
      if (pathSuffix.endsWith("test-cases.md")) {
        if (oid === TEST_CASE_GEN_OID) return resolvedTcAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedTcAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for test-cases.md` };
      }
      if (pathSuffix.endsWith("spec.md")) {
        if (oid === SPEC_REVIEW_OID) return resolvedSpecAtAnchor;
        if (oid === FINAL_HEAD_OID) return resolvedSpecAtHead;
        return { kind: "unavailable", reason: `fake: unknown OID ${oid} for spec.md` };
      }
      return { kind: "unavailable", reason: `fake: unknown pathSuffix ${pathSuffix}` };
    },
  };
}

const FLOOR_TEST_DERIVATION = { testDerivation: "frozen" as const };
const FLOOR_SPEC_REVIEW_REQUIRED = { specReview: "required" as const };
const _FLOOR_BOTH = { testDerivation: "frozen" as const, specReview: "required" as const };

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）
// ---------------------------------------------------------------------------

describe("TC-001: test-case-gen 確定 commit 後に test-cases.md を改竄（time-boundary）", () => {
  it(
    "TC-001: test-cases.md@testCaseGenOid=S, @finalHeadOid=S'（不一致）→ testDerivation absent（fail-closed）",
    async () => {
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT,
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT,
        },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: 協調改竄 — commit-OID 束縛が fail-closed
// ---------------------------------------------------------------------------

describe("TC-002: 協調改竄 — commit-OID 束縛が fail-closed", () => {
  it(
    "TC-002: test-cases.md@HEAD=S'（改竄）でも commit-OID 束縛が fail-closed",
    async () => {
      const runtime = makeFakeRuntime({
        testCasesMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/test-cases.md`,
          content: SCENARIO_ANCHOR_CONTENT,
        },
        testCasesMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/test-cases.md`,
          content: SCENARIO_TAMPERED_CONTENT,
        },
      });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-003: scenario が anchor から HEAD まで不変（positive）
// ---------------------------------------------------------------------------

describe("TC-003: scenario が anchor から HEAD まで不変（positive）", () => {
  it(
    "TC-003: test-cases.md が testCaseGenOid から finalHeadOid まで不変（S == S'）→ testDerivation=frozen",
    async () => {
      const runtime = makeFakeRuntime();
      // defaults: same SCENARIO_ANCHOR_CONTENT at both anchor and HEAD

      const state = makeJobState({ type: "new-feature" });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBe("frozen");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed 各ケース）
// ---------------------------------------------------------------------------

describe("TC-004: testCaseGenOid 欠落 / test-cases.md 取得不能（fail-closed）", () => {
  it(
    "TC-004(i): testCaseGenOid 欠落（test-case-gen step なし）→ testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime();
      const state = makeJobState({ testCaseGenOid: undefined });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );

  it(
    "TC-004(ii): test-case-gen step 存在するが commitOid なし → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime();
      const state = makeJobState({ testCaseGenOid: null });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );

  it(
    "TC-004(iii): test-cases.md@testCaseGenOid unavailable → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime({ testCasesMdAtAnchor: "unavailable" });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );

  it(
    "TC-004(iv): test-cases.md@finalHeadOid unavailable → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime({ testCasesMdAtHead: "unavailable" });

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );

  it(
    "TC-004(v): slug 欠落 → testDerivation absent",
    async () => {
      const runtime = makeFakeRuntime();
      const state = makeJobState({ slug: null as unknown as string });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）
// ---------------------------------------------------------------------------

describe("TC-005: spec-review 確定 commit 後に spec.md を変更（time-boundary）", () => {
  it(
    "TC-005: spec.md@specReviewOid=SPEC, @finalHeadOid=SPEC'（不一致）→ specReview absent（fail-closed）",
    async () => {
      const runtime = makeFakeRuntime({
        specMdAtAnchor: {
          kind: "found",
          path: `specrunner/changes/${SLUG}/spec.md`,
          content: SPEC_ANCHOR_CONTENT,
        },
        specMdAtHead: {
          kind: "found",
          path: `specrunner/changes/archive/2026-07-18-${SLUG}/spec.md`,
          content: SPEC_TAMPERED_CONTENT,
        },
      });

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: spec.md が承認から HEAD まで不変（positive）
// ---------------------------------------------------------------------------

describe("TC-006: spec.md が承認から HEAD まで不変（positive）", () => {
  it(
    "TC-006: spec.md@specReviewOid と @finalHeadOid が同一内容 + verdict=approved → specReview=required",
    async () => {
      const runtime = makeFakeRuntime();
      // defaults: same SPEC_ANCHOR_CONTENT at both anchor and HEAD

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBe("required");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed 各ケース）
// ---------------------------------------------------------------------------

describe("TC-007: specReviewOid 欠落 / spec.md 取得不能（fail-closed）", () => {
  it(
    "TC-007(i): specReviewOid 欠落（commitOid なし spec-review run）→ specReview absent",
    async () => {
      const runtime = makeFakeRuntime();
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved" }], // no commitOid
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );

  it(
    "TC-007(ii): spec.md@specReviewOid unavailable → specReview absent",
    async () => {
      const runtime = makeFakeRuntime({ specMdAtAnchor: "unavailable" });
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );

  it(
    "TC-007(iii): spec.md@finalHeadOid unavailable → specReview absent",
    async () => {
      const runtime = makeFakeRuntime({ specMdAtHead: "unavailable" });
      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-017: testDerivation depends only on scenario binding (blob freeze removed in absorb-test-materialize)
// ---------------------------------------------------------------------------

describe("TC-017: testDerivation depends only on scenario binding (blob freeze removed)", () => {
  it(
    "TC-017: scenario 凍結成立 → testDerivation=frozen (no file-set dependency)",
    async () => {
      // biteEvidence removed — only scenario binding matters for testDerivation
      const runtime = makeFakeRuntime();

      const { achieved } = await deriveAchievedAssurance({
        state: makeJobState({ type: "new-feature" }) as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION,
        runtime,
      });

      expect(achieved.testDerivation).toBe("frozen");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-018: specReview block は floor.specReview が constrain するときのみ I/O を実行
// ---------------------------------------------------------------------------

describe("TC-018: specReview block は floor.specReview が constrain するときのみ I/O を実行", () => {
  it(
    "TC-018: floor.specReview = undefined → spec.md の readFileAtCommit が呼ばれない",
    async () => {
      const readFileAtCommitCalls: Array<{ oid: string; pathSuffix: string }> = [];

      const runtime = makeFakeRuntime();
      const originalFn = runtime.readFileAtCommit!.bind(runtime);
      runtime.readFileAtCommit = async (oid, pathSuffix, cwd) => {
        readFileAtCommitCalls.push({ oid, pathSuffix });
        return originalFn(oid, pathSuffix, cwd);
      };

      const state = makeJobState({
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      // Floor: only testDerivation, no specReview constraint
      await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_TEST_DERIVATION, // no specReview field
        runtime,
      });

      // THEN: no readFileAtCommit calls for spec.md (I/O only when constrained)
      const specMdCalls = readFileAtCommitCalls.filter((c) => c.pathSuffix.endsWith("spec.md"));
      expect(specMdCalls).toHaveLength(0);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-019: isSpecRequired によって specReview 束縛を緩めない
// ---------------------------------------------------------------------------

describe("TC-019: isSpecRequired によって specReview 束縛を緩めない", () => {
  it(
    "TC-019: spec-exempt type + floor.specReview=required + spec.md unavailable → specReview absent（fail-closed）",
    async () => {
      const runtime = makeFakeRuntime({
        specMdAtAnchor: "unavailable",
        specMdAtHead: "unavailable",
      });

      const state = makeJobState({
        type: "chore",
        specReviewRuns: [{ verdict: "approved", commitOid: SPEC_REVIEW_OID }],
      });

      const { achieved } = await deriveAchievedAssurance({
        state: state as never,
        finalHeadOid: FINAL_HEAD_OID,
        cwd: CWD,
        floor: FLOOR_SPEC_REVIEW_REQUIRED,
        runtime,
      });

      expect(achieved.specReview).toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// Never throws invariant
// ---------------------------------------------------------------------------

describe("deriveAchievedAssurance revision-binding: never throws", () => {
  it("null runtime does not throw", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: FINAL_HEAD_OID,
      cwd: CWD,
      floor: FLOOR_TEST_DERIVATION,
      runtime: null,
    })).resolves.toBeDefined();
  });

  it("undefined finalHeadOid does not throw", async () => {
    await expect(deriveAchievedAssurance({
      state: makeJobState() as never,
      finalHeadOid: undefined,
      cwd: CWD,
      floor: FLOOR_TEST_DERIVATION,
      runtime: makeFakeRuntime(),
    })).resolves.toBeDefined();
  });
});
