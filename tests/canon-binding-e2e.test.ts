/**
 * E2E integration tests for canonical hash binding with real git operations.
 *
 * Uses actual git repos (via spawnSync) to produce authentic commit SHAs.
 * ParallelReviewRound is exercised directly (not via the full managed pipeline).
 * digestArtifacts is mocked to return deterministic ArtifactRef arrays.
 *
 * TC-043: Scenario A — canonical doc change → re-run → new revision / canonHash bound
 * TC-044: Scenario B — no canonical or source change → approved skip maintained
 * TC-045: Scenario C — findings-only commit → no invalidation, skip maintained
 *
 * RED phase:
 *   - computeCanonHash is not yet exported from reviewer-status.ts
 *   - digestArtifacts is not yet called in ParallelReviewRound.run
 *   - applyRoundResults does not yet record canonHash on the updated status
 *   Tests will fail until T-03/T-04 are implemented.
 *
 * Destruction confirmations:
 *   TC-046: Removing canon binding from selectPendingMembers → TC-043 only catches revision delta
 *           (would still pass on commit boundary, but would fail a pure-canon-change variant)
 *   TC-047: Reverting excludePipelineManagedChangePaths to old excludeChangeFolderPaths
 *           → TC-045 would fail (canonical docs excluded → no invalidation miss, design.md touched
 *           but not seen → finds-only commit mistaken as source-safe even when it isn't)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { EventBus } from "../src/core/event/event-bus.js";
import { ParallelReviewRound } from "../src/core/pipeline/parallel-review-round.js";
import { computeCanonHash } from "../src/core/pipeline/reviewer-status.js";
import type { ParallelReviewConfig } from "../src/core/pipeline/types.js";
import type { Step } from "../src/core/step/types.js";
import type { JobState } from "../src/state/schema.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { StepExecutor } from "../src/core/step/executor.js";
import type { StepExecutionResult } from "../src/core/step/commit-orchestrator.js";
import type { ArtifactRef } from "../src/state/artifact-types.js";
import { makeStoreFactory } from "./helpers/store-factory.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "canon-e2e-slug";
const COORDINATOR = "custom-reviewers";
const MEMBER_A = "reviewer-alpha";

/** Canonical doc paths for the slug */
const DESIGN_MD_PATH = `specrunner/changes/${SLUG}/design.md`;
const REQUEST_MD_PATH = `specrunner/changes/${SLUG}/request.md`;

/** Pipeline output path (findings file) — should be excluded from invalidation */
const FINDINGS_PATH = `specrunner/changes/${SLUG}/${MEMBER_A}-result-001.md`;

/** Source path (outside change folder) */
const SOURCE_PATH = "src/core/feature.ts";

// Canonical ArtifactRefs with deterministic hash values
const INITIAL_REFS: ArtifactRef[] = [
  { path: DESIGN_MD_PATH, hash: "sha256:design-v1" },
  { path: REQUEST_MD_PATH, hash: "sha256:request-v1" },
];

const CHANGED_REFS: ArtifactRef[] = [
  { path: DESIGN_MD_PATH, hash: "sha256:design-v2" }, // updated
  { path: REQUEST_MD_PATH, hash: "sha256:request-v1" }, // unchanged
];

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

/** Create a minimal real git repo in tempDir and return it configured. */
async function createGitRepo(tempDir: string): Promise<void> {
  gitSync(["init"], tempDir);
  gitSync(["config", "user.email", "test@spec-runner.local"], tempDir);
  gitSync(["config", "user.name", "Canon E2E Test"], tempDir);
}

/** Stage all files and make a commit; returns the new HEAD SHA. */
function makeCommit(cwd: string, message: string): string {
  gitSync(["add", "."], cwd);
  gitSync(["commit", "-m", message], cwd);
  return gitSync(["rev-parse", "HEAD"], cwd);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMinimalStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes: () => [],
  } as unknown as Step;
}

function makeStore(tempDir: string) {
  return makeStoreFactory(tempDir)("canon-e2e-job-id");
}

