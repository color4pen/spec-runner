/**
 * Unit test for scope finding exclusion in applySuccessPostPersistEffects (T-06).
 *
 * TC-022: scope finding が後出し判定対象から除外される (must)
 *   GIVEN findings に origin === "scope" の finding と通常の agent finding が混在する
 *         iteration 2 の spec-review 完了
 *   WHEN  applySuccessPostPersistEffects の後出し検出ブロックが走る
 *   THEN  origin === "scope" の finding は computeFindingRecency に渡されず、
 *         agent finding のみが判定対象になる
 *
 * TC-023: 後出し検出ブロックの例外が step 完了を壊さない (should)
 *   GIVEN computeFindingRecency が例外を throw するよう設定した iteration 2 の spec-review 完了
 *   WHEN  applySuccessPostPersistEffects が走る
 *   THEN  例外が try/catch で握り潰され、step が正常完了する
 *
 * This test is intentionally RED because:
 *   1. src/core/step/finding-recency.ts does not exist yet (T-02/T-04 not implemented).
 *   2. CommitOrchestrator.applySuccessPostPersistEffects does not call recordFindingRecency
 *      yet (T-06 not implemented).
 *
 * Source: test-cases.md > TC-022
 *         tasks.md > T-06
 */

// ---------------------------------------------------------------------------
// vi.mock MUST be at the top — vitest hoists vi.mock calls
// ---------------------------------------------------------------------------

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the finding-recency module. vi.mock is hoisted before imports.
// Once T-02/T-04 create this module, this mock will intercept the real module.
vi.mock("../../../../src/core/step/finding-recency.js", () => ({
  recordFindingRecency: vi.fn().mockResolvedValue(undefined),
  computeFindingRecency: vi.fn().mockResolvedValue([]),
  classifyFindingRecency: vi.fn().mockReturnValue("indeterminate"),
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock)
// ---------------------------------------------------------------------------

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CommitOrchestrator } from "../../../../src/core/step/commit-orchestrator.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import { SpecReviewStep } from "../../../../src/core/step/spec-review.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { StepExecutionResult } from "../../../../src/core/step/commit-orchestrator.js";
import type { StepCompletion } from "../../../../src/core/step/step-completion.js";
import type { Finding } from "../../../../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Import the mocked module to access the spy
// (vitest resolves this to the mock factory above)
// ---------------------------------------------------------------------------

// We use a dynamic import to get the mocked version
// (in vitest, static imports after vi.mock() get the mocked module)
import { recordFindingRecency } from "../../../../src/core/step/finding-recency.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const SLUG = "test-slug";
const PRIOR_COMMIT_OID = "abc123deadbeef0000000000000000000000000000";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "scope-exclusion-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal agent Finding (not scope-derived).
 */
function makeAgentFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    line: 10,
    title: "Agent finding",
    rationale: "found by agent",
    ...overrides,
  };
}

/**
 * Build a scope-derived finding (origin === "scope").
 */
function makeScopeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "medium",
    resolution: "fixable",
    file: "src/bar.ts",
    line: 5,
    title: "Scope finding",
    rationale: "synthesized by scope check",
    origin: "scope",
    ...overrides,
  };
}

/**
 * Build a JobState that has 1 completed spec-review StepRun (= iteration 2 state).
 * The previous run has commitOid set to PRIOR_COMMIT_OID.
 */
async function buildIteration2State(): Promise<JobState> {
  const created = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug: SLUG,
    },
    repository: { owner: "owner", name: "repo" },
  });

  // Simulate iteration 1 already completed: spec-review has 1 StepRun
  const priorStepRun: StepRun = {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      commitOid: PRIOR_COMMIT_OID,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
  };

  const state: JobState = {
    ...created,
    status: "running",
    branch: `feat/${SLUG}`,
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [priorStepRun],
    },
  };

  // Persist to disk so the store can load it
  const store = makeStoreFactory(tempDir)(created.jobId);
  await store.persist(state);
  return state;
}

