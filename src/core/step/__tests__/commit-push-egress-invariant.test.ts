/**
 * Tests for egress-ledger-push-failure fix.
 *
 * Covers TC-001 through TC-012 from test-cases.md (must: TC-001..TC-009, TC-013; should: TC-008, TC-010, TC-011; could: TC-012).
 * TC-013, TC-014 are regression checks over existing test files (run separately).
 * TC-015 is the full typecheck && test integration gate.
 *
 * RED state:
 *   - TC-001, TC-002, TC-008, TC-009: fail because CommitPushInfra.persistBeforePush
 *     is not present (T-01) and commitAndPush does not call it (T-02 / T-03).
 *   - TC-003, TC-004, TC-010: fail because commitFinalState does not call persistBeforePush (T-04).
 *   - TC-005: fails because without T-02 persistBeforePush is never called so the OID
 *     is not captured in the integration flow.
 *   - TC-006, TC-011: fail because pushFailedError / commitFinalState warning do not
 *     include git stderr (T-07).
 *   - TC-007: fails because verifyEgressLedger does not accept/use branch (T-08).
 *   - TC-012: verifies existing fallback behaviour (passes/fails based on T-08).
 */

import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import {
  commitAndPush,
  commitFinalState,
  verifyEgressLedger,
  pushOnly,
} from "../commit-push.js";
import type { CommitPushInfra } from "../commit-push.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn } from "../../../util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../util/spawn.js";
import type { AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo-egress-test";
const BRANCH = "fix/test-branch-abc12345";
const SLUG = "test-slug";

// Paths used in scoped-mode tests
const SCOPED_OUTPUT_PATH = `specrunner/changes/${SLUG}/result-001.md`;
// Path used in guarded-mode tests (non-canon, implementer-owned)
const GUARDED_CHANGED_PATH = "src/impl-core-001.ts";

// ---------------------------------------------------------------------------
// Helper: ChildProcess-based SpawnFn mock (for CommitPushInfra.spawnFn)
// ---------------------------------------------------------------------------

/**
 * Build a git-exec.ts SpawnFn that returns fake ChildProcess instances.
 * Each call consumes the next response from `responses`.
 * Tracks all args in `calls`.
 */
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

/**
 * Build a simple async PipelineSpawnFn (spawn.ts variant) from a sequence of responses.
 * Each call consumes the next response in order; excess calls return exit 0.
 */
function makePipelineSpawnFnFromSequence(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: PipelineSpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;
  const fn: PipelineSpawnFn = async (_cmd, args, _opts) => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    return {
      exitCode: response.exitCode,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// Helper: fake CommitPushInfra
// ---------------------------------------------------------------------------

function makeInfra(
  spawnFn: SpawnFn,
  persistBeforePush?: (oid: string) => Promise<void>,
): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
    // persistBeforePush is optional; will be present after T-01 is implemented
    ...(persistBeforePush !== undefined ? { persistBeforePush } : {}),
  } as CommitPushInfra;
}

// ---------------------------------------------------------------------------
// Helper: minimal job state
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "egress-invariant-test-job",
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
    step: "design",
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
    synthesizedCommits: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: minimal PipelineDeps (only cwd and slug are used by commitAndPush)
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    cwd: CWD,
    slug: SLUG,
    config: {} as never,
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
    ...overrides,
  } as unknown as PipelineDeps;
}

// ---------------------------------------------------------------------------
// Helper: AgentStep fakes
// ---------------------------------------------------------------------------

/**
 * "design" step — scoped mode, declares one output path.
 */
function makeScopedStep(): AgentStep {
  return {
    kind: "agent",
    name: "design",
    agent: { id: "design-agent" } as never,
    buildMessage: () => "design message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: SCOPED_OUTPUT_PATH }],
  } as unknown as AgentStep;
}

/**
 * "implementer" step — guarded mode, declares one output path.
 */
function makeGuardedStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { id: "implementer-agent" } as never,
    buildMessage: () => "implementer message",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
    writes: () => [{ path: GUARDED_CHANGED_PATH }],
  } as unknown as AgentStep;
}

