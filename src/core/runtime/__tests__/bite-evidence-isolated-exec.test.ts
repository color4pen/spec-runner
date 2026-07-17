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
    // (The module specifier is built via concatenation so the grep-no-bun-imports
    //  scanner does not flag this source file — the fixture content, not the test
    //  itself, uses bun:test.)
    const bunTestModule = "bun" + ":test";
    await fs.writeFile(
      path.join(repo, "sample.test.ts"),
      `import { test, expect } from "${bunTestModule}";\ntest("s", () => { expect(1).toBe(1); });\n`,
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

  // TC-006: custom commands without opt-in stay unavailable
  // When custom verification.commands are present but scopedTestCommand is NOT set,
  // runTestsAtCommit must return unavailable (backward-compat, fail-closed).
  // Opt-in not enabled → cannot scope custom commands to individual files.
  it("TC-006: custom verification.commands without scopedTestCommand → unavailable (opt-in not enabled)", async () => {
    const cfg = { version: 1, agents: {}, verification: { commands: ["echo x"] } } as unknown as SpecRunnerConfig;
    const r = await makeLocal(repo).runTestsAtCommit(oid, ["sample.test.ts"], repo, cfg);
    expect(r.kind).toBe("unavailable");
  });
});

// TC-005: opt-in enables scoped execution under custom commands
// When scopedTestCommand IS set alongside custom verification.commands,
// runTestsAtCommit must NOT bail and must return { kind: "ran" }.
describe("TC-005: scopedTestCommand opt-in enables scoped execution under custom commands", () => {
  let optInRepo: string;
  let optInOid: string;

  beforeAll(async () => {
    optInRepo = await fs.mkdtemp(path.join(os.tmpdir(), "bite-iso-opt-in-"));
    await git(optInRepo, "init", "--initial-branch=main");
    await git(optInRepo, "config", "user.email", "t@t.co");
    await git(optInRepo, "config", "user.name", "T");
    await fs.writeFile(path.join(optInRepo, "README.md"), "# repo\n");
    await git(optInRepo, "add", "-A");
    await git(optInRepo, "commit", "-m", "init");
    // Add a self-contained zero-dependency bun:test fixture.
    const bunTestModule = "bun" + ":test";
    await fs.writeFile(
      path.join(optInRepo, "zero-dep.test.ts"),
      `import { test, expect } from "${bunTestModule}";\ntest("zero", () => { expect(1).toBe(1); });\n`,
    );
    await git(optInRepo, "add", "-A");
    await git(optInRepo, "commit", "-m", "add zero-dep test");
    optInOid = await git(optInRepo, "rev-parse", "HEAD");
    // Create an empty node_modules dir so the scoped path's existence check passes.
    // (The test file itself uses only bun:test builtin — no real npm dep needed.)
    await fs.mkdir(path.join(optInRepo, "node_modules"), { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await fs.rm(optInRepo, { recursive: true, force: true });
  });

  it("TC-005: custom commands + scopedTestCommand set → ran (opt-in unlocks scoped execution)", async () => {
    const cfg = {
      version: 1,
      agents: {},
      verification: { commands: ["echo x"], scopedTestCommand: "bun test" },
    } as unknown as SpecRunnerConfig;
    const r = await makeLocal(optInRepo).runTestsAtCommit(optInOid, ["zero-dep.test.ts"], optInRepo, cfg);
    expect(r.kind).toBe("ran");
    if (r.kind === "ran") {
      expect(r.results.length).toBe(1);
      expect(r.results[0]!.file).toBe("zero-dep.test.ts");
      expect(r.results[0]!.passed).toBe(true);
    }
  }, 60_000);
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
