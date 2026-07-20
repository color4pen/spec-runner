/**
 * Tests for the repo-required gate on the `init` command.
 *
 * After the repo-root-resolve-exactly-once change, runInit no longer calls git directly.
 * The git-repository requirement is enforced at the dispatch level via requiresRepo: true.
 *
 * TC-002: COMMANDS.init has requiresRepo: true (dispatch guard is present)
 * TC-003: runInit with a provided repoRoot succeeds (no internal git check)
 *
 * Pool: forks — each test file runs in its own process, so module cache is isolated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-guard-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// TC-002: dispatch guard — COMMANDS.init has requiresRepo: true
// Source: repo-root-resolve-exactly-once > Scenario: adding re-resolution trips the invariant
describe("TC-002: COMMANDS.init は requiresRepo: true を持つ（dispatch guard が存在する）", () => {
  it("TC-002: COMMANDS.init.requiresRepo === true (ゲートが dispatch レベルに移動した)", async () => {
    const { COMMANDS } = await import("../src/cli/command-registry.js");
    const initCmd = COMMANDS["init"] as { requiresRepo?: boolean };
    // After conversion: dispatch guard is at command-registry level (requiresRepo: true)
    // Before conversion: no requiresRepo; gate was inside runInit via spawnCommand
    expect(initCmd.requiresRepo).toBe(true);
  });
});

// TC-003: runInit with a provided repoRoot creates scaffold without calling git
// Source: repo-root-resolve-exactly-once > T-02
describe("TC-003: runInit は repoRoot が渡されれば git を呼ばずにスキャフォルドを作成する", () => {
  it("TC-003: runInit({ repoRoot: gitTempDir }) が exit 0 でスキャフォルドを作成する", async () => {
    // runInit no longer calls spawnCommand — it uses the provided repoRoot directly
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ repoRoot: tempDir });

    // Must return 0 — repoRoot is provided, no git check needed
    expect(result).toBe(0);

    // Verify scaffold was created in the provided repoRoot (tempDir)
    const draftsDir = path.join(tempDir, "specrunner", "drafts");
    const changesDir = path.join(tempDir, "specrunner", "changes");
    await expect(fs.access(draftsDir).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(changesDir).then(() => undefined)).resolves.toBeUndefined();
  });
});
