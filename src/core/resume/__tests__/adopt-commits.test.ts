/**
 * Unit tests for adopt-commits helper functions.
 *
 * TC-008: detectUnadoptedCommits returns [] when all publish-range OIDs are in the ledger
 * TC-009: detectUnadoptedCommits returns populated UnadoptedCommit entries for unknown OIDs
 * TC-010: detectUnadoptedCommits throws with exit code in message on non-zero git rev-list exit
 *
 * Additionally (from tasks.md T-05):
 *   TC-U3: detectUnadoptedCommits returns [] when publish range is empty (HEAD fully on origin)
 *   TC-U5: buildAdoptEscalationMessage contains commit's short SHA and all three resolution options
 *
 * NOTE: This file imports from ../adopt-commits.js which does NOT exist yet.
 * All tests will fail with a module-not-found error (RED state).
 * After T-02 implementation the module will exist and the assertions will drive GREEN.
 *
 * TC-U1/TC-U2/TC-U3 use a real tmp git repo with a bare origin (no git mocking for detection).
 * TC-U4/TC-010 use a mocked spawnFn returning a non-zero exit code.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

// Modules under test — adopt-commits.ts does NOT exist yet.
// Import failure is the expected RED state; GREEN after T-02 implementation.
import { detectUnadoptedCommits, buildAdoptEscalationMessage } from "../adopt-commits.js";
import { defaultSpawnFn } from "../../../util/git-exec.js";
import type { SpawnFn } from "../../../util/git-exec.js";

// ---------------------------------------------------------------------------
// Mock spawnFn helper (for TC-010 — controlled non-zero exit code)
// ---------------------------------------------------------------------------

/**
 * Build a SpawnFn that returns fake ChildProcess instances with controlled responses.
 * Each call consumes the next entry from `responses`.
 */
function makeGitSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: string[][] } {
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

// ---------------------------------------------------------------------------
// Real git repo helpers
// ---------------------------------------------------------------------------

/**
 * Initialize a git repo at repoDir with a bare origin at originDir.
 * Makes an initial commit and pushes it so HEAD is fully on origin.
 * Returns { repoDir, originDir }.
 */
async function setupGitRepo(
  tempDir: string,
): Promise<{ repoDir: string; originDir: string }> {
  const originDir = path.join(tempDir, "origin.git");
  const repoDir = path.join(tempDir, "repo");

  // Init bare origin
  spawnSync("git", ["init", "--bare", originDir], { encoding: "utf8" });

  // Init work repo
  spawnSync("git", ["init", repoDir], { encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "test@adopt-test.local"], { cwd: repoDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Adopt Test"], { cwd: repoDir, encoding: "utf8" });

  // Point to bare origin
  spawnSync("git", ["remote", "add", "origin", originDir], { cwd: repoDir, encoding: "utf8" });

  // Initial commit
  await fs.writeFile(path.join(repoDir, "README.md"), "# Test\n", "utf-8");
  spawnSync("git", ["add", "README.md"], { cwd: repoDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "initial commit"], { cwd: repoDir, encoding: "utf8" });

  // Push — sets up remote tracking so "git rev-list HEAD --not --remotes=origin" works
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoDir,
    encoding: "utf8",
  }).stdout.trim();
  spawnSync("git", ["push", "-u", "origin", branch], { cwd: repoDir, encoding: "utf8" });

  return { repoDir, originDir };
}

// ---------------------------------------------------------------------------
// TC-U3 / TC-008: detectUnadoptedCommits — empty range and all-in-ledger cases
// ---------------------------------------------------------------------------

describe("TC-008 / TC-U3: detectUnadoptedCommits — empty range and all-in-ledger return []", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adopt-commits-tc008-"));
    ({ repoDir } = await setupGitRepo(tempDir));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TC-U3: returns [] when publish range is empty (HEAD fully on origin)", async () => {
    // GIVEN: HEAD is at origin (all commits pushed) → publish range is empty
    // WHEN: detectUnadoptedCommits is called with any ledger
    // THEN: returns []
    const result = await detectUnadoptedCommits(repoDir, [], defaultSpawnFn);
    expect(result).toEqual([]);
  });

  it("TC-008: returns [] when every publish-range OID is in the ledger", async () => {
    // GIVEN: make one more commit (HEAD is 1 ahead of origin → in publish range)
    await fs.writeFile(path.join(repoDir, "feature.ts"), "// feature\n", "utf-8");
    spawnSync("git", ["add", "feature.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "add feature"], { cwd: repoDir, encoding: "utf8" });

    const oid = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    // WHEN: detectUnadoptedCommits called with ledger = [oid] (the commit is already known)
    const result = await detectUnadoptedCommits(repoDir, [oid], defaultSpawnFn);

    // THEN: returns [] — no unknown commits
    expect(result).toEqual([]);
  });

  it("TC-008: returns [] when multiple publish-range OIDs are all in the ledger", async () => {
    // GIVEN: two commits ahead of origin, both pre-seeded in ledger
    await fs.writeFile(path.join(repoDir, "a.ts"), "// a\n", "utf-8");
    spawnSync("git", ["add", "a.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "commit A"], { cwd: repoDir, encoding: "utf8" });
    const oidA = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    await fs.writeFile(path.join(repoDir, "b.ts"), "// b\n", "utf-8");
    spawnSync("git", ["add", "b.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "commit B"], { cwd: repoDir, encoding: "utf8" });
    const oidB = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    // WHEN: ledger contains both OIDs
    const result = await detectUnadoptedCommits(repoDir, [oidA, oidB], defaultSpawnFn);

    // THEN: returns []
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-009: detectUnadoptedCommits — returns populated UnadoptedCommit for unknown OID
// ---------------------------------------------------------------------------

describe("TC-009: detectUnadoptedCommits — returns populated UnadoptedCommit entries for unknown OIDs", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adopt-commits-tc009-"));
    ({ repoDir } = await setupGitRepo(tempDir));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TC-009: returns exactly one UnadoptedCommit with populated shortSha, subject, author, paths", async () => {
    // GIVEN: a commit added AFTER the ledger snapshot (OID not in ledger, IS in publish range)
    await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(repoDir, "src", "new-file.ts"),
      "// operator change\n",
      "utf-8",
    );
    spawnSync("git", ["add", "src/new-file.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "operator: add new-file.ts"], { cwd: repoDir, encoding: "utf8" });

    const fullOid = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();
    const expectedShortSha = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    // WHEN: detectUnadoptedCommits called with an EMPTY ledger (stale — doesn't know about this commit)
    const result = await detectUnadoptedCommits(repoDir, [], defaultSpawnFn);

    // THEN: exactly one UnadoptedCommit is returned
    expect(result).toHaveLength(1);
    const commit = result[0]!;

    // oid is the full OID
    expect(commit.oid).toBe(fullOid);

    // shortSha matches git rev-parse --short output (not empty/fallback)
    expect(commit.shortSha).toBe(expectedShortSha);
    expect(commit.shortSha).toMatch(/^[0-9a-f]{4,}/);

    // subject matches the commit message
    expect(commit.subject).toBe("operator: add new-file.ts");

    // author matches the git config set in setupGitRepo
    expect(commit.author).toBe("Adopt Test");

    // paths contains the changed file
    expect(commit.paths).toContain("src/new-file.ts");
    expect(commit.paths.length).toBeGreaterThan(0);
  });

  it("TC-009: only the OID absent from ledger is returned (known OID is filtered out)", async () => {
    // GIVEN: one known commit and one unknown commit
    await fs.writeFile(path.join(repoDir, "known.ts"), "// known\n", "utf-8");
    spawnSync("git", ["add", "known.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "known commit"], { cwd: repoDir, encoding: "utf8" });
    const knownOid = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    await fs.writeFile(path.join(repoDir, "unknown.ts"), "// unknown\n", "utf-8");
    spawnSync("git", ["add", "unknown.ts"], { cwd: repoDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "unknown commit"], { cwd: repoDir, encoding: "utf8" });
    const unknownOid = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir, encoding: "utf8",
    }).stdout.trim();

    // WHEN: ledger contains only the known OID
    const result = await detectUnadoptedCommits(repoDir, [knownOid], defaultSpawnFn);

    // THEN: only the unknown OID is returned (not the known one)
    expect(result).toHaveLength(1);
    expect(result[0]!.oid).toBe(unknownOid);
    expect(result.some((c: { oid: string }) => c.oid === knownOid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-010: detectUnadoptedCommits — throws on non-zero git rev-list exit
// ---------------------------------------------------------------------------

describe("TC-010: detectUnadoptedCommits — throws with exit code in message on non-zero git rev-list exit", () => {
  it("TC-010: throws an Error whose message contains the exit code substring 'exit 1'", async () => {
    // GIVEN: a spawnFn mock that resolves with exit code 1 for git rev-list
    const { fn } = makeGitSpawnFn([
      { exitCode: 1, stderr: "git rev-list: fatal error" },
    ]);

    // WHEN: detectUnadoptedCommits is called
    let caught: Error | undefined;
    try {
      await detectUnadoptedCommits("/fake/path", [], fn);
    } catch (e) {
      caught = e as Error;
    }

    // THEN: throws an Error whose message contains the exit code
    expect(caught).toBeDefined();
    expect(caught?.message).toContain("exit 1");
  });

  it("TC-010: thrown Error message contains 'exit 128' for exit code 128", async () => {
    // GIVEN: exit code 128 (git reports 'not a git repository')
    const { fn } = makeGitSpawnFn([
      { exitCode: 128, stderr: "not a git repository" },
    ]);

    let caught: Error | undefined;
    try {
      await detectUnadoptedCommits("/not-a-repo", [], fn);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain("exit 128");
  });

  it("TC-010: does NOT return [] on failure — fail-closed (not fail-safe)", async () => {
    // DESTROY note: degrading this to `return []` reintroduces the silent pass-through the gate removes.
    // If this assertion fails after removing the throw, the guard is confirmed load-bearing.
    const { fn } = makeGitSpawnFn([
      { exitCode: 1, stderr: "error" },
    ]);

    let threw = false;
    let result: unknown;
    try {
      result = await detectUnadoptedCommits("/fake/path", [], fn);
    } catch {
      threw = true;
    }

    expect(
      threw,
      "detectUnadoptedCommits must throw on git rev-list failure (fail-closed, not fail-safe)",
    ).toBe(true);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-U5 (tasks.md T-05): buildAdoptEscalationMessage — contains commit info and three resolution options
// ---------------------------------------------------------------------------

describe("TC-U5 (tasks.md T-05): buildAdoptEscalationMessage contains commit info and three resolution options", () => {
  const SLUG = "operator-commit-adoption";
  const MOCK_COMMIT = {
    oid: "deadbeefcafebabe1234567890abcdef12345678",
    shortSha: "deadbee",
    subject: "operator: fix escalation handling",
    author: "Operator Dev",
    paths: ["specrunner/changes/operator-commit-adoption/spec.md", "src/core/resume/adopt-commits.ts"],
  };

  it("TC-U5: contains the commit's short SHA", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    expect(msg).toContain(MOCK_COMMIT.shortSha);
  });

  it("TC-U5: contains --adopt-commits as one resolution option", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    expect(msg).toContain("--adopt-commits");
  });

  it("TC-U5: references pushing to origin as one resolution option", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    const lc = msg.toLowerCase();
    expect(lc.includes("push") || lc.includes("origin")).toBe(true);
  });

  it("TC-U5: references removing or reverting as one resolution option", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    const lc = msg.toLowerCase();
    expect(lc.includes("reset") || lc.includes("revert") || lc.includes("remove")).toBe(true);
  });

  it("TC-U5: substitutes the real slug into the --adopt-commits command", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    // The message must show the real slug so the operator can copy-paste the command
    expect(msg).toContain(SLUG);
  });

  it("TC-U5: with multiple commits each commit's short SHA appears in the output", () => {
    const commitB = {
      oid: "aaaa0000bbbb1111cccc2222dddd3333eeee4444",
      shortSha: "aaaa000",
      subject: "another operator commit",
      author: "Second Operator",
      paths: ["src/core/command/resume.ts"],
    };
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT, commitB]);
    expect(msg).toContain(MOCK_COMMIT.shortSha);
    expect(msg).toContain(commitB.shortSha);
  });

  it("TC-U5: returns a non-empty string for a single commit", () => {
    const msg = buildAdoptEscalationMessage(SLUG, [MOCK_COMMIT]);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});