// ---------------------------------------------------------------------------
// TC-001: scoped モードで push が失敗した場合に persistBeforePush が呼ばれる
// ---------------------------------------------------------------------------

describe("TC-001: scoped mode — push fails → persistBeforePush is called with commit OID", () => {
  it(
    // TC-001
    "TC-001: persistBeforePush receives synthesis commit OID even when both push attempts fail (scoped)",
    async () => {
      const COMMIT_OID = "sha-scoped-push-fail-001";

      // Sequence of git commands for scoped mode (after T-02 implementation):
      //   0: rev-parse HEAD (headAtEntry)
      //   1: add -A -- <path>
      //   2: status --porcelain -z --no-renames (residual check)
      //   3: diff --cached --quiet -- <path>
      //   4: commit -m msg -- <path>
      //   5: rev-parse HEAD (T-02: for persistBeforePush)
      //   6: rev-parse HEAD (inside runInlineEgressCheck)
      //   7: rev-list HEAD --not --remotes=origin
      //   8: push -u origin <branch> (first, fails)
      //   9: push -u origin <branch> (second, fails → pushFailedError)
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },       // 0: rev-parse HEAD
        { exitCode: 0 },                               // 1: add
        { exitCode: 0, stdout: "" },                   // 2: status (no residuals)
        { exitCode: 1 },                               // 3: diff (staged changes present)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 4: commit
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 5: rev-parse HEAD (T-02)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 6: rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 7: rev-list
        { exitCode: 1 },                               // 8: push (fail 1)
        { exitCode: 1 },                               // 9: push (fail 2)
      ]);

      const persistBeforePush = vi.fn(async (_oid: string) => {});
      const infra = makeInfra(fn, persistBeforePush);
      const state = makeState();
      const deps = makeDeps();

      await expect(
        commitAndPush(makeScopedStep(), state, deps, null, infra),
      ).rejects.toMatchObject({ code: "PUSH_FAILED" });

      // TC-001: persistBeforePush must have been called with the commit OID
      expect(persistBeforePush).toHaveBeenCalledTimes(1);
      expect(persistBeforePush).toHaveBeenCalledWith(COMMIT_OID);

      // Verify push was attempted (calls after commit must include "push")
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-002: guarded モードで push が失敗した場合に persistBeforePush が呼ばれる
// ---------------------------------------------------------------------------

describe("TC-002: guarded mode — push fails → persistBeforePush is called with commit OID", () => {
  it(
    // TC-002
    "TC-002: persistBeforePush receives synthesis commit OID even when both push attempts fail (guarded)",
    async () => {
      const COMMIT_OID = "sha-guarded-push-fail-002";

      // Sequence for guarded mode (after T-03 implementation):
      //   0: rev-parse HEAD (headAtEntry)
      //   1: status --porcelain -z --no-renames → one modified file (no violation)
      //   2: add -A -- src/impl-core-001.ts
      //   3: diff --cached --quiet (whole-index, no pathspec)
      //   4: commit -m "implementer: test-slug" -- src/impl-core-001.ts
      //   5: rev-parse HEAD (T-03: for persistBeforePush)
      //   6: rev-parse HEAD (inside runInlineEgressCheck)
      //   7: rev-list HEAD --not --remotes=origin
      //   8: push (fail 1)
      //   9: push (fail 2)
      //
      // git status --porcelain -z format: XY PATH\0
      // " M src/impl-core-001.ts" → X=' ', Y='M', space, path
      const STATUS_OUTPUT = ` M ${GUARDED_CHANGED_PATH}\0`;

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },           // 0: rev-parse HEAD
        { exitCode: 0, stdout: STATUS_OUTPUT },             // 1: status
        { exitCode: 0 },                                   // 2: add
        { exitCode: 1 },                                   // 3: diff (staged changes)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },        // 4: commit
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },        // 5: rev-parse HEAD (T-03)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },        // 6: rev-parse HEAD (egress)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },        // 7: rev-list
        { exitCode: 1 },                                   // 8: push (fail 1)
        { exitCode: 1 },                                   // 9: push (fail 2)
      ]);

      const persistBeforePush = vi.fn(async (_oid: string) => {});
      const infra = makeInfra(fn, persistBeforePush);
      const state = makeState({ step: "implementer" });
      const deps = makeDeps();

      await expect(
        commitAndPush(makeGuardedStep(), state, deps, null, infra),
      ).rejects.toMatchObject({ code: "PUSH_FAILED" });

      // TC-002: persistBeforePush must have been called with the commit OID
      expect(persistBeforePush).toHaveBeenCalledTimes(1);
      expect(persistBeforePush).toHaveBeenCalledWith(COMMIT_OID);

      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).toContain("commit");
      expect(subcommands).toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-003: commitFinalState が push 成功する場合に persistBeforePush が push 前に呼ばれる