/**
 * Build a minimal PipelineDeps with runtimeStrategy and cwd set
 * (required by the T-06 gate: `deps.runtimeStrategy && deps.cwd`).
 */
function makeDeps(): PipelineDeps {
  return {
    config: { version: 1, runtime: "local", agents: {} } as PipelineDeps["config"],
    slug: SLUG,
    request: {
      type: "new-feature",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "# Test\n",
      adr: false,
      path: `specrunner/changes/${SLUG}/request.md`,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "owner",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: makeStoreFactory(tempDir),
    cwd: tempDir,
    // runtimeStrategy: provide a minimal fake that satisfies the gate check
    runtimeStrategy: {
      digestArtifacts: vi.fn().mockResolvedValue([]),
      readRevisionContent: vi.fn().mockResolvedValue({ current: null, prior: null }),
    } as unknown as PipelineDeps["runtimeStrategy"],
  } as unknown as PipelineDeps;
}

/**
 * Build a minimal StepCompletion with the given findings.
 */
function makeCompletion(findings: Finding[]): StepCompletion {
  return {
    verdict: "needs-fix",
    persistToolResult: {
      ok: true,
      findings,
    },
  };
}

/**
 * Build a StepExecutionResult for a successful spec-review step.
 */
function makeSuccessResult(findings: Finding[], commitOid?: string): StepExecutionResult & { kind: "success" } {
  return {
    kind: "success",
    completion: makeCompletion(findings),
    completedAt: "2026-01-01T01:00:00.000Z",
    startedAt: "2026-01-01T00:55:00.000Z",
    session: null,
    ...(commitOid ? { commitOid } : {}),
  };
}

// ---------------------------------------------------------------------------
// TC-022: scope finding が後出し判定対象から除外される (must)
// Source: test-cases.md > TC-022
//         tasks.md > T-06 (origin === "scope" を除外)
// ---------------------------------------------------------------------------

describe("TC-022: scope finding が後出し判定対象から除外される", () => {
  it(
    "TC-022: iteration 2 の spec-review 完了で scope finding が recordFindingRecency に渡されない",
    async () => {
      // GIVEN: iteration 2 state (1 previous spec-review StepRun)
      const state = await buildIteration2State();
      const deps = makeDeps();
      const events = new EventBus();
      const orchestrator = new CommitOrchestrator(makeStoreFactory(tempDir), events);

      // Mixed findings: 2 agent findings + 1 scope finding
      const agentFinding1 = makeAgentFinding({ title: "Agent finding 1", file: "src/a.ts", line: 1 });
      const agentFinding2 = makeAgentFinding({ title: "Agent finding 2", file: "src/b.ts", line: 2 });
      const scopeFinding = makeScopeFinding({ title: "Scope finding" });
      const allFindings: Finding[] = [agentFinding1, agentFinding2, scopeFinding];

      const result = makeSuccessResult(allFindings, "newcommit000000");

      // WHEN: commitSuccess is called (triggers applySuccessPostPersistEffects)
      await orchestrator.commitSuccess(SpecReviewStep, state, deps, result);

      // THEN: recordFindingRecency must have been called (T-06 gate: spec-review + iteration >= 2)
      expect(
        vi.mocked(recordFindingRecency),
        "recordFindingRecency must be called after T-06 is implemented",
      ).toHaveBeenCalled();

      // AND: the findings passed to recordFindingRecency must NOT include scope findings
      const calls = vi.mocked(recordFindingRecency).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const passedParams = calls[0]![0] as { findings?: Finding[] };
      const passedFindings = passedParams?.findings ?? [];

      // No scope findings should be in the passed list
      const scopeFindings = passedFindings.filter((f) => f.origin === "scope");
      expect(
        scopeFindings,
        "scope findings (origin === 'scope') must be excluded from recordFindingRecency call",
      ).toHaveLength(0);

      // Both agent findings must be present
      expect(
        passedFindings.filter((f) => f.origin !== "scope"),
        "agent findings must be passed to recordFindingRecency",
      ).toHaveLength(2);
    },
  );

  it(
    "TC-022: findings が scope のみの場合 recordFindingRecency が呼ばれないか空配列で呼ばれる",
    async () => {
      const state = await buildIteration2State();
      const deps = makeDeps();
      const events = new EventBus();
      const orchestrator = new CommitOrchestrator(makeStoreFactory(tempDir), events);

      // Findings: only scope-derived
      const scopeOnly: Finding[] = [
        makeScopeFinding({ title: "Scope 1" }),
        makeScopeFinding({ title: "Scope 2" }),
      ];

      const result = makeSuccessResult(scopeOnly, "newcommit111111");

      await orchestrator.commitSuccess(SpecReviewStep, state, deps, result);

      // When all findings are scope, either:
      // (a) recordFindingRecency is not called (because agent findings = 0 → early return), OR
      // (b) recordFindingRecency is called with empty findings array
      const calls = vi.mocked(recordFindingRecency).mock.calls;

      if (calls.length > 0) {
        // If called, findings must be empty (all scope findings filtered out)
        const passedFindings = (calls[0]![0] as { findings?: Finding[] })?.findings ?? [];
        const scopeInPassed = passedFindings.filter((f) => f.origin === "scope");
        expect(scopeInPassed).toHaveLength(0);
      }
      // If not called (because findings = 0 → early return in recordFindingRecency), that's also valid.
      // Either behavior satisfies the requirement.
    },
  );

  it(
    "TC-022: iteration 1 では recordFindingRecency が呼ばれない（gate: iteration >= 2）",
    async () => {
      // GIVEN: iteration 1 state (no previous spec-review StepRuns)
      const created = buildInitialJobState({
        request: {
          path: path.join(tempDir, "request.md"),
          title: "Test",
          type: "new-feature",
          slug: SLUG,
        },
        repository: { owner: "owner", name: "repo" },
      });
      const state: JobState = {
        ...created,
        status: "running",
        branch: `feat/${SLUG}`,
        steps: {},  // no previous spec-review runs → iteration 1
      };
      const store = makeStoreFactory(tempDir)(created.jobId);
      await store.persist(state);

      const deps = makeDeps();
      const events = new EventBus();
      const orchestrator = new CommitOrchestrator(makeStoreFactory(tempDir), events);

      const findings: Finding[] = [makeAgentFinding()];
      const result = makeSuccessResult(findings, "firstcommit000");

      await orchestrator.commitSuccess(SpecReviewStep, state, deps, result);

      // THEN: recordFindingRecency must NOT be called for iteration 1
      expect(
        vi.mocked(recordFindingRecency),
        "recordFindingRecency must not be called for iteration 1",
      ).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-023: 後出し検出ブロックの例外が step 完了を壊さない (should)
// Source: test-cases.md > TC-023
//         design.md > Risks / Trade-offs (best-effort、例外を握り潰す)
// ---------------------------------------------------------------------------

describe("TC-023: 後出し検出ブロックの例外が step 完了を壊さない (should)", () => {
  it(
    "TC-023: recordFindingRecency が例外を throw しても commitSuccess が正常完了する",
    async () => {
      // GIVEN: recordFindingRecency throws
      vi.mocked(recordFindingRecency).mockRejectedValue(new Error("simulated finding-recency failure"));

      const state = await buildIteration2State();
      const deps = makeDeps();
      const events = new EventBus();
      const orchestrator = new CommitOrchestrator(makeStoreFactory(tempDir), events);

      const result = makeSuccessResult([makeAgentFinding()], "errcommit00000");

      // WHEN: commitSuccess is called
      let threw = false;
      let updatedState: JobState | undefined;
      try {
        updatedState = await orchestrator.commitSuccess(SpecReviewStep, state, deps, result);
      } catch {
        threw = true;
      }

      // THEN: commitSuccess must complete without throwing
      // (best-effort: finding-recency exception must be swallowed)
      expect(threw, "commitSuccess must not propagate finding-recency exceptions").toBe(false);
      expect(updatedState, "commitSuccess must return the updated state").toBeDefined();
    },
  );
});
