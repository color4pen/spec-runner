/**
 * Unit tests for propagateVerificationResult (simplified: no temp worktree).
 *
 * Design D5: propagate operates directly in the job worktree (cwd).
 * No temp worktree creation/cleanup — just git add + diff + commit + push.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { propagateVerificationResult } from "../../../../src/core/verification/propagate.js";
import type { SpawnFn, SpawnResult } from "../../../../src/util/spawn.js";
import { changeFolderPath, verificationResultPath } from "../../../../src/util/paths.js";

function makeSpawn(
  responses: Array<Partial<SpawnResult>>,
): SpawnFn & { calls: Array<{ cmd: string; args: string[]; cwd: string }> } {
  const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
  let i = 0;
  const fn = vi.fn(async (cmd: string, args: string[], opts: { cwd: string }) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    const r = responses[i] ?? { exitCode: 0, stdout: "", stderr: "" };
    i++;
    return { exitCode: 0, stdout: "", stderr: "", ...r };
  }) as unknown as SpawnFn & { calls: typeof calls };
  Object.assign(fn, { calls });
  return fn;
}

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-verify-test-"));
  // Create a verification-result.md so the propagate step can find it
  const slug = "my-change";
  const dir = path.join(cwd, changeFolderPath(slug));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "verification-result.md"),
    "# Verification Result\n## Verdict: failed\n",
    "utf-8",
  );
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

describe("propagateVerificationResult — happy path", () => {
  it("adds, diffs (non-zero=changes), commits, pushes directly in cwd (no temp worktree)", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // git diff --cached --quiet (non-zero = changes staged)
      { exitCode: 0 }, // git commit
      { exitCode: 0 }, // git push
    ]);

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
    });

    expect(result).toEqual({ ok: true });
    const cmds = spawn.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(cmds[0]).toBe(`git add ${verificationResultPath("my-change")}`);
    // Pathspec-limited diff and commit: a whole-index diff/commit would treat unrelated
    // pre-staged entries as pending changes / sweep them into the verification commit.
    expect(cmds[1]).toBe(`git diff --cached --quiet -- ${verificationResultPath("my-change")}`);
    expect(cmds[2]).toContain("git commit -m chore: verification result for my-change (iter 1)");
    expect(cmds[2]).toContain(`-- ${verificationResultPath("my-change")}`);
    expect(cmds[3]).toBe("git push origin feat/test");

    // All operations run in cwd (NOT a temp worktree)
    expect(spawn.calls.every((c) => c.cwd === cwd)).toBe(true);

    // No fetch, no worktree add/remove
    expect(cmds.some((c) => c.startsWith("git fetch"))).toBe(false);
    expect(cmds.some((c) => c.startsWith("git worktree"))).toBe(false);
  });
});

describe("propagateVerificationResult — source file missing", () => {
  it("returns error without spawning git", async () => {
    const spawn = makeSpawn([]);

    // Remove the source file
    await fs.rm(path.join(cwd, verificationResultPath("my-change")));

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("verification-result.md not found");
    expect(spawn.calls.length).toBe(0);
  });
});

describe("propagateVerificationResult — nothing to commit", () => {
  it("returns ok with warning when diff shows no staged changes", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git add
      { exitCode: 0 }, // git diff --cached --quiet (zero = nothing staged)
    ]);

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 2,
      cwd,
      spawn,
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toContain("unchanged");
    expect(spawn.calls.some((c) => c.cmd === "git" && c.args[0] === "commit")).toBe(false);
    expect(spawn.calls.some((c) => c.cmd === "git" && c.args[0] === "push")).toBe(false);
  });
});

describe("propagateVerificationResult — git add fails", () => {
  it("returns error immediately", async () => {
    const spawn = makeSpawn([
      { exitCode: 1, stderr: "fatal: not a git repository" }, // git add
    ]);

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git add failed");
    expect(spawn.calls.length).toBe(1);
  });
});

describe("propagateVerificationResult — push fails", () => {
  it("returns error", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // diff (changes staged)
      { exitCode: 0 }, // commit
      { exitCode: 1, stderr: "rejected: non-fast-forward" }, // push
    ]);

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git push");
  });
});

describe("propagateVerificationResult — commit fails", () => {
  it("returns error", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // diff (changes staged)
      { exitCode: 1, stderr: "nothing to commit" }, // commit fails
    ]);

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git commit failed");
  });
});
