/**
 * TC-018: init with existing global config + provider flag emits a notice and does NOT modify config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

let tempDir: string;
let gitTempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-notice-test-"));
  gitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-notice-git-"));
  spawnSync("git", ["init"], { cwd: gitTempDir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: gitTempDir });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: gitTempDir });

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
  await fs.rm(gitTempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("TC-018: init with existing config + --provider emits notice and does not modify config", () => {
  it("emits a notice when --provider is passed with existing config", async () => {
    // Pre-create existing config
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const stderrCapture: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrCapture.push(String(chunk));
      return true;
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ provider: "openai", repoRoot: gitTempDir });

    expect(result).toBe(0);

    // logInfo writes to stderr
    const allOutput = stderrCapture.join("");
    // Should mention that provider flag was ignored or is being noticed
    expect(allOutput).toMatch(/provider.*flag.*ignored|--provider.*ignored|ignored.*--provider|note.*--provider|--provider.*note/i);
  });

  it("does not overwrite existing config when --provider is passed", async () => {
    // Pre-create existing config
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "openai", repoRoot: gitTempDir });

    // Config should be unchanged
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.steps?.defaults?.model).toBe("claude-sonnet-4-6");
    expect(config.steps?.design).toBeUndefined();
  });

  it("exits 0 even when --provider is passed with existing config", async () => {
    // Pre-create existing config
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ provider: "openai", repoRoot: gitTempDir });

    expect(result).toBe(0);
  });
});
