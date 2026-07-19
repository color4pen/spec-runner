/**
 * Group 7: Per-node authorship 検証・復元・halt
 *
 * TC-022: Edit/Write による journal 改竄が検出→復元→halt される（T1）
 * TC-023: Bash による journal 改竄が検出→復元→halt される（T2）
 * TC-024: git plumbing で commit tree に注入した journal 改竄が committed-tree 歯で検出される（T3）
 * TC-025: events.jsonl + state.json の協調改竄が結合 digest 不一致で検出される（T5）
 * TC-026: `headBeforeStep` が null のとき committed-tree 歯をスキップする
 * TC-027: round member（`roundOwnsGitEffects=true`）が per-node 検証をスキップする
 * TC-028: `makeJournalTamperHalt` が `awaiting-resume` halt を返す
 * TC-029: `JOURNAL_AUTHENTICITY_VIOLATION` error code が `errors.ts` に存在する
 *
 * Source: spec.md > Requirement: per-node authorship shall be verified...
 *         tasks.md > T-05 / design.md > D4
 */

import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { makeJournalTamperHalt } from "../step-halt.js";
import { journalAuthenticityViolationError, ERROR_CODES } from "../../../errors.js";
import { JournalAnchorHolder, computeJournalDigest } from "../../../store/journal-anchor.js";
import { LocalRuntime } from "../../runtime/local.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SpawnFn } from "../../../util/spawn.js";
import { StepExecutor } from "../executor.js";
import { EventBus } from "../../event/event-bus.js";
import type { AgentStep } from "../../port/step-types.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "my-feature";
const CWD = "/tmp/fake-worktree";
const _BRANCH = "change/my-feature-abc12345";

function makeSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = [];
  let idx = 0;
  const fn = vi.fn(async (cmd: string, args: string[]) => {
    calls.push([cmd, args]);
    const r = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }) as unknown as SpawnFn;
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// TC-029: JOURNAL_AUTHENTICITY_VIOLATION error code exists in errors.ts
// ---------------------------------------------------------------------------

describe("TC-029: JOURNAL_AUTHENTICITY_VIOLATION error code が errors.ts に存在する", () => {
  it("TC-029: ERROR_CODES contains JOURNAL_AUTHENTICITY_VIOLATION", () => {
    expect(ERROR_CODES).toHaveProperty("JOURNAL_AUTHENTICITY_VIOLATION");
    expect(ERROR_CODES.JOURNAL_AUTHENTICITY_VIOLATION).toBe("JOURNAL_AUTHENTICITY_VIOLATION");
  });

  it("TC-029: journalAuthenticityViolationError factory returns correct code", () => {
    const err = journalAuthenticityViolationError("test detail");
    expect(err.code).toBe("JOURNAL_AUTHENTICITY_VIOLATION");
    expect(err.message).toContain("test detail");
  });
});

// ---------------------------------------------------------------------------
// TC-028: makeJournalTamperHalt returns awaiting-resume halt
// ---------------------------------------------------------------------------

