import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { ManagedRuntime } from "../src/core/runtime/managed.js";
import { LocalRuntime } from "../src/core/runtime/local.js";
import { VerificationStep } from "../src/core/step/verification.js";
import type { SessionClient } from "../src/core/port/session-client.js";
import type { GitHubClient } from "../src/core/port/github-client.js";
import type { SpawnFn } from "../src/util/spawn.js";
import { spawnCommand } from "../src/util/spawn.js";
import { buildInitialJobState } from "../src/store/job-state-store.js";
import { verificationResultPath } from "../src/util/paths.js";

// Only verification commands are replaced; commit, egress, runtime composition,
// publication and the next agent's clone all use the real implementation and Git.
vi.mock("../src/core/verification/runner.js", () => ({
  runVerification: async (slug: string, cwd: string) => {
    const file = path.join(cwd, verificationResultPath(slug));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "# Verification Result\n## Verdict: failed\nNew diagnostic\n");
    return { verdict: "failed", phases: [] };
  },
}));
vi.mock("../src/core/verification/reload-coverage-config.js", () => ({
  reloadCoverageConfig: async () => ({ applied: false }),
}));

const slug = "handoff-fixture";
const branch = "change/handoff-fixture";
const resultPath = verificationResultPath(slug);
let root: string;
let cwd: string;
let remote: string;
let rejectPush: boolean;
let commands: string[][];

function git(args: string[], dir = cwd): string {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

const trackedSpawn: SpawnFn = async (cmd, args, opts) => {
  commands.push([...args]);
  if (rejectPush && args[0] === "push") return { exitCode: 1, stdout: "", stderr: "fixture rejection" };
  return spawnCommand(cmd, args, opts);
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "verification-handoff-"));
  cwd = path.join(root, "runner");
  remote = path.join(root, "remote.git");
  git(["init", "--bare", remote], root);
  git(["clone", remote, cwd], root);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["checkout", "-b", branch]);
  await fs.writeFile(path.join(cwd, "README.md"), "fixture\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "fixture base"]);
  git(["push", "-u", "origin", branch]);
  rejectPush = false;
  commands = [];
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

function fixture(runtime: "local" | "managed") {
  const config = { version: 1 as const, agents: {}, environment: { id: "fixture", lastSyncedAt: "" } };
  const request = { type: "spec-change", title: "Fixture", slug, baseBranch: "main", content: "fixture", adr: false };
  const state = buildInitialJobState({
    request: { path: "request.md", title: "Fixture", type: "spec-change", slug },
    repository: { owner: "fixture", name: "fixture" },
  });
  state.branch = branch;
  const instance = runtime === "local"
    ? new LocalRuntime({ cwd, githubClient: null, spawnFn: trackedSpawn })
    : new ManagedRuntime(cwd, {} as SessionClient, {} as GitHubClient, { owner: "fixture", name: "fixture" }, trackedSpawn, "");
  const deps = instance.buildDeps(config, request, slug, { cwd, branch });
  deps.spawn = trackedSpawn;
  return { state, deps };
}

function cloneNextAgent(): string {
  const next = path.join(root, "next-agent");
  git(["clone", "--branch", branch, remote, next], root);
  return next;
}

describe("verification result runtime handoff", () => {
  it("keeps the local result committed and ledgered without any push", async () => {
    const { state, deps } = fixture("local");
    await VerificationStep.run(state, deps);
    expect(state.synthesizedCommits).toContain(git(["rev-parse", "HEAD"]));
    expect(git(["show", `HEAD:${resultPath}`])).toContain("New diagnostic");
    expect(commands.some(args => args[0] === "push")).toBe(false);
    await expect(fs.access(path.join(cloneNextAgent(), resultPath))).rejects.toThrow();
  });

  it("publishes the managed result before the next agent clones the branch", async () => {
    const { state, deps } = fixture("managed");
    await VerificationStep.run(state, deps);
    expect(state.synthesizedCommits).toContain(git(["rev-parse", "HEAD"]));
    expect(await fs.readFile(path.join(cloneNextAgent(), resultPath), "utf8")).toContain("New diagnostic");
    expect(commands.filter(args => args[0] === "push")).toHaveLength(1);
  });

  it("halts on managed push failure, then resends without creating a new commit", async () => {
    const { state, deps } = fixture("managed");
    rejectPush = true;
    await expect(VerificationStep.run(state, deps)).rejects.toMatchObject({
      code: "PUBLICATION_FAILED", message: expect.stringContaining("verification/handoff/push"),
    });
    const oid = git(["rev-parse", "HEAD"]);
    expect(state.synthesizedCommits).toContain(oid);
    expect(commands.filter(args => args[0] === "push")).toHaveLength(2);
    rejectPush = false;
    commands = [];
    await VerificationStep.run(state, deps);
    expect(git(["rev-parse", "HEAD"])).toBe(oid);
    expect(commands.some(args => args[0] === "commit")).toBe(false);
    expect(await fs.readFile(path.join(cloneNextAgent(), resultPath), "utf8")).toContain("New diagnostic");
  });

  it("blocks publication of an unknown commit preceding the managed result", async () => {
    const { state, deps } = fixture("managed");
    await fs.writeFile(path.join(cwd, "unknown.txt"), "not adopted\n");
    git(["add", "unknown.txt"]);
    git(["commit", "-m", "unknown commit"]);
    await expect(VerificationStep.run(state, deps)).rejects.toMatchObject({
      code: "PUBLICATION_FAILED", message: expect.stringContaining("verification/handoff/egress"),
    });
    expect(commands.some(args => args[0] === "push")).toBe(false);
    await expect(fs.access(path.join(cloneNextAgent(), "unknown.txt"))).rejects.toThrow();
  });
});
