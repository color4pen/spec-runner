/**
 * Real-git integration tests for the delivery-exclusion contract (#1095, PR review follow-up).
 *
 * TC-INT-1: 実 git — 除外された untracked artifact + 除外された unpushable dirty path が
 *           guarded commit → scoped commit を通して commit されず・halt せず・worktree に残る
 * TC-INT-2: 実 git — 除外パターン非対象の宣言外 dirty path は scoped commit で従来どおり
 *           WRITE_SCOPE_VIOLATION になる（非退行）
 *
 * Each test uses a real local git repository (temp dir). Only `git push` is
 * intercepted (returns exit 0 without a remote). All other git commands run
 * against the real filesystem — staging, commit synthesis, mixed reset, the
 * Layer 2 publishable-path collection (git status / rev-list / diff-tree) and
 * the scoped residual check all execute for real.
 *
 * Destruction confirmation:
 *   TC-INT-1: revert the worktree-exclusion parameter of collectPublishablePaths
 *             (Layer 2) or the residual-check exclusion filter → this TC fails
 *             with UNPUSHABLE_PATH_BLOCKED / WRITE_SCOPE_VIOLATION respectively.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { commitAndPush } from "../../../src/core/step/commit-push.js";
import type { CommitPushInfra } from "../../../src/core/step/commit-push.js";
import type { AgentStep, IoRef } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/git-exec.js";
import { EventBus } from "../../../src/core/event/event-bus.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock pipelineManagedPaths to a controllable set (same shape as the
// write-scope-bypass-closure integration suite).
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../../src/core/step/round-git-scope.js", () => ({
  pipelineManagedPaths: (slug: string) => [
    `specrunner/changes/${slug}/state.json`,
    `specrunner/changes/${slug}/events.jsonl`,
    `specrunner/changes/${slug}/usage.json`,
  ],
}));

// ─────────────────────────────────────────────────────────────────────────────
// Real-git SpawnFn: delegates all commands to real git EXCEPT push.
// ─────────────────────────────────────────────────────────────────────────────

function makeRealGitNoPushSpawnFn(): SpawnFn {
  return (bin: string, args: string[], opts: SpawnOptions): ChildProcess => {
    if (bin === "git" && args[0] === "push") {
      const em = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emAny = em as any;
      emAny.stdout = new EventEmitter();
      emAny.stderr = new EventEmitter();
      emAny.stdin = { write: () => true, end: () => {} };
      setImmediate(() => em.emit("close", 0));
      return em as unknown as ChildProcess;
    }
    return nodeSpawn(bin, args, opts);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUDE_PATTERNS = ["vendor/**", ".github/workflows/**"];

function makeJobState(step: string, branch = "feat/excl-intg"): JobState {
  return {
    version: 1,
    jobId: "excl-intg-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step,
    status: "running",
    branch,
    history: [],
    error: null,
    steps: {},
  };
}

function makeDeps(slug: string, cwd: string): PipelineDeps {
  return {
    storeFactory: ((_jobId: string) => {
      throw new Error("not used in integration tests");
    }) as unknown as PipelineDeps["storeFactory"],
    config: {
      version: 1,
      runtime: "local",
      agents: {},
      pipeline: { stagingExcludePatterns: EXCLUDE_PATTERNS },
    } as PipelineDeps["config"],
    request: {
      type: "bug-fix",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug,
    cwd,
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "user",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    // Push capability declaring .github/workflows/** unpushable — the Layer 2
    // backstop is active for every commitAndPush call in these tests.
    pushCapability: {
      patterns: [".github/workflows/**"],
      source: "integration-test capability",
    },
    stepArtifact: undefined,
    stepIo: undefined,
    terminalState: undefined,
    roundGitEffects: undefined,
  } as PipelineDeps;
}

function makeGuardedStep(name: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes(_state: JobState, _deps: { slug: string }): IoRef[] {
      return [];
    },
  };
}

function makeScopedStep(name: string, writePaths: string[]): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "review this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    writes(_state: JobState, deps: { slug: string }): IoRef[] {
      return writePaths.map((p) => ({ path: p.replace("{slug}", deps.slug) }));
    },
  };
}

function makeCommitPushInfra(spawnFn: SpawnFn): CommitPushInfra {
  return {
    spawnFn,
    sleepFn: async (_ms) => {},
    events: new EventBus(),
    // Enables appendOidInPlace so the freshly synthesized commit joins the
    // egress ledger before the inline egress check (remote-less repo).
    persistBeforePush: async () => {},
  };
}

/** All commit OIDs reachable from HEAD — egress-ledger baseline for remote-less repos. */
function revList(cwd: string): string[] {
  const result = spawnSync("git", ["rev-list", "HEAD"], { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git rev-list HEAD failed:\n${result.stderr}`);
  return result.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
}

function headSha(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error("rev-parse failed");
  return result.stdout.trim();
}

/** Files touched by all commits after `sinceSha` (exclusive). */
function filesTouchedSince(cwd: string, sinceSha: string): string[] {
  const result = spawnSync(
    "git",
    ["log", "--name-only", "--format=", `${sinceSha}..HEAD`],
    { cwd, encoding: "utf-8" },
  );
  if (result.status !== 0) return [];
  return [...new Set(result.stdout.trim().split("\n").filter(Boolean))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup: real git repo
// ─────────────────────────────────────────────────────────────────────────────

let gitDir: string;
const slug = "excl-intg";

beforeEach(async () => {
  gitDir = await fs.mkdtemp(path.join(os.tmpdir(), "excl-intg-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  git(["init"], gitDir);
  git(["config", "user.email", "test@example.com"], gitDir);
  git(["config", "user.name", "Exclusion Integration Test"], gitDir);

  const changeFolder = path.join(gitDir, "specrunner", "changes", slug);
  await fs.mkdir(changeFolder, { recursive: true });
  await fs.writeFile(path.join(changeFolder, "request.md"), "# Request\nOriginal.\n");

  const workflowsDir = path.join(gitDir, ".github", "workflows");
  await fs.mkdir(workflowsDir, { recursive: true });
  await fs.writeFile(path.join(workflowsDir, "ci.yml"), "name: ci\non: push\n");

  await fs.writeFile(path.join(gitDir, "src.ts"), "export const a = 1;\n");

  git(["add", "-A"], gitDir);
  git(["commit", "-m", "init: initial commit"], gitDir);
});

afterEach(async () => {
  await fs.rm(gitDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-INT-1: excluded artifacts survive guarded → scoped without commit or halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-INT-1: 実 git — 除外 artifact が guarded → scoped を halt なしで通過し、commit されず worktree に残る", () => {
  it("guarded commit → scoped commit: no UNPUSHABLE_PATH_BLOCKED / WRITE_SCOPE_VIOLATION, excluded files stay dirty, declared outputs committed", async () => {
    const spawnFn = makeRealGitNoPushSpawnFn();
    const infra = makeCommitPushInfra(spawnFn);
    const deps = makeDeps(slug, gitDir);
    const baseSha = headSha(gitDir);

    // ── Guarded step (implementer相当): legitimate source change + excluded artifacts ──
    // vendor/generated.js — excluded untracked scratch artifact
    await fs.mkdir(path.join(gitDir, "vendor"), { recursive: true });
    await fs.writeFile(path.join(gitDir, "vendor", "generated.js"), "// generated\n");
    // .github/workflows/ci.yml — excluded dirty tracked path that ALSO matches
    // the declared pushCapability pattern (would be UNPUSHABLE_PATH_BLOCKED
    // without worktree-exclusion in Layer 2).
    await fs.appendFile(path.join(gitDir, ".github", "workflows", "ci.yml"), "# touched by agent\n");
    // Legitimate deliverable
    await fs.writeFile(path.join(gitDir, "src.ts"), "export const a = 2;\n");

    const guardedState = { ...makeJobState("implementer"), synthesizedCommits: revList(gitDir) };
    await commitAndPush(makeGuardedStep("implementer"), guardedState, deps, baseSha, infra);
    const afterGuardedSha = headSha(gitDir);

    // ── Scoped step (reviewer相当): writes only its declared result file ──
    const resultPath = `specrunner/changes/${slug}/review-result-001.md`;
    await fs.writeFile(path.join(gitDir, resultPath), "# Review\napproved\n");

    const scopedState = { ...makeJobState("spec-review"), synthesizedCommits: revList(gitDir) };
    // Neither call throws: Layer 2 sees no publishable unpushable path, and the
    // scoped residual check does not flag the excluded dirt.
    await commitAndPush(makeScopedStep("spec-review", [resultPath]), scopedState, deps, afterGuardedSha, infra);

    // ── Assertions ──
    const touched = filesTouchedSince(gitDir, baseSha);
    // Deliverables committed
    expect(touched).toContain("src.ts");
    expect(touched).toContain(resultPath);
    // Excluded paths never committed
    expect(touched).not.toContain("vendor/generated.js");
    expect(touched).not.toContain(".github/workflows/ci.yml");

    // Excluded paths preserved in the worktree (not cleaned / restored)
    const vendorContent = await fs.readFile(path.join(gitDir, "vendor", "generated.js"), "utf-8");
    expect(vendorContent).toBe("// generated\n");
    const wfContent = await fs.readFile(path.join(gitDir, ".github", "workflows", "ci.yml"), "utf-8");
    expect(wfContent).toContain("# touched by agent");

    // Worktree still reports them dirty (untracked / modified) — exclusion keeps, not deletes
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: gitDir, encoding: "utf-8" }).stdout;
    expect(status).toContain("vendor/");
    expect(status).toContain(".github/workflows/ci.yml");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-INT-2: non-excluded undeclared dirt still violates (non-regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-INT-2: 実 git — 除外に一致しない宣言外 dirty path は scoped commit で従来どおり WRITE_SCOPE_VIOLATION", () => {
  it("undeclared stray file outside exclusion patterns → scoped commit throws WRITE_SCOPE_VIOLATION", async () => {
    const spawnFn = makeRealGitNoPushSpawnFn();
    const infra = makeCommitPushInfra(spawnFn);
    const deps = makeDeps(slug, gitDir);
    const baseSha = headSha(gitDir);

    const resultPath = `specrunner/changes/${slug}/review-result-001.md`;
    await fs.writeFile(path.join(gitDir, resultPath), "# Review\napproved\n");
    // Stray undeclared file NOT matching any exclusion pattern
    await fs.writeFile(path.join(gitDir, "stray.txt"), "residue\n");

    const scopedState = { ...makeJobState("spec-review"), synthesizedCommits: revList(gitDir) };
    await expect(
      commitAndPush(makeScopedStep("spec-review", [resultPath]), scopedState, deps, baseSha, infra),
    ).rejects.toMatchObject({ code: "WRITE_SCOPE_VIOLATION" });
  });
});
