/**
 * Adversarial test fixtures for finish-redesign.
 *
 * TC-104: mergeStateStatus=UNKNOWN → CLEAN after 1 retry → success
 * TC-105: gh pr view auth failure → escalation, merge not executed
 * TC-107: openspec validate fail → escalation, merge not executed
 * TC-119: UNKNOWN × 3 → escalation after all retries
 * TC-120: pullRequest.number absent → escalation
 * TC-121: gh binary missing → escalation
 * TC-129: --dry-run + Phase 0 fail → exit 1, no destructive ops
 * TC-139: escalation format — 4 required elements
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState } from "../src/state/store.js";
import { runFinishOrchestrator } from "../src/core/finish/orchestrator.js";
import { runPreflight } from "../src/core/finish/preflight.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";
import type { ResolvedTarget } from "../src/core/finish/types.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-finish-adv-"));
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

async function makeJobWithPr(opts: {
  status?: "success" | "running" | "archived";
  slug?: string;
  requestPath?: string;
} = {}) {
  const { status = "success", slug = "test-slug", requestPath } = opts;
  const state = await createJobState({
    request: {
      path: requestPath ?? `specrunner/requests/active/${slug}/request.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "user", name: "repo" },
  });

  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  const statePath = path.join(jobsDir, `${state.jobId}.json`);
  const raw = JSON.parse(await nodefs.readFile(statePath, "utf-8"));
  raw.status = status;
  raw.pullRequest = { url: "https://github.com/user/repo/pull/42", number: 42, createdAt: "2026-01-01" };
  raw.branch = `feat/${slug}`;
  await nodefs.writeFile(statePath, JSON.stringify(raw, null, 2));
  return { jobId: state.jobId, slug };
}

function makeStubFs(changeFolderExists = false): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(changeFolderExists),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTarget(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  return {
    jobId: "test-job-id",
    prNumber: 42,
    prUrl: "https://github.com/user/repo/pull/42",
    branch: "feat/test-slug",
    slug: "test-slug",
    ...overrides,
  };
}

// TC-104: UNKNOWN → CLEAN after 1 retry
describe("TC-104: mergeStateStatus UNKNOWN → CLEAN after 1 retry → success", () => {
  it("succeeds on second attempt and emits retry message", async () => {
    let callCount = 0;
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "openspec" && args[0] === "validate") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "rev-list") return Promise.resolve({ exitCode: 0, stdout: "0", stderr: "" });
      if (cmd === "gh" && args[1] === "view") {
        callCount++;
        const mergeState = callCount === 1 ? "UNKNOWN" : "CLEAN";
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: mergeState }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const target = makeTarget();
    const fs = makeStubFs(false);

    const result = await runPreflight({
      target,
      cwd: tempDir,
      spawn,
      fs,
      dryRun: false,
      sleepFn: () => Promise.resolve(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prViewData.mergeStateStatus).toBe("CLEAN");
    // stdout.write should have been called with retry message
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(stdoutCalls).toContain("Retrying check 4");
  });
});

// TC-105: gh pr view auth failure → escalation
describe("TC-105: gh pr view auth failure → escalation, merge not executed", () => {
  it("escalates and merge is not called", async () => {
    const { jobId, slug } = await makeJobWithPr();
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "authentication required" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      { slug, flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    // merge should not be called
    const mergeCalls = calls.filter(([c, a]) => c === "gh" && a[1] === "merge");
    expect(mergeCalls).toHaveLength(0);
  });
});

// TC-107: openspec validate fail → escalation, merge not executed
describe("TC-107: openspec validate fail → escalation", () => {
  it("escalates when openspec validate exits non-zero", async () => {
    const { jobId, slug } = await makeJobWithPr();
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN" }),
          stderr: "",
        });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "validation failed: header not found" });
      }
      if (cmd === "git" && args[0] === "rev-list") return Promise.resolve({ exitCode: 0, stdout: "0", stderr: "" });
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    // Change folder exists so validate runs
    const stubFs: FinishFs = {
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.includes("openspec/changes")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue([]),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runFinishOrchestrator(
      { slug, flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation).toContain("Phase 0 check 6");
    // merge should not be called
    const mergeCalls = calls.filter(([c, a]) => c === "gh" && a[1] === "merge");
    expect(mergeCalls).toHaveLength(0);
  });
});

// TC-119: UNKNOWN × 3 → escalation
describe("TC-119: mergeStateStatus UNKNOWN × 3 → escalation after all retries", () => {
  it("escalates after 3 UNKNOWN results", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "openspec" && args[0] === "validate") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      if (cmd === "git" && args[0] === "rev-list") return Promise.resolve({ exitCode: 0, stdout: "0", stderr: "" });
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "UNKNOWN" }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const target = makeTarget();
    const fs = makeStubFs(false);

    const result = await runPreflight({
      target,
      cwd: tempDir,
      spawn,
      fs,
      dryRun: false,
      sleepFn: () => Promise.resolve(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("Phase 0 check 4");
    expect(result.escalation).toContain("UNKNOWN");
  });
});

// TC-120: pullRequest.number absent → escalation
describe("TC-120: pullRequest.number absent → escalation", () => {
  it("escalates with pr-create message when pullRequest is missing", async () => {
    // Create job WITHOUT pullRequest
    const state = await createJobState({
      request: { path: "specrunner/requests/active/test-slug/request.md", title: "T", type: "new-feature", slug: "test-slug" },
      repository: { owner: "u", name: "r" },
    });

    const spawn: SpawnFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      { slug: "test-slug", flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    // Should fail with arg error (exit 2) because pr-create not done
    expect(result.exitCode).toBe(2);
    if (result.exitCode !== 2) return;
    expect(result.message.toLowerCase()).toContain("missing pullrequest or branch");
  });
});

// TC-121: gh binary missing → escalation
describe("TC-121: gh binary missing → escalation", () => {
  it("escalates with binary not found message", async () => {
    const { jobId, slug } = await makeJobWithPr();
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which" && args[0] === "gh") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      { slug, flags: {}, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    if (result.exitCode !== 1) return;
    expect(result.escalation.toLowerCase()).toContain("binary not found");
    expect(result.escalation.toLowerCase()).toContain("gh");
  });
});

// TC-129: --dry-run + Phase 0 fail → exit 1, no destructive ops
describe("TC-129: --dry-run + Phase 0 fail → exit 1, no destructive ops", () => {
  it("exits 1 with escalation and zero destructive spawns", async () => {
    const { jobId, slug } = await makeJobWithPr();
    const calls: Array<[string, string[]]> = [];
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, [...args]]);
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      // Simulate gh pr view auth failure
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "auth error" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });
    const stubFs = makeStubFs(false);

    const result = await runFinishOrchestrator(
      { slug, flags: { dryRun: true }, cwd: tempDir, spawn, fs: stubFs },
    );

    expect(result.exitCode).toBe(1);
    // No destructive ops
    const DESTRUCTIVE = [
      (cmd: string, args: string[]) => cmd === "git" && ["commit", "push"].includes(args[0] ?? ""),
      (cmd: string, args: string[]) => cmd === "gh" && args[1] === "merge",
      (cmd: string, args: string[]) => cmd === "openspec" && args[0] === "archive",
    ];
    const destructiveCalls = calls.filter(([cmd, args]) =>
      DESTRUCTIVE.some((fn) => fn(cmd, args)),
    );
    expect(destructiveCalls).toHaveLength(0);
  });
});

// TC-139: escalation format — 4 required elements
describe("TC-139: escalation format has 4 required elements", () => {
  it("escalation message contains failedStep, detectedState, recommendedAction, resumeCommand", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "UNKNOWN" }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const target = makeTarget();
    const fs = makeStubFs(false);

    const result = await runPreflight({
      target,
      cwd: tempDir,
      spawn,
      fs,
      dryRun: false,
      sleepFn: () => Promise.resolve(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const esc = result.escalation;
    // (1) Failed step name
    expect(esc).toContain("Failed Step:");
    expect(esc).toContain("check 4");
    // (2) Detected state
    expect(esc).toContain("Detected State:");
    expect(esc).toContain("UNKNOWN");
    // (3) Recommended action
    expect(esc).toContain("Recommended Action:");
    // (4) Resume command
    expect(esc).toContain("Resume Command:");
    expect(esc).toContain("specrunner finish");
  });
});