// ---------------------------------------------------------------------------

describe("TC-003: commitFinalState push success — persistBeforePush called before push", () => {
  it(
    // TC-003
    "TC-003: persistBeforePush is called with checkpoint commit OID before successful push",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-003";
      const callOrder: string[] = [];

      // PipelineSpawnFn sequence for commitFinalState (after T-04 implementation):
      //   Multiple "git add -- <path>" calls (one per managed path, all exit 0 or 1)
      //   "git diff --cached --quiet -- <paths>" → exit 1 (staged changes)
      //   "git commit -m checkpoint: test-slug -- <paths>" → exit 0
      //   "git rev-parse HEAD" → CHECKPOINT_OID  (T-04 new)
      //   "git rev-parse HEAD" → CHECKPOINT_OID  (inside verifyEgressLedger)
      //   "git rev-list HEAD --not --remotes=origin" → CHECKPOINT_OID
      //   "git push -u origin <branch>" → exit 0 (success)
      const { fn: pipelineSpawnFn } = makePipelineSpawnFnFromSequence([
        { exitCode: 0 }, // add state.json
        { exitCode: 0 }, // add events.jsonl
        { exitCode: 0 }, // add usage.json
        { exitCode: 0 }, // add bite-evidence-result.md
        { exitCode: 0 }, // add pr-create-result.md (if present)
        { exitCode: 1 }, // diff --cached → staged changes
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // commit
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (T-04)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (verifyEgressLedger)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-list
        { exitCode: 0 }, // push → success
      ]);

      const persistBeforePush = vi.fn(async (_oid: string) => {
        callOrder.push("persistBeforePush");
      });

      const wrappedSpawnFn: PipelineSpawnFn = async (cmd, args, opts) => {
        const result = await pipelineSpawnFn(cmd, args, opts);
        if (args[0] === "push") callOrder.push("push");
        return result;
      };

      await commitFinalState({
        cwd: CWD,
        branch: BRANCH,
        slug: SLUG,
        spawnFn: wrappedSpawnFn,
        messageLabel: "checkpoint",
        synthesizedCommits: [],
        // persistBeforePush added by T-04
        persistBeforePush,
      });

      // TC-003: persistBeforePush must have been called
      expect(persistBeforePush).toHaveBeenCalledTimes(1);
      expect(persistBeforePush).toHaveBeenCalledWith(CHECKPOINT_OID);

      // Order: persistBeforePush before push
      const persistIdx = callOrder.indexOf("persistBeforePush");
      const pushIdx = callOrder.indexOf("push");
      expect(persistIdx).toBeGreaterThan(-1);
      expect(pushIdx).toBeGreaterThan(-1);
      expect(persistIdx).toBeLessThan(pushIdx);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-004: commitFinalState が push 失敗した場合も persistBeforePush が呼ばれる
// ---------------------------------------------------------------------------

describe("TC-004: commitFinalState push fails — persistBeforePush still called", () => {
  it(
    // TC-004
    "TC-004: push failure does not prevent persistBeforePush from being called",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-004";

      const { fn: pipelineSpawnFn } = makePipelineSpawnFnFromSequence([
        { exitCode: 0 }, // add state.json
        { exitCode: 0 }, // add events.jsonl
        { exitCode: 0 }, // add usage.json
        { exitCode: 0 }, // add bite-evidence-result.md
        { exitCode: 0 }, // add pr-create-result.md
        { exitCode: 1 }, // diff → staged changes
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // commit
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (T-04)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (verifyEgressLedger)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-list
        { exitCode: 1 }, // push (fail 1)
        { exitCode: 1 }, // push (fail 2)
      ]);

      const persistBeforePush = vi.fn(async (_oid: string) => {});

      // commitFinalState does not throw on push failure (best-effort)
      await expect(
        commitFinalState({
          cwd: CWD,
          branch: BRANCH,
          slug: SLUG,
          spawnFn: pipelineSpawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [],
          persistBeforePush,
        }),
      ).resolves.toBeUndefined();

      // TC-004: persistBeforePush must have been called despite push failure
      expect(persistBeforePush).toHaveBeenCalledTimes(1);
      expect(persistBeforePush).toHaveBeenCalledWith(CHECKPOINT_OID);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-005: push 失敗 → halt → resume の egress 検証 pin
// ---------------------------------------------------------------------------

describe("TC-005: push failure → halt → resume egress pin", () => {
  it(
    // TC-005
    "TC-005: OID recorded by persistBeforePush before push failure is not unknown in subsequent verifyEgressLedger",
    async () => {
      const SYNTH_OID = "sha-synth-pin-005";
      const capturedOids: string[] = [];

      // Step 1: commitAndPush with push failure; persistBeforePush captures the OID
      const { fn: gitSpawnFn } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },         // rev-parse HEAD (headAtEntry)
        { exitCode: 0 },                                 // add
        { exitCode: 0, stdout: "" },                     // status (no residuals)
        { exitCode: 1 },                                 // diff (staged)
        { exitCode: 0, stdout: `${SYNTH_OID}\n` },      // commit
        { exitCode: 0, stdout: `${SYNTH_OID}\n` },      // rev-parse HEAD (T-02)
        { exitCode: 0, stdout: `${SYNTH_OID}\n` },      // rev-parse HEAD (egress check)
        { exitCode: 0, stdout: `${SYNTH_OID}\n` },      // rev-list
        { exitCode: 1 },                                 // push fail 1
        { exitCode: 1 },                                 // push fail 2
      ]);

      const persistBeforePush = vi.fn(async (oid: string) => {
        capturedOids.push(oid);
      });
      const infra = makeInfra(gitSpawnFn, persistBeforePush);

      await expect(
        commitAndPush(makeScopedStep(), makeState(), makeDeps(), null, infra),
      ).rejects.toMatchObject({ code: "PUSH_FAILED" });

      // persistBeforePush must have been called (fails before T-02 implementation)
      expect(capturedOids).toHaveLength(1);
      expect(capturedOids[0]).toBe(SYNTH_OID);

      // Step 2: On resume, verifyEgressLedger with the persisted OID must NOT throw
      // EGRESS_UNKNOWN_COMMIT even though the commit was not pushed to origin.
      const persistedLedger = [...capturedOids]; // simulates ledger loaded from store

      const pipelineSpawnFn: PipelineSpawnFn = async (_cmd, args, _opts) => {
        if (args[0] === "rev-list") {
          // Simulate: the failed-push commit is still in the local publish range
          return { exitCode: 0, stdout: `${SYNTH_OID}\n`, stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      await expect(
        verifyEgressLedger({
          cwd: CWD,
          ledger: persistedLedger,
          spawnFn: pipelineSpawnFn,
        }),
      ).resolves.toBeUndefined();
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006: git push が stderr を出力して失敗した場合に pushFailedError に stderr が含まれる
// ---------------------------------------------------------------------------

describe("TC-006: push stderr is included in pushFailedError detail", () => {
  it(
    // TC-006
    "TC-006: pushFailedError.detail contains git stderr from the final push attempt",
    async () => {
      const PUSH_STDERR = "remote: error: push rejected by pre-receive hook";

      const { fn } = makeGitSpawnFn([
        // First push: exit 1, with stderr
        { exitCode: 1, stderr: "remote: temporary error\n" },
        // Sleep is mocked in infra
        // Second push: exit 1, with final stderr that should appear in the error
        { exitCode: 1, stderr: `${PUSH_STDERR}\n` },
      ]);

      const infra = makeInfra(fn);

      // SpecRunnerError: code is the error code, message (Error.message) contains the detail string.
      // After T-07: pushFailedError(stepName, branch, `exit code ${exitCode}: ${stderr}`)
      // so Error.message = "<step>: git push origin <branch> failed after retry: exit code 1: <stderr>"
      await expect(
        pushOnly(BRANCH, CWD, "design", infra),
      ).rejects.toMatchObject({
        code: "PUSH_FAILED",
        message: expect.stringContaining(PUSH_STDERR),
      });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-007: verifyEgressLedger が branch 付きで呼ばれた場合に EGRESS_UNKNOWN_COMMIT
//         メッセージに branch 名が含まれる
// ---------------------------------------------------------------------------

describe("TC-007: verifyEgressLedger with branch — EGRESS_UNKNOWN_COMMIT includes branch name", () => {
  it(
    // TC-007
    "TC-007: EGRESS_UNKNOWN_COMMIT error message contains the branch name passed to verifyEgressLedger",
    async () => {
      const UNKNOWN_OID = "deadbeef-unknown-007";
      const TEST_BRANCH = "fix/my-feature-abc12345";

      const pipelineSpawnFn: PipelineSpawnFn = async (_cmd, args, _opts) => {
        if (args[0] === "rev-list") {
          return { exitCode: 0, stdout: `${UNKNOWN_OID}\n`, stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      // egressUnknownCommitError message: "Egress backstop: unknown commit ${oid} in publish range for branch '${branch}'."
      // After T-08: branch param is threaded through verifyEgressLedger → egressUnknownCommitError
      await expect(
        verifyEgressLedger({
          cwd: CWD,
          ledger: [], // empty ledger → OID is unknown
          branch: TEST_BRANCH, // T-08 adds this param
          spawnFn: pipelineSpawnFn,
        }),
      ).rejects.toMatchObject({
        code: "EGRESS_UNKNOWN_COMMIT",
        message: expect.stringContaining(TEST_BRANCH),
      });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-008 (should): scoped モードで push が成功した場合も persistBeforePush が
//                  egress check 前に呼ばれる (order: 記録 → egress 検証 → push)
// ---------------------------------------------------------------------------

describe("TC-008 (should): scoped mode push success — call order is persist → egress → push", () => {
  it(
    // TC-008
    "TC-008: persistBeforePush is invoked before runInlineEgressCheck and before push on success path",
    async () => {
      const COMMIT_OID = "sha-order-check-008";
      const callOrder: string[] = [];

      // Build SpawnFn that tracks "push" invocations in callOrder
      const responses = [
        { exitCode: 0, stdout: "headBefore\n" },       // 0: rev-parse HEAD
        { exitCode: 0 },                               // 1: add
        { exitCode: 0, stdout: "" },                   // 2: status
        { exitCode: 1 },                               // 3: diff (staged)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 4: commit
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 5: rev-parse HEAD (T-02: for persistBeforePush)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 6: rev-parse HEAD (inside runInlineEgressCheck)
        { exitCode: 0, stdout: `${COMMIT_OID}\n` },    // 7: rev-list
        { exitCode: 0 },                               // 8: push → success
      ];
      let respIdx = 0;

      const trackingSpawnFn: SpawnFn = (_bin, args, _opts): ChildProcess => {
        const response = responses[respIdx++] ?? { exitCode: 0 };
        if (args[0] === "push") callOrder.push("push");
        const proc = new EventEmitter() as unknown as ChildProcess;
        const stdoutEE = new EventEmitter();
        const stderrEE = new EventEmitter();
        proc.stdout = stdoutEE as never;
        proc.stderr = stderrEE as never;
        proc.stdin = { end: () => {} } as never;
        setImmediate(() => {
          if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
          proc.emit("close", response.exitCode);
        });
        return proc;
      };

      const persistBeforePush = vi.fn(async (oid: string) => {
        callOrder.push(`persistBeforePush:${oid}`);
      });

      const infra: CommitPushInfra = {
        spawnFn: trackingSpawnFn,
        sleepFn: vi.fn(async () => {}),
        events: new EventBus(),
        persistBeforePush,
      } as CommitPushInfra;

      await commitAndPush(makeScopedStep(), makeState(), makeDeps(), null, infra);

      // TC-008: persistBeforePush must be called (non-empty) and before push
      expect(persistBeforePush).toHaveBeenCalledWith(COMMIT_OID);

      const persistIdx = callOrder.findIndex((e) => e.startsWith("persistBeforePush"));
      const pushIdx = callOrder.findIndex((e) => e === "push");
      expect(persistIdx).toBeGreaterThan(-1);
      expect(pushIdx).toBeGreaterThan(-1);
      expect(persistIdx).toBeLessThan(pushIdx);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: persistBeforePush が throw した場合に commitAndPush が throw し
//         push が実行されない
// ---------------------------------------------------------------------------

describe("TC-009: persistBeforePush throw — commitAndPush rethrows, push not called (fail-closed)", () => {
  it(
    // TC-009
    "TC-009: commitAndPush propagates persistBeforePush error and does not call push",
    async () => {
      const PERSIST_ERROR = new Error("persist-store-write-failed");

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: "headBefore\n" },       // 0: rev-parse HEAD
        { exitCode: 0 },                               // 1: add
        { exitCode: 0, stdout: "" },                   // 2: status
        { exitCode: 1 },                               // 3: diff (staged)
        { exitCode: 0, stdout: "sha-fail-009\n" },     // 4: commit
        { exitCode: 0, stdout: "sha-fail-009\n" },     // 5: rev-parse HEAD (T-02) — triggers persistBeforePush
        // No further responses needed: persistBeforePush throws → commitAndPush rethrows
      ]);

      const persistBeforePush = vi.fn(async (_oid: string) => {
        throw PERSIST_ERROR;
      });
      const infra = makeInfra(fn, persistBeforePush);

      await expect(
        commitAndPush(makeScopedStep(), makeState(), makeDeps(), null, infra),
      ).rejects.toThrow(PERSIST_ERROR);

      // TC-009: push must NOT have been called
      const subcommands = calls.map((c) => c[0]);
      expect(subcommands).not.toContain("push");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-010 (should): commitFinalState の persistBeforePush が throw しても
//                  push が試行される (best-effort)
// ---------------------------------------------------------------------------

describe("TC-010 (should): commitFinalState persistBeforePush throw — push still attempted", () => {
  it(
    // TC-010
    "TC-010: commitFinalState continues to push even when persistBeforePush throws",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-010";
      const pushCalls: string[][] = [];

      const { fn: pipelineSpawnFn } = makePipelineSpawnFnFromSequence([
        { exitCode: 0 }, // add state.json
        { exitCode: 0 }, // add events.jsonl
        { exitCode: 0 }, // add usage.json
        { exitCode: 0 }, // add bite-evidence-result.md
        { exitCode: 0 }, // add pr-create-result.md
        { exitCode: 1 }, // diff → staged
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // commit
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (T-04 new)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (verifyEgressLedger)
        { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-list
        { exitCode: 0 }, // push (success, shows push was attempted despite persistBeforePush failure)
      ]);

      const wrappedSpawnFn: PipelineSpawnFn = async (cmd, args, opts) => {
        if (args[0] === "push") pushCalls.push([...args]);
        return pipelineSpawnFn(cmd, args, opts);
      };

      const persistBeforePush = vi.fn(async (_oid: string) => {
        throw new Error("disk-full: cannot persist");
      });

      // commitFinalState must NOT throw (best-effort path)
      await expect(
        commitFinalState({
          cwd: CWD,
          branch: BRANCH,
          slug: SLUG,
          spawnFn: wrappedSpawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [],
          persistBeforePush,
        }),
      ).resolves.toBeUndefined();

      // TC-010: persistBeforePush must have been called (verifies T-04 is in place)
      // and push must still have been attempted (verifies best-effort continue).
      expect(persistBeforePush).toHaveBeenCalledTimes(1);
      expect(pushCalls.length).toBeGreaterThan(0);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-011 (should): commitFinalState の push 失敗警告に git stderr が含まれる
// ---------------------------------------------------------------------------

describe("TC-011 (should): commitFinalState push failure warning includes git stderr", () => {
  it(
    // TC-011
    "TC-011: stderrWrite for push failure contains git stderr from the final push attempt",
    async () => {
      const CHECKPOINT_OID = "sha-checkpoint-011";
      const PUSH_STDERR = "remote: repository not found";

      // stderrWrite(msg) calls process.stderr.write(maskSensitive(msg) + "\n").
      // Spy on process.stderr.write to capture the output and suppress it.
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      try {
        const { fn: pipelineSpawnFn } = makePipelineSpawnFnFromSequence([
          { exitCode: 0 }, // add state.json
          { exitCode: 0 }, // add events.jsonl
          { exitCode: 0 }, // add usage.json
          { exitCode: 0 }, // add bite-evidence-result.md
          { exitCode: 0 }, // add pr-create-result.md
          { exitCode: 1 }, // diff → staged
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // commit
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (T-04 new: for persistBeforePush)
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-parse HEAD (egress ledger try-block)
          { exitCode: 0, stdout: `${CHECKPOINT_OID}\n` }, // rev-list (via verifyEgressLedger)
          { exitCode: 1, stderr: `${PUSH_STDERR}\n` },    // push fail 1
          { exitCode: 1, stderr: `${PUSH_STDERR}\n` },    // push fail 2 → warning with stderr
        ]);

        // Pass a no-op persistBeforePush to ensure T-04's extra rev-parse is accounted for.
        await commitFinalState({
          cwd: CWD,
          branch: BRANCH,
          slug: SLUG,
          spawnFn: pipelineSpawnFn,
          messageLabel: "checkpoint",
          synthesizedCommits: [],
          persistBeforePush: async () => {}, // no-op: this test targets stderr, not persist
        });

        // TC-011: process.stderr.write must have been called with a message containing
        // git stderr. After T-07: commitFinalState appends push2.stderr.trim() to the
        // push failure warning string.
        const allOutput = stderrSpy.mock.calls
          .map((c) => String(c[0]))
          .join("");
        expect(allOutput).toContain(PUSH_STDERR);
      } finally {
        stderrSpy.mockRestore();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// TC-012 (could): verifyEgressLedger に branch を渡さない場合は空文字でフォールバック
// ---------------------------------------------------------------------------

describe("TC-012 (could): verifyEgressLedger without branch — fallback to empty string", () => {
  it(
    // TC-012
    "TC-012: EGRESS_UNKNOWN_COMMIT error has empty branch when branch is not provided",
    async () => {
      const UNKNOWN_OID = "deadbeef-unknown-012";

      const pipelineSpawnFn: PipelineSpawnFn = async (_cmd, args, _opts) => {
        if (args[0] === "rev-list") {
          return { exitCode: 0, stdout: `${UNKNOWN_OID}\n`, stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      // No branch provided → fallback to empty string in error (existing behaviour).
      // egressUnknownCommitError message contains "for branch ''." when branch is ""
      await expect(
        verifyEgressLedger({
          cwd: CWD,
          ledger: [],
          // branch intentionally omitted
          spawnFn: pipelineSpawnFn,
        }),
      ).rejects.toMatchObject({
        code: "EGRESS_UNKNOWN_COMMIT",
        message: expect.stringContaining("for branch ''"),
      });
    },
  );
});
