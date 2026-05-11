/**
 * Tests for finish orchestrator (1-PR model, integration-level with stubbed spawn+fs).
 *
 * TC-101: legacy /tmp/... request.path → finish succeeds
 * TC-103: archive folder absent → skip archive+commit+push, only merge+markJobArchived
 * TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
 * TC-122: chore/archive-<slug> branch NOT created
 * TC-123: normal success (archive present, CLEAN)
 * TC-124: markJobArchived called AFTER Phase 3 merge (BEFORE Phase 4 cleanup)
 * TC-125: Phase 1 escalation → markJobArchived NOT called
 * TC-126: state.status=archived → "Already archived" no-op
 * TC-WT-FIN-001: worktreePath set → Phase 1 no checkout, Phase 4 worktree remove
 * TC-WT-FIN-002: worktreePath=null → existing checkout flow (managed mode)
 * TC-WT-FIN-003: Phase 4 worktree remove is called
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { runFinishOrchestrator } from "../src/core/finish/orchestrator.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-orch-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await nodefs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobWithPr(
  opts: {
    status?: "awaiting-merge" | "running" | "archived" | "failed";
    requestPath?: string;
    slug?: string | null;
    worktreePath?: string | null;
  } = {},
) {
  const {
    status = "awaiting-merge",
    requestPath = "specrunner/requests/active/test-slug/request.md",
    slug = "test-slug",
    worktreePath = undefined,
  } = opts;

  const state = await createJobState({
    request: { path: requestPath, title: "Test", type: "new-feature", slug },
    repository: { owner: "user", name: "repo" },
  });

  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  const statePath = path.join(jobsDir, `${state.jobId}.json`);
  const raw = JSON.parse(await nodefs.readFile(statePath, "utf-8"));
  raw.status = status;
  raw.pullRequest = { url: "https://github.com/user/repo/pull/42", number: 42, createdAt: "2026-01-01" };
  raw.branch = "feat/test-slug";
  if (worktreePath !== undefined) {
    raw.worktreePath = worktreePath;
  }
  await nodefs.writeFile(statePath, JSON.stringify(raw, null, 2));

  return { jobId: state.jobId, slug: slug ?? "test-slug" };
}

function makeStubFs(opts: { changeFolderExists?: boolean; activeExists?: boolean } = {}): FinishFs {
  const { changeFolderExists = false, activeExists = false } = opts;
  return {
    exists: vi.fn().mockImplementation((p: string) => {
      if (p.includes("active")) return Promise.resolve(activeExists);
      if (p.includes("merged")) return Promise.resolve(false);
      // specs/ dir check → false (skip merge)
      if (p.includes("specs")) return Promise.resolve(false);
      // change folder
      return Promise.resolve(changeFolderExists);
    }),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
  };
}

/**
 * Build a spawn mock for the 1-PR model happy path.
 * prState: "OPEN" (normal) or "MERGED" (resume)
 */
