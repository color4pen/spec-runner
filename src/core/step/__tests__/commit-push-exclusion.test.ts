/**
 * Unit tests for exclusion-aware unpushable-path and scoped residual checks.
 *
 * Covers:
 *   TC-001 (must): worktree dirty な除外 path が guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない
 *   TC-002 (must): worktree dirty な除外 path が commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない
 *   TC-004 (must): unpushed commit に含まれる除外 path は従来どおりブロックされる
 *   TC-005 (must): scoped step が除外 dirty path を残留違反として検出しない
 *   TC-006 (must): 除外対象でない dirty path は従来どおり residual violation になる
 *   TC-007 (must): 除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない
 *   TC-029 (must): parallel-review-round 経由の commitRoundArtifacts が除外 path を UNPUSHABLE_PATH_BLOCKED しない
 *                  (tested via commitScopedPaths 8th-arg integration)
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import { commitAndPush, commitScopedPaths } from "../commit-push.js";
import type { CommitPushInfra } from "../commit-push.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn } from "../../../util/git-exec.js";
import type { AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import type { PushCapability } from "../../../git/push-capability.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo-exclusion-test";
const BRANCH = "change/exclusion-test-abc12345";
const SLUG = "test-slug";

// Push capability that blocks .github/workflows/**
const WORKFLOWS_CAPABILITY: PushCapability = {
  patterns: [".github/workflows/**"],
  source: "GitHub Actions installation token cannot push .github/workflows/**",
};

// ---------------------------------------------------------------------------
// Helper: ChildProcess-based SpawnFn mock
// ---------------------------------------------------------------------------

function makeGitSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;

  const fn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = stderrEE as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
      if (response.stderr) stderrEE.emit("data", Buffer.from(response.stderr));
      proc.emit("close", response.exitCode);
    });
    return proc;
  };
  return { fn, calls };
}

/** Build a porcelain -z status entry. */
function statusEntry(xy: string, path: string): string {
  return `${xy} ${path}\0`;
}

// ---------------------------------------------------------------------------
// Helpers: infra, state, deps
// ---------------------------------------------------------------------------

function makeInfra(spawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
  };
}

function makeState(stepName = "implementer"): JobState {
  return {
    version: 2,
    jobId: "exclusion-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: stepName as never,
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    synthesizedCommits: [],
  };
}

function makeDeps(pipelineConfig: Record<string, unknown> = {}, pushCapability?: PushCapability | null): PipelineDeps {
  return {
    cwd: CWD,
    slug: SLUG,
    config: {
      version: 1,
      agents: {},
      ...(Object.keys(pipelineConfig).length > 0 ? { pipeline: pipelineConfig } : {}),
    } as never,
    request: {
      type: "bug-fix",
      title: "Test",
      slug: SLUG,
      baseBranch: "main",
      content: "Test request",
      adr: false,
      path: `specrunner/changes/${SLUG}/request.md`,
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) as never,
    storeFactory: () => ({} as never),
    pushCapability: pushCapability ?? null,
  } as unknown as PipelineDeps;
}

/** guarded-mode step (implementer) */
function makeGuardedStep(implPath = "src/impl.ts"): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { id: "implementer-agent" } as never,
    buildMessage: () => "implementer message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: implPath }],
  } as unknown as AgentStep;
}

/** scoped-mode step (design) */
function makeScopedStep(): AgentStep {
  return {
    kind: "agent",
    name: "design",
    agent: { id: "design-agent" } as never,
    buildMessage: () => "design message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: `specrunner/changes/${SLUG}/design.md` }],
  } as unknown as AgentStep;
}

// ---------------------------------------------------------------------------
// TC-001: guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない
// ---------------------------------------------------------------------------

