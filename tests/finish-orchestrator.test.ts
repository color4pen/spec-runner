/**
 * Tests for finish orchestrator (integration-level with stubbed spawn+fs).
 *
 * TC-045: OPEN_MERGEABLE full flow completes exit code 0
 * TC-046: MERGED + archive incomplete → resume (skip merge)
 * TC-047: status=archived → "Already finished, nothing to do." exit 0
 * TC-022: CLOSED → escalation with cancel hint
 * TC-031: running → exit 1 with JOB_NOT_FINISHABLE
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { runFinishOrchestrator } from "../src/core/finish/orchestrator.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-orch-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makeJobWithPr(status: "success" | "running" | "archived" | "failed" = "success") {
  const state = await createJobState({
    request: { path: `/openspec-workflow/requests/active/test-slug`, title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });

  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  const statePath = path.join(jobsDir, `${state.jobId}.json`);
  const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
  raw.status = status;
  raw.pullRequest = { url: "https://github.com/user/repo/pull/42", number: 42, createdAt: "2026-01-01" };
  raw.branch = "feat/test-slug";
  await fs.writeFile(statePath, JSON.stringify(raw, null, 2));

  return { jobId: state.jobId };
}

function makeStubFs(exists = true): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(exists),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

function makeHappyPathSpawn(prState: "OPEN_MERGEABLE" | "MERGED" = "OPEN_MERGEABLE"): SpawnFn {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    // gh pr view → return the given PR state
    if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
      const ghOutput = {
        state: prState === "MERGED" ? "MERGED" : "OPEN",
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [],
        headRefName: "feat/test-slug",
      };
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(ghOutput), stderr: "" });
    }
    // gh pr merge (feature)
    if (cmd === "gh" && args[1] === "merge" && args.includes("42")) {
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    }
    // Archive PR idempotency check
    if (cmd === "gh" && args[1] === "list" && args.includes("merged")) {
      return Promise.resolve({ exitCode: 0, stdout: "[]", stderr: "" });
    }
    // git fetch
    if (cmd === "git" && args[0] === "fetch") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git checkout
    if (cmd === "git" && args[0] === "checkout") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git push
    if (cmd === "git" && args[0] === "push") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git mv
    if (cmd === "git" && args[0] === "mv") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git add
    if (cmd === "git" && args[0] === "add") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    // git diff --cached --quiet (exit 1 = staged changes present)
    if (cmd === "git" && args[0] === "diff" && args.includes("--cached") && args.includes("--quiet")) {
      return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
    }
    // git commit
    if (cmd === "git" && args[0] === "commit") return Promise.resolve({ exitCode: 0, stdout: "1 file changed", stderr: "" });
    // gh pr create
    if (cmd === "gh" && args[1] === "create") {
      return Promise.resolve({ exitCode: 0, stdout: "https://github.com/user/repo/pull/99\n", stderr: "" });
    }
    // gh pr merge --auto (archive)
    if (cmd === "gh" && args[1] === "merge" && args.includes("--auto")) {
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    }
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  });
}

// TC-045
describe("TC-045: OPEN_MERGEABLE full flow exits 0", () => {
  it("completes all steps and returns exit code 0", async () => {
    const { jobId } = await makeJobWithPr("success");
    const spawn = makeHappyPathSpawn("OPEN_MERGEABLE");
    const stubFs = makeStubFs(false); // change folder doesn't exist → skip openspec

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: { force: false, cleanupOnly: false },
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
  });

  it("spawn call order: fetch < checkout < mv < diff < commit < push < pr-create < pr-merge-auto < checkout-main", async () => {
    const { jobId } = await makeJobWithPr("success");
    // Use exists=true so openspec archive is NOT skipped, but openspec archive
    // itself is still stubbed (readdir returns [] → --skip-specs path).
    // The spawn mock returns exitCode=0 for openspec and git add.
    const spawn = makeHappyPathSpawn("OPEN_MERGEABLE");
    // Override: change folder exists so archiveOpenspec runs
    const stubFs: FinishFs = {
      exists: vi.fn().mockImplementation((p: string) => {
        // change folder exists, awaiting-merge exists, merged does not
        if (p.includes("awaiting-merge")) return Promise.resolve(true);
        if (p.includes("merged")) return Promise.resolve(false);
        // openspec/changes/<slug> — exists
        return Promise.resolve(true);
      }),
      readdir: vi.fn().mockResolvedValue([]), // no .md files → --skip-specs
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: { force: false, cleanupOnly: false },
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
    );

    expect(result.exitCode).toBe(0);

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const cmdKey = (c: [string, string[]]) => `${c[0]} ${c[1].join(" ")}`;
    const cmdKeys = calls.map(cmdKey);

    const idxFetch = cmdKeys.findIndex((k) => k.startsWith("git fetch origin main"));
    const idxCheckout = cmdKeys.findIndex((k) => k.startsWith("git checkout") && !k.includes("main\n") && !k.includes("checkout main"));
    const idxOpenspec = cmdKeys.findIndex((k) => k.startsWith("openspec archive"));
    const idxGitAdd = cmdKeys.findIndex((k) => k.startsWith("git add openspec/changes/"));
    const idxMv = cmdKeys.findIndex((k) => k.startsWith("git mv"));
    const idxDiff = cmdKeys.findIndex((k) => k.includes("diff --cached --quiet"));
    const idxCommit = cmdKeys.findIndex((k) => k.startsWith("git commit"));
    const idxPush = cmdKeys.findIndex((k) => k.startsWith("git push"));
    const idxPrCreate = cmdKeys.findIndex((k) => k.startsWith("gh pr create"));
    const idxPrMergeAuto = cmdKeys.findIndex((k) => k.startsWith("gh pr merge --auto"));
    // Find the last "git checkout main" (the return-to-main step at success path end)
    const idxCheckoutMain = cmdKeys.reduce((last, k, i) => k === "git checkout main" ? i : last, -1);

    expect(idxFetch).toBeGreaterThanOrEqual(0);
    expect(idxCheckout).toBeGreaterThanOrEqual(0);
    expect(idxOpenspec).toBeGreaterThanOrEqual(0);
    expect(idxGitAdd).toBeGreaterThanOrEqual(0);
    expect(idxMv).toBeGreaterThanOrEqual(0);
    expect(idxDiff).toBeGreaterThanOrEqual(0);
    expect(idxCommit).toBeGreaterThanOrEqual(0);
    expect(idxPush).toBeGreaterThanOrEqual(0);
    expect(idxPrCreate).toBeGreaterThanOrEqual(0);
    expect(idxPrMergeAuto).toBeGreaterThanOrEqual(0);
    expect(idxCheckoutMain).toBeGreaterThanOrEqual(0);

    // Order assertions
    expect(idxFetch).toBeLessThan(idxCheckout);
    expect(idxCheckout).toBeLessThan(idxOpenspec);
    expect(idxOpenspec).toBeLessThan(idxGitAdd);
    expect(idxGitAdd).toBeLessThan(idxMv);
    expect(idxMv).toBeLessThan(idxDiff);
    expect(idxDiff).toBeLessThan(idxCommit);
    expect(idxCommit).toBeLessThan(idxPush);
    expect(idxPush).toBeLessThan(idxPrCreate);
    expect(idxPrCreate).toBeLessThan(idxPrMergeAuto);
    expect(idxPrMergeAuto).toBeLessThan(idxCheckoutMain);
  });
});

// TC-046: MERGED + archive incomplete → skip merge, proceed with archive
describe("TC-046: MERGED feature PR → resume from archive", () => {
  it("skips feature PR merge but runs archive steps", async () => {
    const { jobId } = await makeJobWithPr("success");
    const spawn = makeHappyPathSpawn("MERGED");
    const stubFs = makeStubFs(false);

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: { force: false, cleanupOnly: false },
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    // Merge should be skipped
    expect(messages.some((m) => m.includes("already merged"))).toBe(true);
  });
});

// TC-047
describe("TC-047: status=archived → no-op exit 0", () => {
  it("returns exit 0 with already finished message", async () => {
    const { jobId } = await makeJobWithPr("archived");
    const spawn = makeHappyPathSpawn();
    const stubFs = makeStubFs(false);

    const messages: string[] = [];
    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
      (m) => messages.push(m),
    );

    expect(result.exitCode).toBe(0);
    expect(messages.some((m) => m.includes("Already finished"))).toBe(true);
  });
});

// TC-022
describe("TC-022: CLOSED PR → escalation with cancel hint", () => {
  it("returns exit 1 with escalation containing cancel hint", async () => {
    const { jobId } = await makeJobWithPr("success");
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "CLOSED", mergeStateStatus: "", statusCheckRollup: [] }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation).toContain("CLOSED");
    expect(result.escalation.toLowerCase()).toContain("cancel");
  });
});

// TC-031
describe("TC-031: running job → exit 1 with JOB_NOT_FINISHABLE", () => {
  it("rejects running job with error message", async () => {
    const { jobId } = await makeJobWithPr("running");
    const spawn = makeHappyPathSpawn();
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      {
        jobId,
        flags: {},
        cwd: tempDir,
        spawn,
        fs: stubFs,
      },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation.toLowerCase()).toContain("running");
  });
});
