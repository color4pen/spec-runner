/**
 * Tests for finish command: commit archive step.
 *
 * TC-CA-001: staging あり → commit 成功 → ok: true, skipped: false
 * TC-CA-002: staging なし → commit skip → ok: true, skipped: true
 * TC-CA-003: commit 失敗 → escalation
 * TC-CA-004: git diff 異常 exit code → escalation
 */
import { describe, it, expect, vi } from "vitest";
import { commitArchive } from "../src/core/finish/commit-archive.js";
import type { SpawnFn } from "../src/util/spawn.js";

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

function makeSpawnSequence(results: Array<{ exitCode: number; stdout?: string; stderr?: string }>): SpawnFn {
  const fn = vi.fn();
  for (const result of results) {
    fn.mockResolvedValueOnce({ exitCode: result.exitCode, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  }
  return fn;
}

const BASE = { slug: "test-slug", cwd: "/repo" };

// TC-CA-001
describe("TC-CA-001: staging あり → commit 成功", () => {
  it("returns ok: true, skipped: false and calls git commit with correct message", async () => {
    const spawn = makeSpawnSequence([
      { exitCode: 1 }, // git diff --cached --quiet: exit 1 = staged changes present
      { exitCode: 0, stdout: "1 file changed" }, // git commit: success
    ]);

    const result = await commitArchive({ ...BASE, spawn });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);
    expect(result.message).toContain("test-slug");

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], unknown][];

    // First call: git diff --cached --quiet
    expect(calls[0]![0]).toBe("git");
    expect(calls[0]![1]).toContain("diff");
    expect(calls[0]![1]).toContain("--cached");
    expect(calls[0]![1]).toContain("--quiet");

    // Second call: git commit with correct message
    expect(calls[1]![0]).toBe("git");
    expect(calls[1]![1]).toContain("commit");
    expect(calls[1]![1]).toContain("chore: archive test-slug");
  });
});

// TC-CA-002
describe("TC-CA-002: staging なし → commit skip", () => {
  it("returns ok: true, skipped: true and does NOT call git commit", async () => {
    const spawn = makeSpawn(0); // git diff --cached --quiet: exit 0 = no staged changes

    const result = await commitArchive({ ...BASE, spawn });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("skipped");

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], unknown][];

    // Only one call: git diff --cached --quiet
    expect(calls).toHaveLength(1);

    // git commit must NOT have been called
    const commitCalls = calls.filter(([cmd, args]) => cmd === "git" && args[0] === "commit");
    expect(commitCalls).toHaveLength(0);
  });
});

// TC-CA-003
describe("TC-CA-003: commit 失敗 → escalation", () => {
  it("returns ok: false with escalation when git commit exits non-zero", async () => {
    const spawn = makeSpawnSequence([
      { exitCode: 1 }, // git diff --cached --quiet: staged changes present
      { exitCode: 1, stderr: "error: nothing to commit" }, // git commit: failure
    ]);

    const result = await commitArchive({ ...BASE, spawn });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("commit-archive");
    expect(result.escalation).toContain("specrunner finish test-slug");
  });
});

// TC-CA-004
describe("TC-CA-004: git diff 異常 exit code → escalation", () => {
  it("returns ok: false with escalation when git diff exits with unexpected code (e.g. 128)", async () => {
    const spawn = makeSpawn(128, "", "fatal: not a git repository");

    const result = await commitArchive({ ...BASE, spawn });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("commit-archive");
    expect(result.escalation).toContain("specrunner finish test-slug");

    // git commit must NOT have been called
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as [string, string[], unknown][];
    const commitCalls = calls.filter(([cmd, args]) => cmd === "git" && args[0] === "commit");
    expect(commitCalls).toHaveLength(0);
  });
});
