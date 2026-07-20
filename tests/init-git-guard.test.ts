/**
 * Unit tests for the git-repository gate in runInit.
 *
 * TC-002: git guard — spawnCommand non-zero exit causes non-zero runInit exit (breakage confirmation)
 * TC-003: git binary unavailable — runInit stops with non-zero exit and reports the error
 *
 * These tests mock spawnCommand to isolate the guard logic from real git invocation.
 * Pool: forks — each test file runs in its own process, so module cache is isolated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Mock spawnCommand before any module that imports it is loaded.
// vi.mock is hoisted, so init.ts will receive the mocked version on first import.
vi.mock("../src/util/spawn.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../src/util/spawn.js";
const mockSpawnCommand = vi.mocked(spawnCommand);

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

// TC-002: git guard — spawnCommand non-zero exit causes non-zero runInit exit (breakage confirmation)
// Source: spec.md > Scenario: reverting the fix regresses the non-git guard
describe("TC-002: git guard 単体 — spawnCommand 非ゼロ exit が runInit 非ゼロ exit を引き起こす（破壊確認）", () => {
  it("TC-002: spawnCommand が exitCode 128 を返すと runInit は 1 を返す（ゲート撤廃で 0 になり落ちる）", async () => {
    // Simulate git reporting: not a git repository (exitCode 128 is git's standard non-repo code)
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository (or any of the parent directories): .git",
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    // ANTI-REGRESSION: Without the git gate, spawnCommand returning exitCode 128 is silently
    // ignored and runInit proceeds to create config, returning 0. If the gate is removed,
    // this assertion fails — confirming the regression (TC-002 breakage scenario).
    // The TC-001 integration test in init.test.ts validates this at the real git level.
    expect(result).not.toBe(0);
    expect(result).toBe(1);

    // No global config created (gate fired before config resolution)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });
});

// TC-003: git binary unavailable — runInit stops with non-zero exit and stderr reports the error
// Source: spec.md > Scenario: unavailable git binary is reported as an error
describe("TC-003: git バイナリ不在 — runInit が非ゼロ exit で停止し stderr にエラーを報告する", () => {
  it("TC-003: spawnCommand が exitCode null (ENOENT) を返すと runInit は 1 を返し stderr に git エラーが出る", async () => {
    // Simulate git binary not found — spawnCommand returns exitCode: null when spawn fails (ENOENT)
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: null,
      stdout: "",
      stderr: "spawn git ENOENT",
    });

    const stderrCapture: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrCapture.push(String(chunk));
      return true;
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    // Must return non-zero (environment error = 1)
    expect(result).toBe(1);

    // stderr must contain an error message mentioning git
    const stderrText = stderrCapture.join("");
    expect(stderrText.toLowerCase()).toMatch(/git/);

    // No global config created (gate fired before config resolution)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });
});
