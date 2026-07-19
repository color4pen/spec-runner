/**
 * Group 10: Fail-closed・false-positive 防止・backward-compat
 *
 * TC-039: 継続実行・意図的 resume・attach の正常系で halt が発生しない（T6）
 * TC-040: Sequential per-node commit が authorship 分離を固定する（T7）
 * TC-041: 既存テスト群が authenticity 追加を除き無変更 green（T8）
 *
 * Source: spec.md > Requirement: verification shall be fail-closed and shall not false-positive
 *         spec.md > Requirement: existing pipeline / commit-push / resume / attach / archive behavior shall be preserved
 *         tasks.md > T-09 / design.md > D4 + D7
 */

import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { pipelineManagedPaths } from "../../pipeline/round-git-scope.js";
import { commitAndPush, commitJournalArtifacts } from "../commit-push.js";
import { EventBus } from "../../event/event-bus.js";
import type { SpawnFn as GitExecSpawnFn } from "../../../util/git-exec.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { CommitPushInfra } from "../commit-push.js";
import type { AgentStep } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import { JournalAnchorHolder, computeJournalDigest } from "../../../store/journal-anchor.js";
import { LocalRuntime } from "../../runtime/local.js";
import type { GitHubClient } from "../../port/github-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "my-feature";
const CWD = "/tmp/fake-worktree";
const BRANCH = "change/my-feature-abc12345";

function makeGitExecSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: GitExecSpawnFn; calls: string[][] } {
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

function makeInfra(fn: GitExecSpawnFn): CommitPushInfra {
  return {
    spawnFn: fn,
    sleepFn: vi.fn(async () => {}),
    events: new EventBus(),
  };
}

function makeAgentStep(name = "implementer"): AgentStep {
  return {
    kind: "agent",
    name,
    agent: { id: `${name}-agent` } as never,
    completionVerdict: "success",
    buildMessage: () => `${name} message`,
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "success", findingsPath: null }),
  };
}

