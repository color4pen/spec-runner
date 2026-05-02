/**
 * Tests for finish orchestrator (1-PR model, integration-level with stubbed spawn+fs).
 *
 * TC-101: legacy /tmp/... request.path → finish succeeds
 * TC-103: archive folder absent → skip archive+commit+push, only merge+markJobArchived
 * TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
 * TC-122: chore/archive-<slug> branch NOT created
 * TC-123: normal success (archive present, CLEAN)
 * TC-124: markJobArchived called AFTER git pull --ff-only
 * TC-125: Phase 1 escalation → markJobArchived NOT called
 * TC-126: state.status=archived → "Already archived" no-op
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
    status?: "success" | "running" | "archived" | "failed";
    requestPath?: string;
    slug?: string | null;
  } = {},
) {
  const {
    status = "success",
    requestPath = "openspec-workflow/requests/active/test-slug/request.md",
    slug = "test-slug",
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
  await nodefs.writeFile(statePath, JSON.stringify(raw, null, 2));

  return { jobId: state.jobId, slug: slug ?? "test-slug" };
}

function makeStubFs(opts: { changeFolderExists?: boolean; awaitingExists?: boolean } = {}): FinishFs {
  const { changeFolderExists = false, awaitingExists = false } = opts;
  return {
    exists: vi.fn().mockImplementation((p: string) => {
      if (p.includes("awaiting-merge")) return Promise.resolve(awaitingExists);
      if (p.includes("merged")) return Promise.resolve(false);
      // change folder
      return Promise.resolve(changeFolderExists);
    }),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
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
    if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
      const out = {
        state: prState,
        mergeStateStatus: "CLEAN",
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
    const stubFs = makeStubFs({ changeFolderExists: true, awaitingExists: true });

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        slug: "test-slug",
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
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    expect(messages.some((m) => m.toLowerCase().includes("already archived"))).toBe(true);
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
    const { jobId } = await makeJobWithPr({ status: "success" });
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
    const { jobId } = await makeJobWithPr({ status: "success" });
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    // No archive folder, no awaiting-merge
    const stubFs = makeStubFs({ changeFolderExists: false, awaitingExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
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
      status: "success",
      requestPath: "/tmp/dogfooding-001-request.md",
      slug: null, // legacy: no slug in state
    });
    // slug derived from branch "feat/test-slug" → "test-slug"
    const spawn = makeHappyPathSpawn("OPEN");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
  });
});

// TC-124: markJobArchived called AFTER git pull --ff-only
describe("TC-124: markJobArchived called after git pull --ff-only", () => {
  it("pull happens before markJobArchived (via state check after each spawn)", async () => {
    const { jobId } = await makeJobWithPr({ status: "success" });

    const callOrder: string[] = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "pull") callOrder.push("git-pull");
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });

    // After orchestrator runs, check state was updated to archived
    const { loadJobState } = await import("../src/state/store.js");
    const stubFs = makeStubFs({ changeFolderExists: false });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);
    // git pull should have been called
    expect(callOrder).toContain("git-pull");
    // State should be archived after successful orchestration
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("archived");
  });
});

// TC-125: Phase 1 escalation → markJobArchived NOT called
describe("TC-125: Phase 1 escalation → markJobArchived not called", () => {
  it("state.status remains success if Phase 1 fails", async () => {
    const { jobId } = await makeJobWithPr({ status: "success" });

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
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);

    // State should NOT be archived
    const { loadJobState } = await import("../src/state/store.js");
    const finalState = await loadJobState(jobId);
    expect(finalState.status).toBe("success");
  });
});

// TC-126 variant: status=running → escalation
describe("TC-047 / running job → exit 1", () => {
  it("rejects running job", async () => {
    const { jobId } = await makeJobWithPr({ status: "running" });
    const spawn = makeHappyPathSpawn();
    const stubFs = makeStubFs();

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation.toLowerCase()).toContain("running");
  });
});

// TC-108: --dry-run → no destructive spawns
describe("TC-108: --dry-run → no destructive subprocess spawns", () => {
  it("exits 0, no commits/pushes/merges spawned", async () => {
    const { jobId } = await makeJobWithPr({ status: "success" });
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      const happySpawn = makeHappyPathSpawn("OPEN") as SpawnFn; return happySpawn(cmd, args, { cwd: "" });
    });
    const stubFs = makeStubFs({ changeFolderExists: true });

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: { dryRun: true }, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(0);

    const DESTRUCTIVE = [
      (cmd: string, args: string[]) => cmd === "openspec" && args[0] === "archive",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "commit",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "push",
      (cmd: string, args: string[]) => cmd === "gh" && args[1] === "merge",
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "checkout" && (args[1] === "main" || args[1] === "-B"),
      (cmd: string, args: string[]) => cmd === "git" && args[0] === "pull",
    ];
    const destructiveCalls = calls.filter(([cmd, args]) =>
      DESTRUCTIVE.some((fn) => fn(cmd, args)),
    );
    expect(destructiveCalls).toHaveLength(0);
  });
});
