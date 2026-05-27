import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-test-"));
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
});

describe("runInit — config scaffold generation", () => {
  it("creates a config file with version:1 and steps.defaults", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.version).toBe(1);
    expect(config.steps?.defaults).toBeDefined();
    expect(config.steps.defaults.model).toBe("claude-sonnet-4-6");
    expect(config.steps.defaults.maxTurns).toBeNull();
    expect(config.steps.defaults.timeoutMs).toBeNull();
  });

  it("does not write anthropic field to config", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.anthropic).toBeUndefined();
  });

  it("does not write runtime field to config (defaults to local)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.runtime).toBeUndefined();
  });

  it("creates config with 0600 permissions", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const stat = await fs.stat(configPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("--runtime managed returns exit code 2 (deprecated flag is arg error)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ runtime: "managed" });
    expect(result).toBe(2);
  });

  it("--runtime local returns exit code 2 (deprecated flag is arg error)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ runtime: "local" });
    expect(result).toBe(2);
  });
});

// TC-010: init で steps セクションなしの config に steps.defaults が追加される
describe("TC-010: specrunner init で steps.defaults が追加される", () => {
  it("steps フィールドがない config に steps.defaults を追加する", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps).toBeDefined();
    expect(config.steps.defaults).toBeDefined();
    expect(config.steps.defaults.model).toBe("claude-sonnet-4-6");
    expect(config.steps.defaults.maxTurns).toBeNull();
    expect(config.steps.defaults.timeoutMs).toBeNull();
  });
});

// TC-011: init で既存の steps がある場合は上書きされない
describe("TC-011: specrunner init で既存の steps は上書きされない", () => {
  it("steps.defaults.maxTurns: 90 がある既存 config を保持する", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: {
        defaults: {
          maxTurns: 90,
          model: "claude-haiku-4-5",
        },
      },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps.defaults.maxTurns).toBe(90);
    expect(config.steps.defaults.model).toBe("claude-haiku-4-5");
  });
});