function makeBaseState(
  tempDir: string,
  overrides: Partial<JobState> = {},
): JobState {
  return {
    version: 2,
    jobId: "canon-e2e-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: REQUEST_MD_PATH,
      title: "Canon E2E Test",
      type: "spec-change",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: COORDINATOR,
    status: "running",
    branch: `change/${SLUG}`,
    history: [],
    error: null,
    steps: {},
    reviewers: [
      {
        name: MEMBER_A,
        maxIterations: 3,
        purpose: "alpha reviewer purpose",
        criteria: "alpha reviewer criteria",
        judgment: "alpha reviewer judgment",
        freeText: "",
      },
    ],
    ...overrides,
  };
}

function makeDeps(
  tempDir: string,
  runtimeStrategy: PipelineDeps["runtimeStrategy"],
): PipelineDeps {
  return {
    cwd: tempDir,
    slug: SLUG,
    config: {} as never,
    request: {
      type: "spec-change",
      title: "Canon E2E Test",
      slug: SLUG,
      baseBranch: "main",
      content: "...",
      adr: false,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "test",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => makeStore(tempDir) as never,
    runtimeStrategy,
  };
}

function _makeRound(): ParallelReviewRound {
  const steps = new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]);
  const parallelReview: ParallelReviewConfig = {
    coordinator: COORDINATOR,
    members: [MEMBER_A],
  };
  return new ParallelReviewRound({
    executor: { produceResult: vi.fn() } as unknown as StepExecutor,
    steps,
    parallelReview,
    events: new EventBus(),
  });
}

/** Executor that always returns "approved". */
function makeApprovedExecutor(): { executor: StepExecutor; callCount: () => number } {
  const spy = vi.fn(async (): Promise<StepExecutionResult> => ({
    kind: "success",
    completion: { verdict: "approved", persistToolResult: null },
    completedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    session: null,
  }));
  return { executor: { produceResult: spy } as unknown as StepExecutor, callCount: () => spy.mock.calls.length };
}

/**
 * Build a runtimeStrategy mock that uses a real git SHA for captureHeadSha
 * but mocks listChangedFiles and digestArtifacts.
 */
function makeRuntimeStrategy(opts: {
  headSha: string;
  changedFiles: string[];
  digestRefs: ArtifactRef[];
}) {
  return {
    captureHeadSha: vi.fn(async () => opts.headSha),
    listChangedFiles: vi.fn(async () => ({
      kind: "success" as const,
      files: opts.changedFiles,
    })),
    digestArtifacts: vi.fn(async (): Promise<ArtifactRef[]> => opts.digestRefs),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => ({ violations: [] })),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-binding-e2e-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await createGitRepo(tempDir);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-043: Scenario A — canonical doc change → re-run → new revision / canonHash bound
// ---------------------------------------------------------------------------

describe("TC-043: Scenario A — canonical doc change → re-run → new revision/canonHash bound", () => {
  it("TC-043: reviewer approved at (C1, H1) is re-run when design.md changes to (C2, H2)", async () => {
    // GIVEN: real git repo with initial commit (C1)
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v1\n\nInitial design.\n");
    await fs.writeFile(path.join(tempDir, REQUEST_MD_PATH), "# Request\n\nTest request.\n");
    const C1 = makeCommit(tempDir, "Initial canonical docs (C1)");

    // H1 = computeCanonHash(INITIAL_REFS) — test imports computeCanonHash (RED: not yet exported)
    const H1 = computeCanonHash(INITIAL_REFS);
    expect(H1).not.toBeNull(); // H1 computable from INITIAL_REFS

    // Fabricate state: reviewer approved at (C1, H1)
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        {
          name: MEMBER_A,
          status: "approved",
          approvedAtCommit: C1,
          canonHash: H1,
        },
      ],
    });

    // WHEN: canonical doc (design.md) changes, commit → HEAD = C2
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v2\n\nUpdated design spec.\n");
    const C2 = makeCommit(tempDir, "Update design.md (C2)");

    // H2 = computeCanonHash(CHANGED_REFS), H2 ≠ H1
    const H2 = computeCanonHash(CHANGED_REFS);
    expect(H2).not.toBeNull();
    expect(H2).not.toBe(H1); // different canonical hash

    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C2,                      // current HEAD after canonical change
      changedFiles: [DESIGN_MD_PATH],   // design.md touched between C1 and C2
      digestRefs: CHANGED_REFS,          // canonical docs have changed → H2
    });

    const { executor, callCount } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { outcome, state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    // THEN: reviewer was re-run (pending → fan-out executed)
    expect(callCount()).toBe(1);
    expect(outcome).toBe("approved");

    // TC-043: new approval is bound to C2 and H2
    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    expect(memberStatus?.approvedAtCommit).toBe(C2);
    // RED: applyRoundResults does not yet record canonHash — will fail until T-04 implemented
    expect(memberStatus?.canonHash).toBe(H2);
    expect(memberStatus?.canonHash).not.toBe(H1);
  });

  it("TC-043: digestArtifacts is called with canonical paths for the slug during round", async () => {
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v1\n");
    await fs.writeFile(path.join(tempDir, REQUEST_MD_PATH), "# Request\n");
    const C1 = makeCommit(tempDir, "Initial commit");

    const H1 = computeCanonHash(INITIAL_REFS);
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v2 — changed\n");
    const C2 = makeCommit(tempDir, "Change canonical doc");

    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C2,
      changedFiles: [DESIGN_MD_PATH],
      digestRefs: CHANGED_REFS,
    });

    const { executor } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    await round.run(COORDINATOR, state, makeDeps(tempDir, runtimeStrategy as never));

    // RED: digestArtifacts not yet called in ParallelReviewRound.run
    expect(runtimeStrategy.digestArtifacts).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-044: Scenario B — no canonical or source change → approved skip maintained