function makeState(): JobState {
  return {
    version: 2,
    jobId: "compat-job-001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${SLUG}/request.md`,
      title: "Compat test",
      type: "bug-fix",
      slug: SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: BRANCH,
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// TC-040: Sequential per-node commit authorship separation (T7)
// ---------------------------------------------------------------------------

describe("TC-040: Sequential per-node commit が authorship 分離を固定する（T7）", () => {
  it("TC-040: commitAndPush excludes events.jsonl, state.json, usage.json from git add", async () => {
    const { fn, calls } = makeGitExecSpawnFn([
      { exitCode: 0 },                      // git add
      { exitCode: 1 },                      // git diff: has changes
      { exitCode: 0, stdout: "sha\n" },     // git commit
      { exitCode: 0 },                      // git push
    ]);

    const step = makeAgentStep();
    const state = makeState();
    const deps = {
      cwd: CWD,
      slug: SLUG,
      runtimeStrategy: null,
      roundOwnsGitEffects: false,
    } as unknown as PipelineDeps;

    await commitAndPush(step, state, deps, null, makeInfra(fn));

    const addCall = calls.find((c) => c[0] === "add")!;
    const managed = pipelineManagedPaths(SLUG);

    // All three pipeline-managed paths must be excluded from agent code commit
    for (const p of managed) {
      expect(addCall.join(" ")).toContain(`:(exclude)${p}`);
    }

    // Verify the three specific paths: events.jsonl, state.json, usage.json
    const eventsPath = `specrunner/changes/${SLUG}/events.jsonl`;
    const statePath  = `specrunner/changes/${SLUG}/state.json`;
    const usagePath  = `specrunner/changes/${SLUG}/usage.json`;

    expect(addCall.join(" ")).toContain(`:(exclude)${eventsPath}`);
    expect(addCall.join(" ")).toContain(`:(exclude)${statePath}`);
    expect(addCall.join(" ")).toContain(`:(exclude)${usagePath}`);
  });

  it("TC-040: commitJournalArtifacts stages only pipeline-managed paths (journal commit)", async () => {
    const { fn, calls } = makeGitExecSpawnFn([
      { exitCode: 0 },                      // git add
      { exitCode: 1 },                      // git diff: changes
      { exitCode: 0, stdout: "sha\n" },     // git commit
      { exitCode: 0 },                      // git push
    ]);

    await commitJournalArtifacts(CWD, BRANCH, SLUG, makeInfra(fn));

    const addCall = calls.find((c) => c[0] === "add")!;
    const managed = pipelineManagedPaths(SLUG);

    // Journal commit must stage exactly the pipeline-managed paths
    for (const p of managed) {
      expect(addCall).toContain(p);
    }

    // Must NOT use git add -A (must be pathspec-limited)
    expect(addCall).not.toEqual(["add", "-A"]);
    expect(addCall[2]).toBe("--"); // pathspec separator
  });

  it("TC-040: agent code commit message uses step name (not 'journal')", async () => {
    const { fn, calls } = makeGitExecSpawnFn([
      { exitCode: 0 },
      { exitCode: 1 },
      { exitCode: 0, stdout: "sha\n" },
      { exitCode: 0 },
    ]);

    const step = makeAgentStep("implementer");
    const state = makeState();
    const deps = { cwd: CWD, slug: SLUG, runtimeStrategy: null, roundOwnsGitEffects: false } as unknown as PipelineDeps;

    await commitAndPush(step, state, deps, null, makeInfra(fn));

    const commitCall = calls.find((c) => c[0] === "commit")!;
    const msgIdx = commitCall.indexOf("-m");
    const msg = commitCall[msgIdx + 1]!;

    // Agent code commit uses "step: slug" format
    expect(msg).toBe(`implementer: ${SLUG}`);
    // NOT "journal: <slug>"
    expect(msg).not.toMatch(/^journal:/);
  });
});

// ---------------------------------------------------------------------------
// TC-039: No false-positive halt for legitimate pipeline writes (T6)
// ---------------------------------------------------------------------------

describe("TC-039: 継続実行・意図的 resume・attach の正常系で halt が発生しない（T6）", () => {
  it("TC-039a: continuous execution — verifyNodeJournalAuthorship returns ok when pipeline writes match anchor", async () => {
    // GIVEN: pipeline performed a legitimate persist (begin), holder matches on-disk
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-039a-"));
    try {
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      // Simulate what happens when pipeline persists step-started (begin)
      const authEvents = '{"type":"history","step":"implementer-started","ts":"2026-01-01T00:00:00.000Z"}\n';
      const authState  = JSON.stringify({ version: 2, status: "running", step: "implementer" }, null, 2) + "\n";

      await fs.writeFile(path.join(changeDir, "events.jsonl"), authEvents);
      await fs.writeFile(path.join(changeDir, "state.json"), authState);

      // Holder tracks the same bytes (as if JobJournal.persist was called)
      const holder = new JournalAnchorHolder();
      holder.seed(authEvents, authState);

      const { fn: spawnFn } = makeSpawnFn([]);
      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      // WHEN: verifyNodeJournalAuthorship runs (no tampering occurred)
      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null, // skip committed-tree tooth
        cwd: tmpdir,
        slug: SLUG,
      });

      // THEN: no halt — legitimate pipeline write passes
      expect(result.kind).toBe("ok");
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("TC-039b: no anchor yet (new job first write) → verifyNodeJournalAuthorship returns skip", async () => {
    // GIVEN: brand new job, no journal files on disk yet, no holder snapshot
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-039b-"));
    try {
      // changeDir exists but no journal files
      const changeDir = path.join(tmpdir, "specrunner", "changes", SLUG);
      await fs.mkdir(changeDir, { recursive: true });

      // Holder not seeded (no prior journal)
      const holder = new JournalAnchorHolder();
      expect(holder.snapshot()).toBeNull();

      const { fn: spawnFn } = makeSpawnFn([]);
      const runtime = new LocalRuntime({
        cwd: tmpdir,
        githubClient: {} as GitHubClient,
        spawnFn,
        journalAnchor: holder,
      });

      const result = await runtime.verifyNodeJournalAuthorship({
        headBeforeStep: null,
        cwd: tmpdir,
        slug: SLUG,
      });

      // No anchor at all AND no on-disk journal → skip (baseline absent)
      expect(result.kind).toMatch(/^(ok|skip)$/);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-041: Existing test suite stays green (T8 — behavioral preservation)
// ---------------------------------------------------------------------------

describe("TC-041: 既存テスト群が authenticity 追加を除き無変更 green（T8）", () => {
  it("TC-041: commitAndPush preserves agent self-commit (HEAD-advance) detection", async () => {
    // Verify that the existing behavior (detect agent self-commit via HEAD advance)
    // is preserved after the pathspec-exclusion change.
    const HEAD_BEFORE = "before-sha-001";
    const HEAD_AFTER  = "after-sha-002"; // Agent advanced HEAD

    const { fn, calls } = makeGitExecSpawnFn([
      { exitCode: 0 },                       // git add (no staged after exclude)
      { exitCode: 0 },                       // git diff: no staged changes
      { exitCode: 0, stdout: HEAD_AFTER + "\n" }, // git rev-parse HEAD
      { exitCode: 0 },                       // git push (push-only path)
    ]);

    const step = makeAgentStep();
    const state = makeState();
    const deps = { cwd: CWD, slug: SLUG, runtimeStrategy: null, roundOwnsGitEffects: false } as unknown as PipelineDeps;

    // Should not throw — agent self-commit path still works
    await expect(
      commitAndPush(step, state, deps, HEAD_BEFORE, makeInfra(fn)),
    ).resolves.toBeUndefined();

    // Should have called push (push-only path for agent self-commit)
    const pushCall = calls.find((c) => c[0] === "push");
    expect(pushCall).toBeDefined();
  });

  it("TC-041: commitAndPush with no changes and no HEAD advance → silent no-op (preserved)", async () => {
    const HEAD = "same-sha";

    const { fn, calls } = makeGitExecSpawnFn([
      { exitCode: 0 },                     // git add
      { exitCode: 0 },                     // git diff: no staged changes
      { exitCode: 0, stdout: HEAD + "\n" }, // git rev-parse HEAD (same as before)
    ]);

    const step = makeAgentStep();
    const state = makeState();
    const deps = { cwd: CWD, slug: SLUG, runtimeStrategy: null, roundOwnsGitEffects: false } as unknown as PipelineDeps;

    await expect(
      commitAndPush(step, state, deps, HEAD, makeInfra(fn)),
    ).resolves.toBeUndefined();

    // No push when HEAD did not advance
    const pushCall = calls.find((c) => c[0] === "push");
    expect(pushCall).toBeUndefined();
  });

  it("TC-041: pipelineManagedPaths returns the three expected paths", () => {
    const managed = pipelineManagedPaths(SLUG);

    expect(managed).toHaveLength(3);
    expect(managed).toContain(`specrunner/changes/${SLUG}/state.json`);
    expect(managed).toContain(`specrunner/changes/${SLUG}/events.jsonl`);
    expect(managed).toContain(`specrunner/changes/${SLUG}/usage.json`);
  });

  it("TC-041: JournalAnchorHolder not injected → JobJournal behaves as before (no regression)", async () => {
    // Verify backward compat: existing code that constructs JobJournal without
    // a holder continues to work identically (no anchor tracking, no side effects).
    const { JobJournal } = await import("../../../store/job-journal.js");
    const { JobLocationResolver } = await import("../../../store/job-location-resolver.js");

    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-041-"));
    try {
      const resolver = new JobLocationResolver("job-001", "/fake", { changeDir: tmpdir });
      const journal = new JobJournal(resolver); // no holder

      const state: JobState = {
        version: 2,
        jobId: "compat-back-001",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        request: { path: "specrunner/changes/x/request.md", title: "x", type: "bug-fix", slug: "x" },
        repository: { owner: "o", name: "r" },
        session: null,
        step: "implementer",
        status: "running",
        branch: "change/x-abc",
        history: [],
        error: null,
        steps: {},
      };

      await expect(journal.persist(state)).resolves.toBeUndefined();

      const stateJson = await fs.readFile(path.join(tmpdir, "state.json"), "utf-8");
      expect(JSON.parse(stateJson).version).toBe(2);
    } finally {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
