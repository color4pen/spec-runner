/**
 * Unit tests for src/cli/bootstrap.ts
 *
 * TC-BS-001: bootstrap() returns config, githubClient, runtime on success
 * TC-BS-002: bootstrap() propagates SpecRunnerError when loadConfig fails
 * TC-BS-003: bootstrap() propagates generic Error when loadConfig fails
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-test-"));
  // Isolate config path from the user's real ~/.config/specrunner/config.json
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

const mockRepo = { owner: "testowner", name: "testrepo" };

const validConfig = {
  version: 1,
  runtime: "local",
  agents: {},
  pipeline: { maxRetries: 2 },
  github: { accessToken: "gh-token", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
};

async function writeValidConfig() {
  // getConfigPath() returns $XDG_CONFIG_HOME/specrunner/config.json
  // We set XDG_CONFIG_HOME = tempDir in beforeEach
  const configDir = path.join(tempDir, "specrunner");
  await fs.mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, "config.json");
  await fs.writeFile(configPath, JSON.stringify(validConfig), { mode: 0o600 });
}

describe("TC-BS-001: bootstrap() returns BootstrapResult on success", () => {
  it("returns config, githubClient, and runtime when config is valid", async () => {
    await writeValidConfig();

    const { bootstrap } = await import("../../../src/cli/bootstrap.js");
    const result = await bootstrap(tempDir, mockRepo);

    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("githubClient");
    expect(result).toHaveProperty("runtime");
    expect(result.config.runtime).toBe("local");
  });
});

describe("TC-BS-002: bootstrap() propagates error when config is missing", () => {
  it("throws when no config file exists", async () => {
    // Do NOT write a config file — loadConfig should throw
    const { bootstrap } = await import("../../../src/cli/bootstrap.js");

    await expect(bootstrap(tempDir, mockRepo)).rejects.toThrow();
  });

  it("thrown error has code CONFIG_MISSING when file does not exist", async () => {
    const { bootstrap } = await import("../../../src/cli/bootstrap.js");

    await expect(bootstrap(tempDir, mockRepo)).rejects.toMatchObject({
      code: "CONFIG_MISSING",
    });
  });
});