// ---------------------------------------------------------------------------

describe("TC-044: Scenario B — no canonical or source change → approved skip maintained", () => {
  it("TC-044: reviewer stays skipped (executor not called) when nothing changed since approval", async () => {
    // GIVEN: real git repo, single initial commit (C1)
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v1\n");
    await fs.writeFile(path.join(tempDir, REQUEST_MD_PATH), "# Request v1\n");
    const C1 = makeCommit(tempDir, "Initial commit (C1)");

    // H1 = computeCanonHash(INITIAL_REFS)
    const H1 = computeCanonHash(INITIAL_REFS);
    expect(H1).not.toBeNull();

    // Fabricate state: reviewer approved at (C1, H1)
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    // WHEN: no additional commit — HEAD is still C1, canonical docs unchanged
    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C1,          // same SHA — no new commit
      changedFiles: [],      // nothing changed
      digestRefs: INITIAL_REFS, // same canonical docs → same H1
    });

    const { executor, callCount } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { outcome } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    // THEN: reviewer was NOT re-run (skip maintained)
    expect(callCount()).toBe(0);
    expect(outcome).toBe("approved");
  });

  it("TC-044: reviewer status remains approved after skip", async () => {
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design\n");
    const C1 = makeCommit(tempDir, "Initial");

    const H1 = computeCanonHash(INITIAL_REFS);
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C1,
      changedFiles: [],
      digestRefs: INITIAL_REFS,
    });

    const { executor } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    // Status should remain approved (not changed by fast-path)
    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    expect(memberStatus?.approvedAtCommit).toBe(C1);
    // RED: canonHash field doesn't exist on ReviewerStatus yet
    expect(memberStatus?.canonHash).toBe(H1);
  });
});

// ---------------------------------------------------------------------------
// TC-045: Scenario C — findings-only commit → no invalidation, skip maintained
// ---------------------------------------------------------------------------