function makeHappyPathSpawn(prState: "OPEN" | "MERGED" = "OPEN"): SpawnFn {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    // which (binary check)
    if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/gh", stderr: "" });

    // gh pr view (phase 0 preflight + check)
    // TC-017: GitHub returns mergeStateStatus=UNKNOWN for MERGED PRs (real behavior).
    // The MERGED bypass in preflight.ts handles this case and returns ok:true immediately.
    if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
      const out = {
        state: prState,
        mergeStateStatus: prState === "MERGED" ? "UNKNOWN" : "CLEAN",
        headRefName: "feat/test-slug",
      };
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(out), stderr: "" });
    }
    // openspec validate
    if (cmd === "openspec" && args[0] === "validate") {
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    }
    // openspec archive
    if (cmd === "openspec" && args[0] === "archive") {
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    }
    // git fetch origin <branch>
    if (cmd === "git" && args[0] === "fetch") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git checkout -B
    if (cmd === "git" && args[0] === "checkout") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git add
    if (cmd === "git" && args[0] === "add") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git mv
    if (cmd === "git" && args[0] === "mv") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git diff --cached --quiet (exit 1 = staged changes present)
    if (cmd === "git" && args[0] === "diff" && args.includes("--cached") && args.includes("--quiet")) {
      return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
    }
    // git commit
    if (cmd === "git" && args[0] === "commit") return Promise.resolve({ exitCode: 0, stdout: "1 file changed", stderr: "" });
    // git branch -D <branch> (Phase 4 branch deletion, best-effort)
    if (cmd === "git" && args[0] === "branch" && args[1] === "-D") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git push origin --delete <branch> (Phase 4 remote branch deletion, best-effort)
    if (cmd === "git" && args[0] === "push" && args[1] === "origin" && args[2] === "--delete") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git push origin <branch>
    if (cmd === "git" && args[0] === "push") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // gh pr merge (feature)
    if (cmd === "gh" && args[1] === "merge") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git pull --ff-only
    if (cmd === "git" && args[0] === "pull") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git rev-parse --abbrev-ref HEAD (worktree detection in Phase 4)
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
      return Promise.resolve({ exitCode: 0, stdout: "main", stderr: "" });
    }
    // git rev-list (unpushed check)
    if (cmd === "git" && args[0] === "rev-list") return Promise.resolve({ exitCode: 0, stdout: "0", stderr: "" });

    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  });
}

// TC-123: Normal success flow — archive present, CLEAN mergeStateStatus
describe("TC-123: 1-PR model normal success flow (archive present, CLEAN)", () => {
  it("runs all 4 phases and exits 0", async () => {
    const { jobId } = await makeJobWithPr();
    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: true, activeExists: true });

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        slug: "test-slug",
        baseBranch: "main",
        flags: { force: false, dryRun: false },
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    // Verify Phase messages were emitted
    expect(messages.some((m) => m.includes("Phase 0"))).toBe(true);
    expect(messages.some((m) => m.includes("Phase 1"))).toBe(true);
    expect(messages.some((m) => m.includes("Phase 2"))).toBe(true);
    expect(messages.some((m) => m.includes("Phase 3"))).toBe(true);
    expect(messages.some((m) => m.includes("Phase 4"))).toBe(true);
  });

  it("TC-122: chore/archive-<slug> branch NOT created", async () => {
    const { jobId } = await makeJobWithPr();
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    await runFinishOrchestrator({
      slug: "test-slug",
      baseBranch: "main",
        flags: {},
      cwd: tempDir,
      spawn,
      fs: stubFs,
    });

    // Assert: no git checkout/push with chore/archive- branch
    const archiveBranchCalls = calls.filter(
      ([cmd, args]) => (cmd === "git" || cmd === "gh") && args.join(" ").includes("chore/archive-"),
    );
    expect(archiveBranchCalls).toHaveLength(0);
    // Assert: no gh pr create
    const prCreateCalls = calls.filter(([cmd, args]) => cmd === "gh" && args[1] === "create");
    expect(prCreateCalls).toHaveLength(0);
  });
});

// TC-126: state.status=archived → "Already archived" no-op
describe("TC-126: state.status=archived → Already archived, no-op", () => {
  it("returns exit 0 with Already archived message", async () => {
    const { jobId } = await makeJobWithPr({ status: "archived" });
    const spawn = makeHappyPathSpawn();
    const stubFs = makeStubFs();

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        slug: "test-slug",
        baseBranch: "main",
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    expect(messages.some((m) => m.toLowerCase().includes("already finished"))).toBe(true);
    // No destructive ops
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const destructiveCalls = calls.filter(([cmd, args]) =>
      (cmd === "git" && ["push", "commit"].includes(args[0] ?? "")) ||
      (cmd === "gh" && args[1] === "merge"),
    );
    expect(destructiveCalls).toHaveLength(0);
  });
});

// TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
describe("TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only", () => {
  it("skips Phase 1-3 and calls markJobArchived", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("MERGED") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs();

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        slug: "test-slug",
        baseBranch: "main",
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    // Phase 1-3 should be skipped
    const archiveCalls = calls.filter(([cmd, a]) => cmd === "openspec" && a[0] === "archive");
    expect(archiveCalls).toHaveLength(0);
    const mergeCalls = calls.filter(([cmd, a]) => cmd === "gh" && a[1] === "merge");
    expect(mergeCalls).toHaveLength(0);
    // Phase 4: git pull should be called
    const pullCalls = calls.filter(([cmd, a]) => cmd === "git" && a[0] === "pull");
    expect(pullCalls.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes("already merged"))).toBe(true);
  });
});

// TC-103: archive folder absent → commit/push skip, only merge+markJobArchived
describe("TC-103: archive folder absent → skip archive steps, merge+archive", () => {
  it("skips openspec archive, git mv, commit, but runs push+merge+Phase4", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    // No archive folder, no active
    const stubFs = makeStubFs({ changeFolderExists: false, activeExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
    // openspec archive NOT called
    const archiveCalls = calls.filter(([c, a]) => c === "openspec" && a[0] === "archive");
    expect(archiveCalls).toHaveLength(0);
    // gh pr merge SHOULD be called (Phase 3)
    const mergeCalls = calls.filter(([c, a]) => c === "gh" && a[1] === "merge");
    expect(mergeCalls.length).toBeGreaterThan(0);
  });
});

// TC-101: legacy /tmp/... request.path → finish succeeds via branch fallback slug
describe("TC-101: legacy /tmp/... request.path → finish succeeds", () => {
  it("getJobSlug uses branch fallback and Phase 0-4 complete", async () => {
    const { jobId } = await makeJobWithPr({
      status: "awaiting-merge",
      requestPath: "/tmp/dogfooding-001-request.md",
      slug: null, // legacy: no slug in state
    });
    // slug derived from branch "feat/test-slug" → "test-slug"
    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
  });
});

// TC-124: markJobArchived called AFTER Phase 3 merge (BEFORE Phase 4 cleanup)
describe("TC-124: markJobArchived called after Phase 3 merge (before Phase 4)", () => {
  it("state is archived before git pull executes", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });

    const callOrder: string[] = [];
    const { loadJobState } = await import("../src/state/store.js");

    const spawn: SpawnFn = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "pull") {
        // At the point git pull is called, state should already be archived
        const stateAtPull = await loadJobState(jobId);
        callOrder.push(`git-pull:status=${stateAtPull.status}`);
      }
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
    expect(callOrder).toContain("git-pull:status=archived");
  });
});

// TC-125: Phase 1 escalation → markJobArchived NOT called
describe("TC-125: Phase 1 escalation → markJobArchived not called", () => {
  it("state.status remains success if Phase 1 fails", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      // binary check OK
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      // phase 0 preflight ok
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN" }),
          stderr: "",
        });
      }
      if (cmd === "openspec" && args[0] === "validate") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "rev-list") return Promise.resolve({ exitCode: 0, stdout: "0", stderr: "" });
      // Phase 1: git fetch fails
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "remote error" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: true });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);

    // State should NOT be archived
    const { loadJobState } = await import("../src/state/store.js");
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("awaiting-merge");
  });
});

// TC-126 variant: status=running → escalation
describe("TC-047 / running job → exit 1", () => {
  it("rejects running job", async () => {
    const { jobId } = await makeJobWithPr({ status: "running" });
    const spawn = makeHappyPathSpawn();
    const stubFs = makeStubFs();

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation.toLowerCase()).toContain("running");
  });
});

