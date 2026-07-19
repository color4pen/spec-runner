/**
 * Group 6: Durable anchor — checkpoint push
 *
 * TC-019: Durable anchor が checkpoint で origin へ push される（spec シナリオ）
 * TC-020: branch が null または holder 未確立のとき anchor push がスキップされる
 * TC-021: anchor push 失敗が terminal 遷移を壊さない
 *
 * Source: tasks.md > T-06 / design.md > D3
 *
 * These tests verify LocalRuntime.commitFinalState behavior — after committing
 * the final state, it pushes the evidence anchor to origin via pushEvidenceAnchor.
 * The method signature is: commitFinalState(deps: PipelineDeps, state: JobState).
 */

import { describe, it, expect, vi } from "vitest";
import type { SpawnFn } from "../../../util/spawn.js";
import { LocalRuntime } from "../local.js";
import type { GitHubClient } from "../../port/github-client.js";
import { JournalAnchorHolder } from "../../../store/journal-anchor.js";
import type { PipelineDeps } from "../../types.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CWD = "/tmp/fake-repo";
const BRANCH = "change/my-feature-abc12345";
const SLUG = "my-feature";

/** Create a SpawnFn that records calls and returns specified responses */
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

function makeDeps(cwd = CWD, slug = SLUG): PipelineDeps {
  return { cwd, slug } as unknown as PipelineDeps;
}

function makeAwaitingResumeState(branch: string | null = BRANCH): JobState {
  return {
    version: 2,
    jobId: "anchor-checkpoint-test-001",
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
    step: "implementer",
    status: "awaiting-resume",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// TC-019: Durable anchor pushed at checkpoint (spec scenario)
// ---------------------------------------------------------------------------

describe("TC-019: Durable anchor が checkpoint で origin へ push される（spec シナリオ）", () => {
  it("TC-019: commitFinalState calls pushEvidenceAnchor (git hash-object + update-ref + push) for durable anchor", async () => {
    const holder = new JournalAnchorHolder();
    // Seed holder with known bytes so snapshot() returns a digest
    holder.seed(
      '{"type":"history"}\n',
      JSON.stringify({ version: 2, status: "awaiting-resume" }, null, 2) + "\n",
    );
    const snap = holder.snapshot();
    expect(snap).not.toBeNull();

    // Track all spawn calls
    const { fn: spawnFn, calls: spawnCalls } = makeSpawnFn([
      // commitFinalState internal git calls (add, diff, commit, push for branch)
      { exitCode: 0 }, // git add -A
      { exitCode: 1 }, // git diff --cached --quiet: has changes
      { exitCode: 0 }, // git commit
      { exitCode: 0 }, // git push origin <branch>
      // evidence anchor calls (hash-object, update-ref, push)
      { exitCode: 0, stdout: "bloboid123\n" }, // git hash-object -w --stdin
      { exitCode: 0 },                          // git update-ref refs/specrunner/evidence/...
      { exitCode: 0 },                          // git push origin refs/specrunner/evidence/...:refs/specrunner/evidence/...
    ]);

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    // Call with the correct signature: (deps, state)
    await runtime.commitFinalState(makeDeps(), makeAwaitingResumeState());

    // Should have issued git hash-object (evidence anchor) call
    const hashObjectCall = spawnCalls.find(
      ([cmd, args]) => cmd === "git" && args.includes("hash-object"),
    );
    expect(hashObjectCall).toBeDefined();

    // Should have pushed the evidence ref
    const evidencePushCall = spawnCalls.find(
      ([cmd, args]) =>
        cmd === "git" &&
        args.includes("push") &&
        args.some((a) => a.includes("refs/specrunner/evidence")),
    );
    expect(evidencePushCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-020: branch=null or holder not established → anchor push skipped
// ---------------------------------------------------------------------------

describe("TC-020: branch が null または holder 未確立のとき anchor push がスキップされる", () => {
  it("TC-020-no-branch: null branch in state → no hash-object call", async () => {
    const holder = new JournalAnchorHolder();
    holder.seed('{"type":"history"}\n', '{"version":2}\n');

    const { fn: spawnFn, calls: spawnCalls } = makeSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 0 }, // diff: no changes → no commit
    ]);

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    // state.branch = null → pre-branch state
    const state = makeAwaitingResumeState(null);
    await runtime.commitFinalState(makeDeps(), state);

    // Must NOT call hash-object (anchor push skipped for null branch)
    const hashObjectCall = spawnCalls.find(
      ([cmd, args]) => cmd === "git" && args.includes("hash-object"),
    );
    expect(hashObjectCall).toBeUndefined();
  });

  it("TC-020-no-holder: no journalAnchor option → no hash-object call", async () => {
    const { fn: spawnFn, calls: spawnCalls } = makeSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 0 }, // diff: no changes
    ]);

    // No journalAnchor option passed
    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
    });

    await runtime.commitFinalState(makeDeps(), makeAwaitingResumeState());

    const hashObjectCall = spawnCalls.find(
      ([cmd, args]) => cmd === "git" && args.includes("hash-object"),
    );
    expect(hashObjectCall).toBeUndefined();
  });

  it("TC-020-unestablished: holder with no snapshot → anchor push skipped", async () => {
    const holder = new JournalAnchorHolder();
    // NOT seeded — snapshot() returns null
    expect(holder.snapshot()).toBeNull();

    const { fn: spawnFn, calls: spawnCalls } = makeSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 0 }, // diff: no changes
    ]);

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    await runtime.commitFinalState(makeDeps(), makeAwaitingResumeState());

    const hashObjectCall = spawnCalls.find(
      ([cmd, args]) => cmd === "git" && args.includes("hash-object"),
    );
    expect(hashObjectCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-021: anchor push failure does not break terminal transition
// ---------------------------------------------------------------------------

describe("TC-021: anchor push 失敗が terminal 遷移を壊さない", () => {
  it("TC-021: pushEvidenceAnchor failure → commitFinalState still resolves without throwing", async () => {
    const holder = new JournalAnchorHolder();
    holder.seed('{"type":"history"}\n', '{"version":2,"status":"awaiting-resume"}\n');

    const { fn: spawnFn } = makeSpawnFn([
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // git diff: changes
      { exitCode: 0 }, // git commit
      { exitCode: 0 }, // git push (branch)
      // evidence anchor: hash-object fails
      { exitCode: 1, stderr: "fatal: hash-object failed" },
    ]);

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    // Should not throw even if anchor push operations fail
    await expect(
      runtime.commitFinalState(makeDeps(), makeAwaitingResumeState()),
    ).resolves.toBeUndefined();
  });

  it("TC-021: push ref failure → commitFinalState still resolves", async () => {
    const holder = new JournalAnchorHolder();
    holder.seed('{"type":"history"}\n', '{"version":2}\n');

    const { fn: spawnFn } = makeSpawnFn([
      { exitCode: 0 }, // add
      { exitCode: 1 }, // diff
      { exitCode: 0 }, // commit
      { exitCode: 0 }, // push branch
      { exitCode: 0, stdout: "bloboid\n" }, // hash-object ok
      { exitCode: 0 },                       // update-ref ok
      { exitCode: 128, stderr: "fatal: push failed" }, // push evidence ref FAILS
    ]);

    const runtime = new LocalRuntime({
      cwd: CWD,
      githubClient: {} as GitHubClient,
      spawnFn,
      journalAnchor: holder,
    });

    await expect(
      runtime.commitFinalState(makeDeps(), makeAwaitingResumeState()),
    ).resolves.toBeUndefined();
  });
});