describe("TC-001: excluded worktree path does not cause UNPUSHABLE_PATH_BLOCKED in guarded step", () => {
  it(
    "TC-001: .github/workflows/x.yml dirty + stagingExcludePatterns match → no UNPUSHABLE_PATH_BLOCKED",
    async () => {
      // GIVEN: pushCapability blocks .github/workflows/**
      // AND: stagingExcludePatterns: [".github/workflows/**"] (same pattern, excludes from staging)
      // AND: worktree has .github/workflows/x.yml dirty (untracked)
      const workflowStatus = statusEntry("??", ".github/workflows/x.yml");

      // Call sequence for guarded mode with Layer 2 backstop:
      // 0: rev-parse HEAD (headAtEntry — same as headBeforeStep=null → no reset)
      // Layer 2 (collectPublishablePaths via gitPublishSpawn / runSubprocess):
      // 1: status (worktree component — .github/workflows/x.yml excluded → publishablePaths=[])
      // 2: rev-list (commit component — empty → no diff-tree)
      // Guarded mode:
      // 3: status (getWorktreeChangedPaths)
      // applyStagingExclusions: .github/workflows/x.yml excluded → stagePaths=[]
      // 4: diff --cached --quiet (no staged changes → exit 0 → return)
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },   // rev-parse HEAD
        { exitCode: 0, stdout: workflowStatus },    // Layer 2: status (collectPublishablePaths worktree)
        { exitCode: 0, stdout: "" },                // Layer 2: rev-list (no unpushed commits)
        { exitCode: 0, stdout: workflowStatus },    // guarded: status (getWorktreeChangedPaths)
        { exitCode: 0 },                            // diff --cached --quiet (nothing staged)
      ]);

      // WHEN
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ stagingExcludePatterns: [".github/workflows/**"] }, WORKFLOWS_CAPABILITY),
          null,
          makeInfra(fn),
        ),
      ).resolves.toBeUndefined();

      // THEN: no UNPUSHABLE_PATH_BLOCKED error; commit and push not called (nothing staged)
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("commit");
      expect(subcommands).not.toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない
// ---------------------------------------------------------------------------

describe("TC-002: excluded worktree path does not cause UNPUSHABLE_PATH_BLOCKED in commitScopedPaths", () => {
  it(
    "TC-002: .github/workflows/x.yml dirty + worktreeExcludePatterns → no UNPUSHABLE_PATH_BLOCKED",
    async () => {
      // GIVEN: pushCapability blocks .github/workflows/**
      // AND: worktreeExcludePatterns: [".github/workflows/**"]
      // AND: worktree has .github/workflows/x.yml dirty
      const workflowStatus = statusEntry("??", ".github/workflows/x.yml");
      const COMMIT_SHA = "sha-tc002-abc";
      const SCOPED_PATH = `specrunner/changes/${SLUG}/result.md`;

      // Call sequence for commitScopedPaths:
      // Layer 2:
      // 0: status (collectPublishablePaths worktree — excluded → publishablePaths=[])
      // 1: rev-list (collectPublishablePaths commit — empty)
      // Then:
      // 2: add -A -- <stagePaths>
      // 3: diff --cached --quiet -- <stagePaths> → staged (exit 1)
      // 4: commit
      // 5: push
      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: workflowStatus },    // Layer 2: status (excluded)
        { exitCode: 0, stdout: "" },                // Layer 2: rev-list
        { exitCode: 0 },                            // add
        { exitCode: 1 },                            // diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // commit
        { exitCode: 0 },                            // push
      ]);

      // WHEN
      await expect(
        commitScopedPaths(
          [SCOPED_PATH],
          CWD,
          BRANCH,
          "design: test-slug",
          makeInfra(fn),
          undefined,
          WORKFLOWS_CAPABILITY,
          [".github/workflows/**"], // worktreeExcludePatterns
        ),
      ).resolves.toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: unpushed commit に含まれる除外 path は従来どおりブロックされる
// ---------------------------------------------------------------------------

describe("TC-004: unpushed-commit path matching exclusion pattern still triggers UNPUSHABLE_PATH_BLOCKED", () => {
  it(
    "TC-004: .github/workflows/x.yml in an unpushed commit → UNPUSHABLE_PATH_BLOCKED despite exclusion",
    async () => {
      // GIVEN: .github/workflows/x.yml is in an unpushed COMMIT (not just worktree)
      // AND: stagingExcludePatterns: [".github/workflows/**"]
      // The commit component is NOT filtered by worktreeExcludePatterns
      const commitOid = "abc1234def56789";

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },                     // rev-parse HEAD (headAtEntry)
        { exitCode: 0, stdout: "" },                                   // Layer 2: status (clean worktree)
        { exitCode: 0, stdout: `${commitOid}\n` },                    // Layer 2: rev-list (one commit)
        { exitCode: 0, stdout: ".github/workflows/x.yml\n" },         // Layer 2: diff-tree (commit content)
      ]);

      // WHEN: stagingExcludePatterns is set, but the file is in a commit (not just worktree)
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ stagingExcludePatterns: [".github/workflows/**"] }, WORKFLOWS_CAPABILITY),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "UNPUSHABLE_PATH_BLOCKED" });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: scoped step が除外 dirty path を残留違反として検出しない
// ---------------------------------------------------------------------------