describe("TC-045: Scenario C — findings-only pipeline output change → no reviewer invalidation", () => {
  it("TC-045: executor not called when only pipeline output files changed between commits", async () => {
    // GIVEN: real git repo, initial source commit (C1), reviewer approved at (C1, H1)
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design v1\n");
    await fs.writeFile(path.join(tempDir, REQUEST_MD_PATH), "# Request v1\n");
    await fs.mkdir(path.join(tempDir, "src", "core"), { recursive: true });
    await fs.writeFile(path.join(tempDir, SOURCE_PATH), "// feature code\n");
    const C1 = makeCommit(tempDir, "Initial commit with design + source (C1)");

    const H1 = computeCanonHash(INITIAL_REFS);
    expect(H1).not.toBeNull();

    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    // WHEN: reviewer's findings file is committed (pipeline output only) — C2
    await fs.writeFile(
      path.join(tempDir, FINDINGS_PATH),
      `# ${MEMBER_A} Findings\n\n## Verdict: approved\n\nAll clear.\n`,
    );
    const C2 = makeCommit(tempDir, `${MEMBER_A} findings commit (C2)`);

    // runtimeStrategy: listChangedFiles returns only the findings file (pipeline output)
    // digestArtifacts: same INITIAL_REFS → H1 (canonical docs unchanged)
    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C2,
      changedFiles: [FINDINGS_PATH],   // only pipeline output changed
      digestRefs: INITIAL_REFS,         // canonical docs unchanged → same H1
    });

    const { executor, callCount } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { outcome } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    // THEN: sourceTouched is empty (findings excluded) → no invalidation → skip maintained
    expect(callCount()).toBe(0);
    expect(outcome).toBe("approved");
  });

  it("TC-045: findings-only change + state.json excluded — reviewer stays approved", async () => {
    // Multiple pipeline output files in the same commit — all excluded
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design\n");
    const C1 = makeCommit(tempDir, "Initial");

    const H1 = computeCanonHash(INITIAL_REFS);
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    const STATE_JSON_PATH = `specrunner/changes/${SLUG}/state.json`;
    const EVENTS_JSONL_PATH = `specrunner/changes/${SLUG}/events.jsonl`;

    // Findings commit: multiple pipeline output files
    await fs.writeFile(path.join(tempDir, FINDINGS_PATH), "# Findings\n");
    await fs.writeFile(path.join(tempDir, STATE_JSON_PATH), '{"status":"running"}');
    await fs.writeFile(path.join(tempDir, EVENTS_JSONL_PATH), '{"type":"step.complete"}\n');
    const C2 = makeCommit(tempDir, "Findings + state + events (C2)");

    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C2,
      // All three are pipeline outputs — all will be excluded by excludePipelineManagedChangePaths
      changedFiles: [FINDINGS_PATH, STATE_JSON_PATH, EVENTS_JSONL_PATH],
      digestRefs: INITIAL_REFS, // canonical unchanged
    });

    const { executor, callCount } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { outcome } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    // All pipeline outputs excluded → sourceTouched = [] → no invalidation → skip
    expect(callCount()).toBe(0);
    expect(outcome).toBe("approved");
  });

  it("TC-045: findings commit does not change approvedAtCommit binding (re-anchored to C2)", async () => {
    // After a findings-only commit, the approved status is re-anchored to C2 by the
    // re-anchor logic in ParallelReviewRound (result.kind=success, status=approved, C2!=null).
    // This test verifies the re-anchor happens (approvedAtCommit updated to C2, canonHash preserved).
    await fs.mkdir(path.join(tempDir, "specrunner", "changes", SLUG), { recursive: true });
    await fs.writeFile(path.join(tempDir, DESIGN_MD_PATH), "# Design\n");
    const C1 = makeCommit(tempDir, "Initial");

    const H1 = computeCanonHash(INITIAL_REFS);
    const state = makeBaseState(tempDir, {
      reviewerStatuses: [
        { name: MEMBER_A, status: "approved", approvedAtCommit: C1, canonHash: H1 },
      ],
    });

    await fs.writeFile(path.join(tempDir, FINDINGS_PATH), "# Findings\n");
    const C2 = makeCommit(tempDir, "Findings only (C2)");

    const runtimeStrategy = makeRuntimeStrategy({
      headSha: C2,
      changedFiles: [FINDINGS_PATH],
      digestRefs: INITIAL_REFS,
    });

    const { executor } = makeApprovedExecutor();
    const round = new ParallelReviewRound({
      executor,
      steps: new Map([[MEMBER_A, makeMinimalStep(MEMBER_A)]]),
      parallelReview: { coordinator: COORDINATOR, members: [MEMBER_A] },
      events: new EventBus(),
    });

    const { state: resultState } = await round.run(
      COORDINATOR,
      state,
      makeDeps(tempDir, runtimeStrategy as never),
    );

    const memberStatus = resultState.reviewerStatuses?.find((s) => s.name === MEMBER_A);
    expect(memberStatus?.status).toBe("approved");
    // Re-anchor: approvedAtCommit should be updated to C2 (new baseline) so next round skip works
    expect(memberStatus?.approvedAtCommit).toBe(C2);
    // canonHash preserved through re-anchor (not reset by findings-only commit)
    // RED: canonHash field doesn't exist on ReviewerStatus yet
    expect(memberStatus?.canonHash).toBe(H1);
  });
});
