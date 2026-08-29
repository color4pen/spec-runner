/**
 * Unit tests for exclusion-aware unpushable-path and scoped residual checks.
 *
 * Covers:
 *   TC-001 (must):  worktree dirty な除外 path が guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない
 *   TC-002 (must):  worktree dirty な除外 path が commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない
 *   TC-004 (must):  unpushed commit に含まれる除外 path は従来どおりブロックされる
 *   TC-005 (must):  scoped step が除外 dirty path を残留違反として検出しない
 *   TC-006 (must):  除外対象でない dirty path は従来どおり residual violation になる
 *   TC-007 (must):  除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない
 *   TC-008 (must):  E2E — guarded step が除外未追跡ファイルを生成し後続 scoped step も halt しない
 *   TC-015 (should): commitScopedPaths の省略引数での後方互換性（7-arg call）
 *   TC-016 (should): validateStepOutputs の省略引数での後方互換性（3-arg call）
 *   TC-029 (must):  parallel-review-round 経由の commitRoundArtifacts が除外 path を UNPUSHABLE_PATH_BLOCKED しない
 *                   (tested via commitScopedPaths 8th-arg integration)
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
import type { OutputContract } from "../../port/output-contract.js";
import { LocalRuntime } from "../../runtime/local.js";

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
      // AND: scoped step declares specrunner/changes/${SLUG}/design.md (via makeScopedStep())
      const workflowStatus = statusEntry("??", ".github/workflows/x.yml");
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

  it(
    "TC-007b: scoped step — stagingExcludePatterns: ['specrunner/changes/**'] does NOT bypass write-scope for staged canon path in postStatus.stagedOnly",
    async () => {
      // GIVEN: stagingExcludePatterns: ["specrunner/changes/**"]
      // AND: scoped step (design) declares only design.md as output
      // AND: specrunner/changes/<slug>/spec.md is STAGED (X='A', Y=' ' → postStatus.stagedOnly)
      //
      // INVARIANT: postStatus.stagedOnly feeds directly into findWriteScopeViolations WITHOUT
      // going through applyStagingExclusions. The exclusion pattern cannot bypass this check.
      // (filteredResidualPaths = applyStagingExclusions(postStatus.paths, ...) — paths is empty
      //  because worktreeOnly=true skips staged-only entries → exclusion has no effect here)
      const CANON_PATH = `specrunner/changes/${SLUG}/spec.md`;
      // "A " = staged-new: X='A' (added to index), Y=' ' (worktree clean)
      // → getWorktreeChangedPaths puts it in stagedOnly+stagedNew; worktreeOnly=true skips it in paths
      const canonStagedStatus = statusEntry("A ", CANON_PATH);

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },     // [0] rev-parse HEAD
        { exitCode: 0 },                             // [1] add -A -- design.md
        { exitCode: 0, stdout: canonStagedStatus },  // [2] status (residual check) → spec.md staged
        // quarantineViolationEvidence: diff HEAD -- spec.md (file not in HEAD → empty diff)
        { exitCode: 0, stdout: "" },                 // [3] diff HEAD -- spec.md
        // restoreViolatedPaths: stagedNew → rm --cached then clean -f
        { exitCode: 0 },                             // [4] rm --cached -- spec.md
        { exitCode: 0 },                             // [5] clean -f -- spec.md
      ]);

      // WHEN: scoped design step with stagingExcludePatterns covering specrunner/changes/**
      await expect(
        commitAndPush(
          makeScopedStep(), // design step, declares specrunner/changes/<slug>/design.md
          makeState("design"),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      // THEN: WRITE_SCOPE_VIOLATION — spec.md is a protected canon path regardless of exclusion
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
    },
  );

  it(
    "TC-007c: scoped step — UNSTAGED dirty canon path matching exclusion pattern still triggers WRITE_SCOPE_VIOLATION",
    async () => {
      // GIVEN: stagingExcludePatterns: ["specrunner/changes/**"]
      // AND: scoped step (design) declares only design.md as output
      // AND: specrunner/changes/<slug>/spec.md is UNSTAGED dirty (untracked, "??" status)
      //
      // REGRESSION GUARD (Finding: commit-push.ts:584):
      // Before the fix, spec.md would be filtered out of filteredResidualPaths by
      // applyStagingExclusions. Since it is also absent from postStatus.stagedOnly
      // (unstaged files are not in stagedOnly), it bypassed ALL write-scope enforcement.
      //
      // After the fix, protectedCanonPaths bypass exclusion filtering and always remain
      // in filteredResidualPaths → findScopedCommitViolations detects the violation.
      const CANON_PATH = `specrunner/changes/${SLUG}/spec.md`;
      // "??" = untracked: appears in postStatus.paths (worktreeOnly=true includes it)
      // but NOT in postStatus.stagedOnly
      const canonUntrackedStatus = statusEntry("??", CANON_PATH);

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },          // [0] rev-parse HEAD
        { exitCode: 0 },                                   // [1] add -A -- design.md
        { exitCode: 0, stdout: canonUntrackedStatus },    // [2] status (residual check) → spec.md untracked
        // findScopedCommitViolations fires on CANON_PATH (bypass exclusion) → violation
        // quarantineViolationEvidence: git diff HEAD -- spec.md (untracked → empty diff)
        { exitCode: 0, stdout: "" },                       // [3] diff HEAD -- spec.md
        // restoreViolatedPaths: untracked → git clean -f
        { exitCode: 0 },                                   // [4] clean -f -- spec.md
      ]);

      // WHEN: scoped design step with stagingExcludePatterns covering specrunner/changes/**
      await expect(
        commitAndPush(
          makeScopedStep(), // design step, declares specrunner/changes/<slug>/design.md
          makeState("design"),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      // THEN: WRITE_SCOPE_VIOLATION — unstaged spec.md is caught via protectedCanonPaths bypass
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

// ---------------------------------------------------------------------------
// TC-008: E2E — guarded step が除外未追跡ファイルを生成し後続 scoped step も halt しない
// ---------------------------------------------------------------------------

describe("TC-008: E2E guarded → scoped complete story — excluded untracked file stays in worktree", () => {
  it(
    "TC-008: guarded implementer commit then scoped design commit both succeed; vendor/generated.js never committed or violated",
    async () => {
      // GIVEN: stagingExcludePatterns: ["vendor/**"]
      // AND: guarded implementer step generates vendor/generated.js (untracked)
      //      AND also modifies src/impl.ts (in-scope)
      // WHEN: guarded commitAndPush → scoped design commitAndPush
      // THEN: vendor/generated.js is not committed (excluded from staging)
      //       AND vendor/generated.js is not a residual violation in the scoped step
      //       AND both steps succeed without halt
      const IMPL_PATH = "src/impl.ts";
      const VENDOR_PATH = "vendor/generated.js";
      const DESIGN_PATH = `specrunner/changes/${SLUG}/design.md`;
      const SHA1 = "sha1-guarded-commit-tc008";
      const SHA2 = "sha2-scoped-commit-tc008";

      // Guarded step status: vendor/generated.js (untracked) + src/impl.ts (modified)
      const guardedStatus = statusEntry("??", VENDOR_PATH) + statusEntry(" M", IMPL_PATH);
      // Scoped residual check status: vendor/generated.js still dirty after guarded commit
      const scopedResidualStatus = statusEntry("??", VENDOR_PATH);

      // Git call sequence:
      // Guarded step (implementer):
      //   [0] rev-parse HEAD (headAtEntry)
      //   [1] status --untracked-files=all (getWorktreeChangedPaths) → vendor + impl
      //   [2] add -A -- src/impl.ts (vendor excluded by stagingExcludePatterns)
      //   [3] diff --cached --quiet → exit 1 (staged)
      //   [4] commit -m "implementer: test-slug" -- src/impl.ts
      //   [5] rev-parse HEAD → SHA1 (runInlineEgressCheck)
      //   [6] rev-list HEAD --not --remotes=origin → SHA1 (egress: SHA1 ∈ {SHA1} ✓)
      //   [7] push
      // Scoped step (design):
      //   [8]  rev-parse HEAD (headAtEntry)
      //   [9]  add -A -- design.md
      //   [10] status --porcelain -z (residual check) → vendor/generated.js dirty
      //        applyStagingExclusions: vendor excluded → filteredResidualPaths=[] → no violation
      //   [11] diff --cached --quiet -- design.md → exit 1 (staged)
      //   [12] commit -m "design: test-slug" -- design.md
      //   [13] rev-parse HEAD → SHA2 (runInlineEgressCheck)
      //   [14] rev-list HEAD --not --remotes=origin → SHA2 (egress: SHA2 ∈ {SHA2} ✓)
      //   [15] push
      const { fn, calls } = makeGitSpawnFn([
        // Guarded step
        { exitCode: 0, stdout: "headBefore\n" },          // [0]  rev-parse HEAD
        { exitCode: 0, stdout: guardedStatus },            // [1]  status (getWorktreeChangedPaths)
        { exitCode: 0 },                                   // [2]  add -A -- src/impl.ts
        { exitCode: 1 },                                   // [3]  diff --cached --quiet (staged)
        { exitCode: 0, stdout: `${SHA1}\n` },              // [4]  commit
        { exitCode: 0, stdout: `${SHA1}\n` },              // [5]  rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${SHA1}\n` },              // [6]  rev-list (egress: SHA1 ∈ {SHA1})
        { exitCode: 0 },                                   // [7]  push
        // Scoped step
        { exitCode: 0, stdout: `${SHA1}\n` },              // [8]  rev-parse HEAD
        { exitCode: 0 },                                   // [9]  add -A -- design.md
        { exitCode: 0, stdout: scopedResidualStatus },     // [10] status (residual check)
        { exitCode: 1 },                                   // [11] diff --cached --quiet -- design.md (staged)
        { exitCode: 0, stdout: `${SHA2}\n` },              // [12] commit
        { exitCode: 0, stdout: `${SHA2}\n` },              // [13] rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${SHA2}\n` },              // [14] rev-list (egress: SHA2 ∈ {SHA2})
        { exitCode: 0 },                                   // [15] push
      ]);

      const infra = makeInfra(fn);
      const deps = makeDeps({ stagingExcludePatterns: ["vendor/**"] });

      // Step 1: guarded commitAndPush (implementer)
      await expect(
        commitAndPush(
          makeGuardedStep(IMPL_PATH),
          makeState("implementer"),
          deps,
          null,
          infra,
        ),
      ).resolves.toBeUndefined();

      // Step 2: scoped commitAndPush (design) — vendor/generated.js still dirty, not a violation
      await expect(
        commitAndPush(
          {
            kind: "agent",
            name: "design",
            agent: { id: "design-agent" } as never,
            buildMessage: () => "design message",
            resultFilePath: () => null,
            parseResult: () => ({ verdict: "success", findingsPath: null }),
            writes: () => [{ path: DESIGN_PATH }],
          } as unknown as AgentStep,
          makeState("design"),
          deps,
          null,
          infra,
        ),
      ).resolves.toBeUndefined();

      // THEN: two commits, two pushes; vendor path never appears in commit pathspec
      const commitCalls = calls.filter((c) => c[0] === "commit");
      expect(commitCalls).toHaveLength(2);
      // vendor/generated.js must not appear in any commit call
      const vendorInCommit = commitCalls.some((c) => c.some((arg) => arg.includes(VENDOR_PATH)));
      expect(vendorInCommit).toBe(false);

      const pushCalls = calls.filter((c) => c[0] === "push");
      expect(pushCalls).toHaveLength(2);

      // vendor/generated.js must not be cleaned (not quarantined/restored)
      const cleanCalls = calls.filter((c) => c[0] === "clean");
      const vendorCleaned = cleanCalls.some((c) => c.some((arg) => arg.includes(VENDOR_PATH)));
      expect(vendorCleaned).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-015: commitScopedPaths backward compat — 7-arg call (no worktreeExcludePatterns)
// ---------------------------------------------------------------------------

describe("TC-015: commitScopedPaths backward compat — 7-arg call without worktreeExcludePatterns", () => {
  it(
    "TC-015: calling commitScopedPaths with 7 args (omitting worktreeExcludePatterns) succeeds without error",
    async () => {
      // GIVEN: no pushCapability (7th arg = null) → Layer 2 skipped
      // AND: no worktreeExcludePatterns (8th arg omitted)
      // WHEN: commitScopedPaths called with 7 positional args
      // THEN: function behaves as before (no exclusion filter, no UNPUSHABLE_PATH_BLOCKED)
      const COMMIT_SHA = "sha-tc015-abc";
      const SCOPED_PATH = `specrunner/changes/${SLUG}/result.md`;

      const { fn } = makeGitSpawnFn([
        { exitCode: 0 },                            // add -A -- result.md
        { exitCode: 1 },                            // diff --cached --quiet (staged)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // rev-list (egress)
        { exitCode: 0 },                            // push
      ]);

      // 7-arg call: worktreeExcludePatterns (8th arg) is omitted
      await expect(
        commitScopedPaths(
          [SCOPED_PATH],
          CWD,
          BRANCH,
          "design: test-slug",
          makeInfra(fn),
          undefined, // egress
          null,      // pushCapability (7th arg — Layer 2 skipped entirely)
          // no 8th arg: backward-compat call site
        ),
      ).resolves.toBeUndefined();
    },
  );

  it(
    "TC-015b: 7-arg call with pushCapability but no worktreeExcludePatterns — dirty path matching pushCapability triggers UNPUSHABLE_PATH_BLOCKED (no exclusion applied)",
    async () => {
      // Verifies that omitting worktreeExcludePatterns means NO exclusion:
      // a dirty path matching pushCapability patterns IS blocked (expected legacy behavior).
      const workflowStatus = statusEntry("??", ".github/workflows/x.yml");
      const SCOPED_PATH = `specrunner/changes/${SLUG}/result.md`;

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: workflowStatus }, // Layer 2: status (NOT excluded — no 8th arg)
        { exitCode: 0, stdout: "" },             // Layer 2: rev-list
      ]);

      // 7-arg call: no worktreeExcludePatterns → workflow path is in publishablePaths → BLOCKED
      await expect(
        commitScopedPaths(
          [SCOPED_PATH],
          CWD,
          BRANCH,
          "design: test-slug",
          makeInfra(fn),
          undefined,
          WORKFLOWS_CAPABILITY, // pushCapability with .github/workflows/** pattern
          // no 8th arg: no exclusion → UNPUSHABLE_PATH_BLOCKED expected
        ),
      ).rejects.toMatchObject({ code: "UNPUSHABLE_PATH_BLOCKED" });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-016: validateStepOutputs backward compat — 3-arg call (no excludeWorktreePatterns)
// ---------------------------------------------------------------------------

describe("TC-016: validateStepOutputs backward compat — 3-arg call without excludeWorktreePatterns", () => {
  it(
    "TC-016: calling validateStepOutputs with 3 args (omitting excludeWorktreePatterns) reports violation for dirty path matching contract",
    async () => {
      // GIVEN: no excludeWorktreePatterns (4th arg omitted)
      // AND: worktree has .github/workflows/x.yml dirty
      // AND: unpushable-path contract covers .github/workflows/**
      // WHEN: validateStepOutputs called with 3 args
      // THEN: violation IS reported (legacy behavior — no exclusion applied)
      const workflowStatus = "?? .github/workflows/x.yml\0";

      const spawnFn = async (_cmd: string, args: string[], _opts: { cwd: string }) => {
        if (args[0] === "status") {
          return { exitCode: 0, stdout: workflowStatus, stderr: "" };
        }
        // rev-list: no unpushed commits
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      const runtime = new LocalRuntime({
        cwd: "/tmp/fake-tc016",
        githubClient: {} as never,
        spawnFn: spawnFn as never,
      });

      const contracts: OutputContract[] = [
        {
          kind: "unpushable-path",
          path: ".github/workflows",
          policy: "follow-up",
          patterns: [".github/workflows/**"],
        },
      ];

      // 3-arg call: excludeWorktreePatterns (4th arg) is omitted → no filtering
      const result = await runtime.validateStepOutputs(
        contracts,
        "/tmp/fake-tc016",
        "test-branch",
        // no 4th arg: backward-compat call site
      );

      // THEN: violation is reported — dirty path not filtered (no exclusion)
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.kind).toBe("unpushable-path");
      expect(result.violations[0]!.detail).toContain(".github/workflows/x.yml");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-030: 除外パターンに一致する undeclared judge artifact が scoped residual check で violation になる
// ---------------------------------------------------------------------------
// Regression guard for the write-scope invariant extension (iter-3, F-001):
//
// The scoped residual check bypass predicate was previously limited to protectedCanonPaths.
// A reviewer that modifies an undeclared review-feedback-*.md / *-result-*.md file
// (a "judge artifact") could tamper with review evidence and bypass detection if the
// path matched a stagingExcludePatterns entry.
//
// After the fix, findWriteScopeViolations predicate (forbidden ∪ isJudgeArtifact, !declared)
// is used as the bypass set, ensuring undeclared judge artifacts always reach the residual
// check regardless of exclusion patterns.

describe("TC-030: undeclared judge artifact matching exclusion pattern → still WRITE_SCOPE_VIOLATION in scoped step", () => {
  it(
    "TC-030a: review-feedback-001.md (undeclared) matching 'specrunner/changes/**' exclusion → WRITE_SCOPE_VIOLATION",
    async () => {
      // GIVEN: stagingExcludePatterns: ["specrunner/changes/**"]
      // AND: scoped step (design) declares only design.md as output
      // AND: worktree has review-feedback-001.md dirty (untracked, "??" status)
      //      review-feedback-001.md is an isJudgeArtifact and NOT in declared writes
      // INVARIANT: the exclusion pattern matches review-feedback-001.md, but the
      //   findWriteScopeViolations bypass set includes it (isJudgeArtifact && !declared)
      //   → filteredResidualPaths includes it → findScopedCommitViolations detects violation
      const JUDGE_ARTIFACT = `specrunner/changes/${SLUG}/review-feedback-001.md`;
      const judgeArtifactStatus = statusEntry("??", JUDGE_ARTIFACT);

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },        // [0] rev-parse HEAD
        { exitCode: 0 },                                 // [1] add -A -- design.md
        { exitCode: 0, stdout: judgeArtifactStatus },   // [2] status (residual check) → review-feedback-001.md untracked
        // findScopedCommitViolations fires on review-feedback-001.md (bypass exclusion) → violation
        // quarantineViolationEvidence: git diff HEAD -- review-feedback-001.md (untracked → empty diff)
        { exitCode: 0, stdout: "" },                     // [3] diff HEAD -- review-feedback-001.md
        // restoreViolatedPaths: untracked → git clean -f
        { exitCode: 0 },                                 // [4] clean -f -- review-feedback-001.md
      ]);

      // WHEN: scoped design step with stagingExcludePatterns covering specrunner/changes/**
      await expect(
        commitAndPush(
          makeScopedStep(), // design step, declares specrunner/changes/<slug>/design.md
          makeState("design"),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      // THEN: WRITE_SCOPE_VIOLATION — undeclared judge artifact bypasses exclusion filter
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
    },
  );

  it(
    "TC-030b: *-result-*.md (undeclared) matching 'specrunner/changes/**' exclusion → WRITE_SCOPE_VIOLATION",
    async () => {
      // GIVEN: stagingExcludePatterns: ["specrunner/changes/**"]
      // AND: scoped step (design) declares only design.md
      // AND: worktree has code-review-result-001.md dirty (untracked)
      //      This is a judge artifact via /-result-/ pattern
      const RESULT_ARTIFACT = `specrunner/changes/${SLUG}/code-review-result-001.md`;
      const resultArtifactStatus = statusEntry("??", RESULT_ARTIFACT);

      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },         // [0] rev-parse HEAD
        { exitCode: 0 },                                  // [1] add -A -- design.md
        { exitCode: 0, stdout: resultArtifactStatus },   // [2] status (residual check)
        { exitCode: 0, stdout: "" },                      // [3] diff HEAD -- result artifact (quarantine)
        { exitCode: 0 },                                  // [4] clean -f -- result artifact
      ]);

      await expect(
        commitAndPush(
          makeScopedStep(), // design step, declares design.md
          makeState("design"),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
    },
  );

  it(
    "TC-030c: declared judge artifact is NOT blocked (positive control — step may write its own declared result)",
    async () => {
      // GIVEN: a scoped step that DECLARES its own result file (e.g., code-review declares result)
      // AND: stagingExcludePatterns: ["specrunner/changes/**"]
      // AND: worktree has the result file staged/changed (it was written by the step)
      // INVARIANT: findWriteScopeViolations predicate excludes declared paths from bypass set.
      //   The declared result file does NOT appear in potentialViolations, so it IS subject
      //   to applyStagingExclusions. Since the step declared it, filteredResidualPaths may
      //   not include it — but that's fine because declared paths are NOT violations.
      //   findScopedCommitViolations allows declared paths through (they're in `allowed`).
      //   The step should succeed without WRITE_SCOPE_VIOLATION.
      const RESULT_PATH = `specrunner/changes/${SLUG}/code-review-result-001.md`;
      const COMMIT_SHA = "sha-tc030c-abc";

      // Scoped step that declares the result path
      const scopedResultStep: AgentStep = {
        kind: "agent",
        name: "code-review",
        agent: { id: "code-review-agent" } as never,
        buildMessage: () => "code-review message",
        resultFilePath: () => null,
        parseResult: () => ({ verdict: "approved", findingsPath: null }),
        writes: () => [{ path: RESULT_PATH }],
      } as unknown as AgentStep;

      // After staging, the result file is staged (stagedOnly), not in worktree dirty.
      // postStatus.paths = [] (empty with worktreeOnly=true, file is purely staged)
      // postStatus.stagedOnly = [] or [RESULT_PATH] depending on status after add.
      // For simplicity: the step succeeds with no residual violation.
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },   // [0] rev-parse HEAD
        { exitCode: 0 },                            // [1] add -A -- RESULT_PATH
        { exitCode: 0, stdout: "" },                // [2] status (residual check — no worktree dirty)
        { exitCode: 1 },                            // [3] diff --cached --quiet (staged changes → exit 1)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // [4] commit
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // [5] rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_SHA}\n` }, // [6] rev-list (egress)
        { exitCode: 0 },                            // [7] push
      ]);

      await expect(
        commitAndPush(
          scopedResultStep,
          makeState("code-review"),
          makeDeps({ stagingExcludePatterns: ["specrunner/changes/**"] }),
          null,
          makeInfra(fn),
        ),
      ).resolves.toBeUndefined();

      // THEN: commit and push proceeded; no WRITE_SCOPE_VIOLATION
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});