describe("TC-005: excluded dirty path is not a scoped residual violation", () => {
  it(
    "TC-005: .github/workflows/x.yml dirty (untracked) in scoped step → no WRITE_SCOPE_VIOLATION",
    async () => {
      // GIVEN: stagingExcludePatterns: [".github/workflows/**"]
      // AND: worktree has .github/workflows/x.yml dirty (untracked)
      // AND: scoped step declares specrunner/changes/${SLUG}/design.md
      const workflowStatus = statusEntry("??", ".github/workflows/x.yml");
      const SCOPED_PATH = `specrunner/changes/${SLUG}/design.md`;
      const COMMIT_SHA = "sha-tc005-abc";

      // Scoped mode call sequence:
      // 0: rev-parse HEAD
      // (no Layer 2 because pushCapability is not set in this test)
      // 1: add -A -- specrunner/changes/${SLUG}/design.md
      // 2: status --porcelain -z --no-renames (residual check — returns workflow dirty)
      //    → findScopedCommitViolations with applyStagingExclusions:
      //      .github/workflows/x.yml excluded → no violation
      // 3: diff --cached --quiet -- <stagePaths> (staged changes)
      // 4: commit
      // 5: rev-parse HEAD (egress)
      // 6: rev-list (egress)
      // 7: push
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },         // rev-parse HEAD
        { exitCode: 0 },                                  // add
        { exitCode: 0, stdout: workflowStatus },          // status (residual check — has workflow dirty)
        { exitCode: 1 },                                  // diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },       // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },       // rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` },       // rev-list (egress)
        { exitCode: 0 },                                  // push
      ]);

      // WHEN: commitAndPush scoped step with stagingExcludePatterns
      await expect(
        commitAndPush(
          makeScopedStep(),
          makeState("design"),
          makeDeps({ stagingExcludePatterns: [".github/workflows/**"] }),
          null,
          makeInfra(fn),
        ),
      ).resolves.toBeUndefined();

      // THEN: commit and push proceeded; no WRITE_SCOPE_VIOLATION
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");

      // AND: no quarantine evidence of the excluded path
      const cleanCalls = calls.filter((c) => c[0] === "clean");
      expect(cleanCalls.every((c) => !c.includes(".github/workflows/x.yml"))).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: 除外対象でない dirty path は従来どおり residual violation になる
// ---------------------------------------------------------------------------

describe("TC-006: non-excluded dirty path is still a residual violation", () => {
  it(
    "TC-006: vendor/x.js dirty (non-excluded) in scoped step → WRITE_SCOPE_VIOLATION",
    async () => {
      // GIVEN: stagingExcludePatterns: [".github/workflows/**"] (does NOT exclude vendor/)
      // AND: worktree has vendor/x.js dirty (untracked) — not excluded
      const vendorStatus = statusEntry("??", "vendor/x.js");
      const SCOPED_PATH = `specrunner/changes/${SLUG}/design.md`;

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },   // rev-parse HEAD
        { exitCode: 0 },                            // add
        { exitCode: 0, stdout: vendorStatus },      // status (residual check — vendor/x.js)
        // restoreViolatedPaths aftermath (quarantine evidence + git clean):
        { exitCode: 0, stdout: "" },                // git diff HEAD -- vendor/x.js (quarantine)
        { exitCode: 0 },                            // git clean -f -- vendor/x.js
      ]);

      // WHEN: commitAndPush scoped step — vendor/x.js is NOT excluded
      await expect(
        commitAndPush(
          {
            kind: "agent",
            name: "design",
            agent: { id: "design-agent" } as never,
            buildMessage: () => "design message",
            resultFilePath: () => null,
            parseResult: () => ({ verdict: "success", findingsPath: null }),
            writes: () => [{ path: SCOPED_PATH }],
          } as unknown as AgentStep,
          makeState("design"),
          makeDeps({ stagingExcludePatterns: [".github/workflows/**"] }),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: 除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない
// ---------------------------------------------------------------------------

describe("TC-007: exclusion pattern on protected canon path does not bypass write-scope enforcement", () => {
  it(
    "TC-007: specrunner/changes/** exclusion does NOT prevent WRITE_SCOPE_VIOLATION for canon writes in scoped step",
    async () => {
      // NOTE: this is for scoped step residual check.
      // The canon violation detection uses postStatus.stagedOnly, not filteredResidualPaths.
      // Even with stagingExcludePatterns: ["specrunner/changes/**"], a STAGED canon file
      // (e.g. spec.md staged but not in declared writes) must still be detected.
      //
      // However, the more common scenario for TC-007 is in GUARDED mode:
      // findWriteScopeViolations runs on FULL changedPaths (before exclusion).
      // Test: guarded step with stagingExcludePatterns covering a canon path.
      const CANON_PATH = `specrunner/changes/${SLUG}/spec.md`;
      const canonStatus = statusEntry("??", CANON_PATH);

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },   // rev-parse HEAD
        { exitCode: 0, stdout: canonStatus },       // status (guarded mode getWorktreeChangedPaths)
        // findWriteScopeViolations fires on CANON_PATH → violation
        // quarantineViolationEvidence:
        { exitCode: 0, stdout: "" },                // git diff HEAD -- canon path
        // restoreViolatedPaths:
        { exitCode: 0 },                            // git clean -f -- CANON_PATH
      ]);

      // WHEN: guarded step with stagingExcludePatterns: ["specrunner/changes/**"]
      // The exclusion pattern covers the canon path, but write-scope check runs BEFORE exclusion
      await expect(
        commitAndPush(
          makeGuardedStep(),
          makeState(),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-029: commitScopedPaths 8th-arg worktreeExcludePatterns propagation
//         (tests the T-04 integration via direct commitScopedPaths call)
// ---------------------------------------------------------------------------

describe("TC-029: commitScopedPaths 8th arg worktreeExcludePatterns propagates to Layer 2", () => {
  it(
    "TC-029: passing worktreeExcludePatterns prevents UNPUSHABLE_PATH_BLOCKED for excluded worktree path",
    async () => {
      // GIVEN: pushCapability blocks .github/workflows/**
      // AND: worktree has .github/workflows/ci.yml dirty
      // AND: worktreeExcludePatterns (8th arg) = [".github/workflows/**"]
      const workflowStatus = statusEntry("??", ".github/workflows/ci.yml");
      const COMMIT_SHA = "sha-tc029-abc";
      const SCOPED_PATH = `specrunner/changes/${SLUG}/result.md`;

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: workflowStatus },    // Layer 2: status (excluded)
        { exitCode: 0, stdout: "" },                // Layer 2: rev-list
        { exitCode: 0 },                            // add
        { exitCode: 1 },                            // diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // commit
        { exitCode: 0 },                            // push
      ]);

      // WHEN: 8th argument provides the exclusion patterns
      await expect(
        commitScopedPaths(
          [SCOPED_PATH],
          CWD,
          BRANCH,
          "coordinator: test-slug",
          makeInfra(fn),
          undefined,
          WORKFLOWS_CAPABILITY,
          [".github/workflows/**"], // 8th arg: worktreeExcludePatterns
        ),
      ).resolves.toBeUndefined();
    },
  );
});