// TC-108: --dry-run → no destructive spawns
describe("TC-108: --dry-run → no destructive subprocess spawns", () => {
  it("exits 0, no commits/pushes/merges spawned", async () => {
    const { jobId } = await makeJobWithPr({ status: "awaiting-merge" });
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: true });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: { dryRun: true }, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);

    // Phase 0 now includes git checkout <feature-branch> + restore, which are
    // acceptable in dry-run (temporary and reverted). We guard against Phase 1-4
    // operations only: archive, commit, push, merge, checkout -B (Phase 1 reset),
    // and pull (Phase 4 fast-forward).
    const DESTRUCTIVE = [
      (cmd: string, args: string[]) => cmd === "openspec" && args[0] === "archive",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "commit",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "push",
      (cmd: string, args: string[]) => cmd === "gh" && args[1] === "merge",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "checkout" && args[1] === "-B",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "pull",
    ];
    const destructiveCalls = calls.filter(([cmd, args]) =>
      DESTRUCTIVE.some((fn) => fn(cmd, args)),
    );
    expect(destructiveCalls).toHaveLength(0);
  });
});

// TC-WT-FIN-001: worktreePath set → Phase 1 no checkout, Phase 4 calls worktree remove
describe("TC-WT-FIN-001: worktreePath set → local runtime finish path", () => {
  it("skips checkout in Phase 1, calls worktree remove in Phase 4", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const removeCalls: string[] = [];
    const pruneCalls: string[] = [];
    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockImplementation((p: string) => { removeCalls.push(p); return Promise.resolve(); }),
      prune: vi.fn().mockImplementation((p: string) => { pruneCalls.push(p); return Promise.resolve(); }),
    };

    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        slug: "test-slug",
        baseBranch: "main",
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
        worktreeManagerFn: () => mockManager,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);

    // Phase 1: no git checkout -B (worktree path used instead)
    const checkoutBCalls = calls.filter(([c, a]) => c === "git" && a[0] === "checkout" && a[1] === "-B");
    expect(checkoutBCalls).toHaveLength(0);

    // Phase 1: no git fetch (for feature branch checkout — managed mode only)
    // Note: git fetch may be called for other reasons, but not for feature branch checkout
    const fetchCalls = calls.filter(([c, a]) => c === "git" && a[0] === "fetch" && a.includes("feat/test-slug"));
    expect(fetchCalls).toHaveLength(0);

    // Phase 4: worktree remove was called with the correct path
    expect(removeCalls).toContain(worktreePath);
    expect(pruneCalls).toContain(tempDir);

    // Phase 4: no git checkout main / git pull (main cwd is already clean)
    const pullCalls = calls.filter(([c, a]) => c === "git" && a[0] === "pull");
    expect(pullCalls).toHaveLength(0);
  });
});

// TC-WT-FIN-002: worktreePath=null → managed mode, existing checkout flow
describe("TC-WT-FIN-002: worktreePath=null → managed mode checkout flow", () => {
  it("uses checkoutFeatureBranch in Phase 1 and git pull in Phase 4", async () => {
    const { jobId } = await makeJobWithPr({ worktreePath: null });

    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);

    // Phase 1: git fetch called for feature branch checkout
    const fetchCalls = calls.filter(([c, a]) => c === "git" && a[0] === "fetch");
    expect(fetchCalls.length).toBeGreaterThan(0);

    // Phase 4: git pull --ff-only called (since rev-parse returns "main")
    const pullCalls = calls.filter(([c, a]) => c === "git" && a[0] === "pull");
    expect(pullCalls.length).toBeGreaterThan(0);
  });
});

// TC-FIN-P4-FAIL-001: Phase 4 worktree remove failure → state=archived, exit 0
describe("TC-FIN-P4-FAIL-001: Phase 4 worktree remove failure → state=archived, exit 0", () => {
  it("state is archived even if worktree remove throws", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error("worktree remove failed")),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator({
      slug: "test-slug",
      baseBranch: "main",
      flags: {},
      cwd: tempDir,
      spawn,
      fs: stubFs,
      worktreeManagerFn: () => mockManager,
    });

    expect(result.exitCode).toBe(0);
    const { loadJobState } = await import("../src/state/store.js");
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("archived");
  });
});

