/**
 * Unit tests for propagateVerificationResult.
 *
 * The propagation step copies verification-result.md from the orchestrator's
 * local cwd into a temp git worktree of the feature branch, commits and pushes,
 * so that build-fixer's managed agent workspace can read it via a fresh clone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { propagateVerificationResult } from "../../../../src/core/verification/propagate.js";
import type { SpawnFn, SpawnResult } from "../../../../src/util/spawn.js";

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
let mkdtempCounter = 0;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-verify-test-"));
  // Create a verification-result.md so the propagate step can read it
  const slug = "my-change";
  const dir = path.join(cwd, "openspec", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "verification-result.md"), "# Verification Result\n## Verdict: failed\n", "utf-8");
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
  mkdtempCounter = 0;
});

async function makeMkdtemp(): Promise<(prefix: string) => Promise<string>> {
  return async (prefix: string) => {
    mkdtempCounter++;
    const p = `${prefix}${mkdtempCounter}`;
    await fs.mkdir(p, { recursive: true });
    return p;
  };
}

describe("propagateVerificationResult — happy path", () => {
  it("fetches, worktree-adds, writes file, adds, diffs (non-zero=changes), commits, pushes, removes worktree", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git fetch
      { exitCode: 0 }, // git worktree add
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // git diff --cached --quiet (non-zero = changes staged)
      { exitCode: 0 }, // git commit
      { exitCode: 0 }, // git push
      { exitCode: 0 }, // git worktree remove
    ]);
    const mkdtempFn = await makeMkdtemp();

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result).toEqual({ ok: true });
    const cmds = spawn.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(cmds).toContain("git fetch origin feat/test");
    expect(cmds.some((c) => c.startsWith("git worktree add"))).toBe(true);
    expect(cmds).toContain("git add openspec/changes/my-change/verification-result.md");
    expect(cmds.some((c) => c.startsWith("git commit -m chore: verification result for my-change (iter 1)"))).toBe(true);
    expect(cmds).toContain("git push origin feat/test");
    expect(cmds.some((c) => c.startsWith("git worktree remove --force"))).toBe(true);
  });
});

describe("propagateVerificationResult — source file missing", () => {
  it("returns error without spawning git", async () => {
    const spawn = makeSpawn([]);
    const mkdtempFn = await makeMkdtemp();

    // Remove the source file
    await fs.rm(path.join(cwd, "openspec", "changes", "my-change", "verification-result.md"));

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("verification-result.md not found");
    expect(spawn.calls.length).toBe(0);
  });
});

describe("propagateVerificationResult — fetch fails", () => {
  it("returns error without creating worktree", async () => {
    const spawn = makeSpawn([{ exitCode: 1, stderr: "fatal: couldn't find remote" }]);
    const mkdtempFn = await makeMkdtemp();

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git fetch");
    // Only fetch was called; no worktree add
    expect(spawn.calls.length).toBe(1);
  });
});

describe("propagateVerificationResult — worktree add fails", () => {
  it("returns error and skips worktree remove", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // fetch
      { exitCode: 1, stderr: "fatal: worktree exists" }, // worktree add
    ]);
    const mkdtempFn = await makeMkdtemp();

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git worktree add");
    expect(spawn.calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove")).toBe(false);
  });
});

describe("propagateVerificationResult — nothing to commit", () => {
  it("returns ok with warning and removes worktree", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // fetch
      { exitCode: 0 }, // worktree add
      { exitCode: 0 }, // git add
      { exitCode: 0 }, // git diff --cached --quiet (zero exit = nothing staged)
      { exitCode: 0 }, // worktree remove
    ]);
    const mkdtempFn = await makeMkdtemp();

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 2,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toContain("unchanged");
    expect(spawn.calls.some((c) => c.args[0] === "commit")).toBe(false);
    expect(spawn.calls.some((c) => c.args[0] === "push")).toBe(false);
    expect(spawn.calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove")).toBe(true);
  });
});

describe("propagateVerificationResult — push fails", () => {
  it("returns error and still removes worktree", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // fetch
      { exitCode: 0 }, // worktree add
      { exitCode: 0 }, // git add
      { exitCode: 1 }, // diff (changes staged)
      { exitCode: 0 }, // commit
      { exitCode: 1, stderr: "rejected: non-fast-forward" }, // push
      { exitCode: 0 }, // worktree remove
    ]);
    const mkdtempFn = await makeMkdtemp();

    const result = await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("git push");
    expect(spawn.calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove")).toBe(true);
  });
});

describe("propagateVerificationResult — temp worktree path is unique per call", () => {
  it("uses mkdtemp-derived path for each invocation", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 },
    ]);
    const mkdtempFn = await makeMkdtemp();

    await propagateVerificationResult({
      slug: "my-change",
      branch: "feat/test",
      iteration: 1,
      cwd,
      spawn,
      mkdtempFn,
    });

    const worktreeAddCall = spawn.calls.find((c) => c.args[0] === "worktree" && c.args[1] === "add");
    expect(worktreeAddCall).toBeDefined();
    expect(worktreeAddCall!.args[4]).toContain("specrunner-verify-");
  });
});