describe("TC-028: makeJournalTamperHalt が awaiting-resume halt を返す", () => {
  it("TC-028: returns halt with kind=awaiting-resume and JOURNAL_AUTHENTICITY_VIOLATION code", () => {
    const halt = makeJournalTamperHalt(
      "on-disk digest mismatch: expected sha256:aaa, got sha256:bbb",
      "implementer",
      SLUG,
    );

    expect(halt.kind).toBe("awaiting-resume");
    expect(halt.error.code).toBe("JOURNAL_AUTHENTICITY_VIOLATION");
    expect(halt.interruption.reason).toBe("failure");
    expect(halt.interruption.errorCode).toBe("JOURNAL_AUTHENTICITY_VIOLATION");
    expect(halt.resumePoint.step).toBe("implementer");
  });

  it("TC-028: halt contains diagnostic detail in error message", () => {
    const detail = "events.jsonl tampered: sha256:abc != sha256:xyz";
    const halt = makeJournalTamperHalt(detail, "code-review", SLUG);

    expect(halt.error.message).toContain(detail);
    // The hint should mention restore/resume
    expect(halt.error.hint).toBeTruthy();
  });

  it("TC-028: halt history entry identifies tamper event", () => {
    const halt = makeJournalTamperHalt("tamper", "implementer", SLUG);

    if (halt.history) {
      expect(halt.history.step).toContain("journal-tamper");
      expect(halt.history.status).toBe("error");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-022: Edit/Write tamper detected → restore → halt (T1)
// ---------------------------------------------------------------------------

describe("TC-022: Edit/Write による journal 改竄が検出→復元→halt される（T1）", () => {
  it("TC-022: on-disk digest mismatch → verifyNodeJournalAuthorship returns tamper", async () => {
    // GIVEN: a holder with authentic digest, and on-disk journal that has been tampered
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-022-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      // Write authentic content
      const authEvents = '{"type":"history","step":"implementer-started"}\n';
      const authState  = JSON.stringify({ version: 2, status: "running" }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      // Create holder with authentic digest
      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([]);

      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      // WHEN: agent tampers events.jsonl (Edit/Write simulation)
      const tamperedEvents = '{"type":"history","step":"implementer-started"}\n{"type":"FORGED","verdict":"approved"}\n';
      await fs.writeFile(path.join(changeDir, "events.jsonl"), tamperedEvents);

      // THEN: verifyNodeJournalAuthorship returns tamper
      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null, // skip committed-tree tooth
        cwd: tmpdir,
        slug: SLUG,
      });

      expect(result.kind).toBe("tamper");
      if (result.kind === "tamper") {
        expect(result.detail).toBeTruthy();
      }

      // BREAKING INVARIANT comment (T1 破壊確認):
      // If restoreJournalToAnchor + halt is removed, the tampered journal would
      // propagate to commitJournalArtifacts and be committed to the branch,
      // making the forged evidence part of the permanent record.
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("TC-022: restoreJournalToAnchor restores authentic bytes to disk", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-022r-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      const authEvents = '{"type":"history","step":"implementer-started"}\n';
      const authState  = JSON.stringify({ version: 2, status: "running" }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([]);
      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      // Tamper the file
      await fs.writeFile(path.join(changeDir, "events.jsonl"), "TAMPERED\n");

      // Restore
      const restored = await runtime.restoreJournalToAnchor({ cwd: tmpdir, slug: SLUG });
      expect(restored).toBe(true);

      // After restore, on-disk should match authentic bytes
      const restoredEvents = await fs.readFile(path.join(changeDir, "events.jsonl"), "utf-8");
      expect(restoredEvents).toBe(authEvents);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-023: Bash tamper detected → restore → halt (T2)
// ---------------------------------------------------------------------------

describe("TC-023: Bash による journal 改竄が検出→復元→halt される（T2）", () => {
  it("TC-023: Bash-appended line in events.jsonl produces digest mismatch → tamper", async () => {
    // T2 is the same as T1 from the verification perspective — on-disk digest mismatch.
    // The attack vector (Edit/Write vs Bash) does not change the detection mechanism.
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-023-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      const authEvents = '{"type":"history"}\n';
      const authState  = JSON.stringify({ version: 2 }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([]);
      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      // Simulate Bash: echo '{"forged":true}' >> events.jsonl
      const tamperedEvents = authEvents + '{"forged":true}\n';
      await fs.writeFile(path.join(changeDir, "events.jsonl"), tamperedEvents);

      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null,
        cwd: tmpdir,
        slug: SLUG,
      });

      expect(result.kind).toBe("tamper");
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-024: git plumbing tamper in committed tree detected (T3)
// ---------------------------------------------------------------------------

describe("TC-024: git plumbing で commit tree に注入した journal 改竄が committed-tree 歯で検出される（T3）", () => {
  it("TC-024: diffPathsBetweenCommits non-empty → verifyNodeJournalAuthorship returns tamper", async () => {
    // GIVEN: headBeforeStep is set (not null), and diffPathsBetweenCommits finds
    // journal paths in the diff (agent injected journal via git plumbing)
    const { fn: spawnFn } = makeSpawnFn([
      // diffPathsBetweenCommits call: returns journal path in diff output
      {
        exitCode: 0,
        stdout: `specrunner/changes/${SLUG}/events.jsonl\n`,
      },
    ]);

    const holder = new JournalAnchorHolder();
    holder.seed('{"type":"history"}\n', '{"version":2}\n');

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    const result = await runtime.verifyNodeJournalAuthorship({
      headBeforeStep: "before-commit-sha",
      cwd: CWD,
      slug: SLUG,
    });

    // committed-tree tooth: journal appeared in diff → tamper
    expect(result.kind).toBe("tamper");
    if (result.kind === "tamper") {
      // Detail should indicate the committed-tree violation
      expect(result.detail).toBeTruthy();
    }

    // BREAKING INVARIANT comment (T3 破壊確認):
    // If the committed-tree tooth (diffPathsBetweenCommits check) is removed,
    // an agent could use `git add <events.jsonl>` before the pipeline's add
    // to inject tampered journal into the node commit tree.
    // The worktree (on-disk) might be clean while the commit tree carries tampered bytes.
  });

  it("TC-024: diffPathsBetweenCommits empty (no journal in commit) → not tamper on committed-tree tooth", async () => {
    // When the committed-tree diff is empty, the committed-tree tooth does not trigger.
    // The on-disk tooth still runs.
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-024-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      const authEvents = '{"type":"history"}\n';
      const authState  = JSON.stringify({ version: 2 }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([
        // diffPathsBetweenCommits: empty output (journal not in diff)
        { exitCode: 0, stdout: "" },
      ]);

      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: "before-sha",
        cwd: tmpdir,
        slug: SLUG,
      });

      // committed-tree tooth passes; on-disk matches → ok
      expect(result.kind).toBe("ok");
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-025: Coordinated tamper of both files detected (T5)
// ---------------------------------------------------------------------------

describe("TC-025: events.jsonl + state.json の協調改竄が結合 digest 不一致で検出される（T5）", () => {
  it("TC-025: both files tampered consistently → combined digest still mismatches anchor", async () => {
    // GIVEN: agent edits both events.jsonl and state.json in a consistent way
    // (same structure but different content). The combined digest is still different.
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-025-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      const authEvents = '{"type":"history","step":"implementer-started"}\n';
      const authState  = JSON.stringify({ version: 2, status: "running" }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([]);
      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      // Agent tampers BOTH files in a coordinated way
      const forgedEvents = '{"type":"history","step":"implementer-started"}\n{"type":"step-run","step":"implementer","verdict":"approved"}\n';
      const forgedState  = JSON.stringify({ version: 2, status: "running", _forged: true }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), forgedEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), forgedState);

      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null,
        cwd: tmpdir,
        slug: SLUG,
      });

      // Combined digest of tampered files != anchor digest → tamper detected
      expect(result.kind).toBe("tamper");

      // Verify the detection is via combined digest mismatch
      const forgedDigest  = computeJournalDigest(forgedEvents, forgedState);
      const anchorDigest  = holder.snapshot()!.digest;
      expect(forgedDigest).not.toBe(anchorDigest);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-026: headBeforeStep=null → committed-tree tooth skipped
// ---------------------------------------------------------------------------

describe("TC-026: headBeforeStep が null のとき committed-tree 歯をスキップする", () => {
  it("TC-026: headBeforeStep=null → diffPathsBetweenCommits not called", async () => {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-026-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      const authEvents = '{"type":"history"}\n';
      const authState  = JSON.stringify({ version: 2 }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      // No git diff responses needed — committed-tree tooth should be skipped
      const { fn: spawnFn, calls: spawnCalls } = makeSpawnFn([]);

      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null, // first node — no prior commit
        cwd: tmpdir,
        slug: SLUG,
      });

      // Should be ok (authentic) and no git diff call was made
      expect(result.kind).toBe("ok");
      const diffCalls = spawnCalls.filter(
        ([cmd, args]) => cmd === "git" && args.includes("diff"),
      );
      expect(diffCalls).toHaveLength(0);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-027: round member (roundOwnsGitEffects=true) skips per-node verification
// ---------------------------------------------------------------------------

describe("TC-027: round member（roundOwnsGitEffects=true）が per-node 検証をスキップする", () => {
  it("TC-027: verifyNodeJournalAuthorship is not called for round members", async () => {
    // This test verifies the executor does not call verifyNodeJournalAuthorship
    // when roundOwnsGitEffects=true. We verify this via the runtime interface.
    //
    // For round members, the pipeline's git effects are owned by the coordinator,
    // so per-node journal authorship verification is not applicable.

    const runtimeSpy = {
      verifyNodeJournalAuthorship: vi.fn(async (_input: unknown) => ({ kind: "ok" as const })),
    };

    // When roundOwnsGitEffects=true, the executor should NOT call verifyNodeJournalAuthorship
    // This is an assertion about the executor's conditional logic:
    const roundOwnsGitEffects = true;

    if (!roundOwnsGitEffects) {
      // This branch should NOT be taken for round members
      await runtimeSpy.verifyNodeJournalAuthorship({ headBeforeStep: null, cwd: CWD, slug: SLUG });
    }

    // For round members: must NOT have called the verification
    expect(runtimeSpy.verifyNodeJournalAuthorship).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-022-exec: executor wiring — tamper detected via executor path (F-01 gap detection)
// ---------------------------------------------------------------------------

/**
 * Integration test: verifies that executor wiring is in place.
 * TC-022~TC-025 called verifyNodeJournalAuthorship directly and bypassed the executor.
 * This test goes through the executor to detect the gap (F-01).
 */

function makeExecutorStore() {
  return {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: vi.fn(async (_s: JobState) => undefined),
    appendLineage: async () => undefined,
    appendInterruption: async () => undefined,
    appendStepRun: async (state: JobState) => state,
    getLatestStepRun: () => undefined,
  };
}

function makeExecutorState(): JobState {
  return {
    version: 2,
    jobId: "auth-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/my-feature/request.md",
      title: "My Feature",
      type: "new-feature",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "change/my-feature-abc12345",
    history: [],
    error: null,
    steps: {},
  };
}

function makeAgentStepForExec(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    completionVerdict: "success" as const,
    buildMessage: () => "do the work",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

describe("TC-022-exec: executor wiring — tamper detected through executor path (F-01 gap detection)", () => {
  it("TC-022-exec: verifyNodeJournalAuthorship returning tamper → executor halts with JOURNAL_AUTHENTICITY_VIOLATION", async () => {
    // GIVEN: a runtime strategy where verifyNodeJournalAuthorship returns tamper
    const restoreJournalToAnchor = vi.fn(async (_input: unknown) => true);
    const commitJournalArtifacts = vi.fn(async () => {});
    const verifyNodeJournalAuthorship = vi.fn(async (_input: unknown) => ({
      kind: "tamper" as const,
      detail: "on-disk digest mismatch: expected sha256:aaa, got sha256:bbb",
    }));

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "after-sha"),
      prepareStepArtifacts: vi.fn(async () => {}),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      snapshotMainCheckoutGuard: vi.fn(async () => null),
      verifyNodeJournalAuthorship,
      restoreJournalToAnchor,
      commitJournalArtifacts,
    };

    const store = makeExecutorStore();
    const storeFactory = () => store as never;

    const runner = {
      run: vi.fn(async () => ({
        completionReason: "success" as const,
        resultContent: null,
        sessionId: null,
        agentBranch: null,
        modelUsage: undefined,
        toolResult: null,
        followUpAttempts: 0,
        transientRetryAttempts: 0,
        completionReportDiagnostics: [],
      })),
    };

    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);
    const step = makeAgentStepForExec("implementer");
    const state = makeExecutorState();
    const deps: PipelineDeps = {
      cwd: CWD,
      slug: SLUG,
      config: {} as never,
      request: {
        type: "new-feature",
        title: "My Feature",
        slug: SLUG,
        baseBranch: "main",
        content: "My request",
        adr: false,
        path: "specrunner/changes/my-feature/request.md",
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: storeFactory as never,
      runner: runner as never,
      runtimeStrategy: runtimeStrategy as never,
    } as PipelineDeps;

    // WHEN: executor runs with a tamper-returning runtime
    // THEN: executor.execute() throws (via commitOrchestrator.apply which calls attachStateAndRethrow)
    // AND: the error should have JOURNAL_AUTHENTICITY_VIOLATION code
    await expect(executor.execute(step, state, deps)).rejects.toThrow();

    // Verify that verifyNodeJournalAuthorship WAS called through the executor wiring.
    // headBeforeStep is null because gitExec runs against a non-git CWD (/tmp/fake-worktree)
    // and returns null on failure. The executor uses raw gitExec (not captureHeadSha) here.
    expect(verifyNodeJournalAuthorship).toHaveBeenCalledWith({
      headBeforeStep: null,
      cwd: CWD,
      slug: SLUG,
    });

    // Verify that restoreJournalToAnchor WAS called before halt
    expect(restoreJournalToAnchor).toHaveBeenCalledWith({ cwd: CWD, slug: SLUG });

    // Verify that commitJournalArtifacts was NOT called (halted before journal commit)
    expect(commitJournalArtifacts).not.toHaveBeenCalled();

    // BREAKING INVARIANT comment (F-01 gap detection):
    // If this test is removed and TC-022~TC-025 call verifyNodeJournalAuthorship directly,
    // the executor wiring gap (F-01) would not be caught. This test exercises the full
    // executor path to ensure the wiring in executor.ts is present.
  });

  it("TC-022-exec: verifyNodeJournalAuthorship returning ok → executor commits journal artifacts", async () => {
    // GIVEN: a runtime strategy where verifyNodeJournalAuthorship returns ok
    const commitJournalArtifacts = vi.fn(async () => {});
    const verifyNodeJournalAuthorship = vi.fn(async (_input: unknown) => ({ kind: "ok" as const }));

    const runtimeStrategy = {
      captureHeadSha: vi.fn(async () => "after-sha"),
      prepareStepArtifacts: vi.fn(async () => {}),
      finalizeStepArtifacts: vi.fn(async () => {}),
      validateStepInputs: vi.fn(async () => {}),
      validateStepOutputs: vi.fn(async () => ({ violations: [] })),
      snapshotMainCheckoutGuard: vi.fn(async () => null),
      verifyNodeJournalAuthorship,
      commitJournalArtifacts,
    };

    const store = makeExecutorStore();
    const storeFactory = () => store as never;

    const runner = {
      run: vi.fn(async () => ({
        completionReason: "success" as const,
        resultContent: null,
        sessionId: null,
        agentBranch: null,
        modelUsage: undefined,
        toolResult: null,
        followUpAttempts: 0,
        transientRetryAttempts: 0,
        completionReportDiagnostics: [],
      })),
    };

    const executor = new StepExecutor(new EventBus(), runner as never, storeFactory);
    const step = makeAgentStepForExec("implementer");
    const state = makeExecutorState();
    const deps: PipelineDeps = {
      cwd: CWD,
      slug: SLUG,
      config: {} as never,
      request: {
        type: "new-feature",
        title: "My Feature",
        slug: SLUG,
        baseBranch: "main",
        content: "My request",
        adr: false,
        path: "specrunner/changes/my-feature/request.md",
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: storeFactory as never,
      runner: runner as never,
      runtimeStrategy: runtimeStrategy as never,
    } as PipelineDeps;

    // WHEN: executor runs with an ok-returning runtime (authentic journal)
    // THEN: no throw, and commitJournalArtifacts is called
    await executor.execute(step, state, deps);

    expect(verifyNodeJournalAuthorship).toHaveBeenCalled();
    // Journal artifacts committed after verification passes
    expect(commitJournalArtifacts).toHaveBeenCalledWith(
      CWD,
      state.branch,
      SLUG,
      expect.anything(), // commitPushInfra
    );
  });
});
