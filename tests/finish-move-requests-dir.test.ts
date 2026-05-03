/**
 * Tests for finish command: requests dir move and commit.
 *
 * TC-027: git mv active → merged
 * TC-028: merged/ exists + active/ absent → skip
 * TC-044: no changes → skip commit
 * TC-063: commit message = "chore: archive <slug>"
 */
import { describe, it, expect, vi } from "vitest";
import { moveRequestsDir } from "../src/core/finish/move-requests-dir.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";

function makeSpawn(responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>): SpawnFn {
  let callIdx = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIdx] ?? { exitCode: 0 };
    callIdx++;
    return Promise.resolve({ exitCode: resp.exitCode, stdout: resp.stdout ?? "", stderr: resp.stderr ?? "" });
  });
}

function makeFs(activeExists: boolean, mergedExists: boolean): FinishFs {
  return {
    exists: vi.fn().mockImplementation((p: string) => {
      if (p.includes("active")) return Promise.resolve(activeExists);
      if (p.includes("merged")) return Promise.resolve(mergedExists);
      return Promise.resolve(false);
    }),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE = {
  slug: "my-feature",
  cwd: "/repo",
};

// TC-027
describe("TC-027: git mv active → merged", () => {
  it("calls git mv with correct paths", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git mv
      { exitCode: 1 }, // git diff --cached --quiet (exit 1 = changes staged)
      { exitCode: 0, stdout: "1 file changed" }, // git commit
    ]);
    const fs = makeFs(true, false);

    const result = await moveRequestsDir({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const mvCall = calls.find((c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("mv"));
    expect(mvCall).toBeDefined();
    const mvArgs = (mvCall as unknown[])[1] as string[];
    expect(mvArgs).toContain("mv");
    expect(mvArgs.join(" ")).toContain("active/my-feature");
    expect(mvArgs.join(" ")).toContain("merged/my-feature");
  });
});

// TC-028
describe("TC-028: merged/ exists + active/ absent → skip", () => {
  it("skips git mv when already moved", async () => {
    const spawn = makeSpawn([{ exitCode: 0 }]);
    const fs = makeFs(false, true);

    const result = await moveRequestsDir({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("already moved");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// TC-044
describe("TC-044: no changes → skip commit", () => {
  it("skips commit when git diff --cached --quiet reports no staged changes", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git mv
      { exitCode: 0 }, // git diff --cached --quiet (exit 0 = no staged changes)
      // git commit is never called
    ]);
    const fs = makeFs(true, false);

    const result = await moveRequestsDir({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.committed).toBe(false);
    expect(result.message).toContain("No changes to commit");

    // Verify git commit was NOT called
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("commit"),
    );
    expect(commitCall).toBeUndefined();
  });
});

// TC-063
describe("TC-063: commit message = 'chore: archive <slug>'", () => {
  it("uses correct commit message", async () => {
    const spawn = makeSpawn([
      { exitCode: 0 }, // git mv
      { exitCode: 1 }, // git diff --cached --quiet (exit 1 = changes staged)
      { exitCode: 0, stdout: "1 file changed" }, // git commit
    ]);
    const fs = makeFs(true, false);

    await moveRequestsDir({ ...BASE, spawn, fs });

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const commitCall = calls.find(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[]).includes("commit"),
    );
    expect(commitCall).toBeDefined();
    const commitArgs = (commitCall as unknown[])[1] as string[];
    const msgIdx = commitArgs.indexOf("-m");
    expect(msgIdx).toBeGreaterThanOrEqual(0);
    expect(commitArgs[msgIdx + 1]).toBe("chore: archive my-feature");
  });
});