// TC-FIN-BD-001: Phase 3 merge command does NOT include --delete-branch
describe("TC-FIN-BD-001: Phase 3 merge command excludes --delete-branch", () => {
  it("gh pr merge args do not contain --delete-branch", async () => {
    const { jobId } = await makeJobWithPr();
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
    const mergeCalls = calls.filter(([c, a]) => c === "gh" && a[0] === "pr" && a[1] === "merge");
    expect(mergeCalls.length).toBe(1);
    expect(mergeCalls[0]![1]).not.toContain("--delete-branch");
  });
});

// TC-FIN-BD-002: Phase 4 calls local + remote branch deletion
describe("TC-FIN-BD-002: Phase 4 branch deletion commands are called", () => {
  it("git branch -D and git push origin --delete are called in Phase 4", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs, worktreeManagerFn: () => mockManager },
    );

    expect(result.exitCode).toBe(0);
    const branchDelCalls = calls.filter(([c, a]) => c === "git" && a[0] === "branch" && a[1] === "-D");
    expect(branchDelCalls.length).toBe(1);
    const remoteBranchDelCalls = calls.filter(([c, a]) => c === "git" && a[0] === "push" && a[2] === "--delete");
    expect(remoteBranchDelCalls.length).toBe(1);
  });
});

// TC-DIRTY-001: DIRTY mergeStateStatus after push → escalation, no merge attempt
describe("TC-DIRTY-001: DIRTY mergeStateStatus after push → escalation without merge", () => {
  it("returns exitCode 1 escalation and does NOT call gh pr merge when DIRTY", async () => {
    const { jobId } = await makeJobWithPr({ worktreePath: null });

    const mergeCalls: string[][] = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "merge") {
        mergeCalls.push([...args]);
      }
      // gh pr view: Phase 0 returns CLEAN; post-push poll returns DIRTY
      if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
        // After push (poll), return DIRTY; otherwise CLEAN
        const isPostPushPoll = args.length === 5 && !args.includes("state");
        if (isPostPushPoll) {
          return Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({ mergeStateStatus: "DIRTY" }),
            stderr: "",
          });
        }
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation).toContain("DIRTY");
    expect(result.escalation).toContain("specrunner finish");
    // merge must NOT have been called
    expect(mergeCalls).toHaveLength(0);
  });
});

// TC-FIN-BD-003: branch deletion failure is best-effort (exit 0)
describe("TC-FIN-BD-003: branch deletion failure does not cause escalation", () => {
  it("exits 0 even when git branch -D and git push --delete both fail", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "branch" && args[1] === "-D") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "error: branch not found" });
      }
      if (cmd === "git" && args[0] === "push" && args[2] === "--delete") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "error: remote ref not found" });
      }
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn;
      return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", baseBranch: "main", flags: {}, cwd: tempDir, spawn, fs: stubFs, worktreeManagerFn: () => mockManager },
    );

    expect(result.exitCode).toBe(0);
  });
});

// TC-WT-FIN-003: Phase 4 worktree remove is called (state already archived before cleanup)
describe("TC-WT-FIN-003: Phase 4 worktree remove is called", () => {
  it("worktree is removed and state.worktreePath set to null after finish", async () => {
    const worktreePath = path.join(tempDir, ".git", "specrunner-worktrees", "test-slug-abcdef12");
    const { jobId } = await makeJobWithPr({ worktreePath });

    const removeOrder: string[] = [];
    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockImplementation(async (p: string) => { removeOrder.push(`remove:${p}`); }),
      prune: vi.fn().mockImplementation(async (p: string) => { removeOrder.push(`prune:${p}`); }),
    };

    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator({
      slug: "test-slug",
      baseBranch: "main",
        flags: {},
      cwd: tempDir,
      spawn,
      fs: stubFs,
      worktreeManagerFn: () => mockManager,
    });

    expect(result.exitCode).toBe(0);

    // Verify worktree was removed
    expect(removeOrder.some((e) => e.startsWith("remove:"))).toBe(true);

    // Verify state has worktreePath=null after finish
    const { loadJobState } = await import("../src/state/store.js");
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("archived");
    expect(finalState.worktreePath).toBeNull();
  });
});
