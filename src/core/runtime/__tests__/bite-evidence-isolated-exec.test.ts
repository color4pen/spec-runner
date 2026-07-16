/**
 * Integration coverage for the bite-evidence isolated-execution runtime methods
 * (bite-evidence-forward R4, T-04): LocalRuntime.listCommitChangedFiles /
 * runTestsAtCommit against a real git repo, and the ManagedRuntime unavailable stubs.
 *
 * These methods perform real git worktree + subprocess I/O, so they are exercised
 * here via a throwaway git repository rather than with fakes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalRuntime } from "../local.js";
import { ManagedRuntime } from "../managed.js";
import { spawnCommand } from "../../../util/spawn.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@t.co",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@t.co",
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await spawnCommand("git", args, { cwd, env: GIT_ENV });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

const MINIMAL_CONFIG = { version: 1, agents: {} } as unknown as SpecRunnerConfig;

function makeLocal(cwd: string): LocalRuntime {
  return new LocalRuntime({ cwd, githubClient: {} as GitHubClient, spawnFn: spawnCommand });
}

describe("bite-evidence isolated execution — LocalRuntime", () => {
  let repo: string;
  let oid: string;

  beforeAll(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "bite-iso-exec-"));
    await git(repo, "init", "--initial-branch=main");
    await git(repo, "config", "user.email", "t@t.co");
    await git(repo, "config", "user.name", "T");
    await fs.writeFile(path.join(repo, "README.md"), "# repo\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "init");
    // Second commit adds a self-contained bun-runnable test file.
    await fs.writeFile(
      path.join(repo, "sample.test.ts"),
      'import { test, expect } from "bun:test";\ntest("s", () => { expect(1).toBe(1); });\n',
    );
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "add sample test");
    oid = await git(repo, "rev-parse", "HEAD");
  }, 60_000);

  afterAll(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("listCommitChangedFiles → success lists the changed files of the commit", async () => {
    const r = await makeLocal(repo).listCommitChangedFiles(oid, repo);
    expect(r.kind).toBe("success");
    if (r.kind === "success") expect(r.files).toContain("sample.test.ts");
  });

  it("listCommitChangedFiles with a non-existent OID → unavailable (never throws)", async () => {
    const r = await makeLocal(repo).listCommitChangedFiles("deadbeef", repo);
    expect(r.kind).toBe("unavailable");
  });

  it("runTestsAtCommit with empty testFiles → ran with no results (no worktree created)", async () => {
    const r = await makeLocal(repo).runTestsAtCommit(oid, [], repo, MINIMAL_CONFIG);
    expect(r).toEqual({ kind: "ran", results: [] });
  });

  it("runTestsAtCommit runs each test file in an isolated worktree and cleans it up", async () => {
    const r = await makeLocal(repo).runTestsAtCommit(oid, ["sample.test.ts"], repo, MINIMAL_CONFIG);
    expect(r.kind).toBe("ran");
    if (r.kind === "ran") {
      expect(r.results.length).toBe(1);
      expect(r.results[0]!.file).toBe("sample.test.ts");
    }
    // Isolated worktree must have been removed in the finally cleanup.
    const wt = await git(repo, "worktree", "list");
    expect(wt).not.toContain("specrunner-bite-evidence");
  }, 60_000);

  it("runTestsAtCommit with a non-existent OID → unavailable (worktree add fails)", async () => {
    const r = await makeLocal(repo).runTestsAtCommit("deadbeef", ["sample.test.ts"], repo, MINIMAL_CONFIG);
    expect(r.kind).toBe("unavailable");
  });

  it("runTestsAtCommit with custom verification.commands → unavailable (cannot scope)", async () => {
    const cfg = { version: 1, agents: {}, verification: { commands: ["echo x"] } } as unknown as SpecRunnerConfig;
    const r = await makeLocal(repo).runTestsAtCommit(oid, ["sample.test.ts"], repo, cfg);
    expect(r.kind).toBe("unavailable");
  });
});

describe("bite-evidence isolated execution — ManagedRuntime returns unavailable (no local worktree)", () => {
  function makeManaged(): ManagedRuntime {
    return new ManagedRuntime(
      "/cwd",
      {} as SessionClient,
      {} as GitHubClient,
      { owner: "x", name: "y" } as OriginInfo,
      undefined,
      "tok",
    );
  }

  it("listCommitChangedFiles → unavailable", async () => {
    const r = await makeManaged().listCommitChangedFiles("oid", "/cwd");
    expect(r.kind).toBe("unavailable");
  });

  it("runTestsAtCommit → unavailable", async () => {
    const r = await makeManaged().runTestsAtCommit("oid", ["f.test.ts"], "/cwd", MINIMAL_CONFIG);
    expect(r.kind).toBe("unavailable");
  });
});
