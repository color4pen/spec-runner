/**
 * Unit tests for src/core/credentials/anthropic.ts
 *
 * TC-ANTH-001: resolveSpecRunnerApiKey() returns credentials.json apiKey (priority 1)
 * TC-ANTH-002: resolveSpecRunnerApiKey() falls back to SPECRUNNER_API_KEY env var
 * TC-ANTH-003: resolveSpecRunnerApiKey() throws ANTHROPIC_KEY_MISSING when both absent
 * TC-ANTH-004: resolveSpecRunnerApiKey({ optional: true }) returns undefined when both absent
 * TC-ANTH-005: resolveSpecRunnerApiKey({ optional: true }) returns credentials value when present
 * TC-ANTH-006: resolveSpecRunnerApiKey({ optional: true }) returns env value when only env set
 * TC-SAVE-001: saveSpecRunnerApiKey() writes to credentials.json
 * TC-SAVE-002: saveSpecRunnerApiKey() preserves existing github.token
 * TC-SAVE-003: saveSpecRunnerApiKey() overwrites existing anthropic.apiKey
 * TC-MERGE-001: saveCredentials({ github }) preserves existing anthropic field
 * TC-MERGE-002: saveCredentials({ anthropic }) preserves existing github field
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "anth-cred-test-"));
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

const credDir = () => path.join(tempDir, "specrunner");
const credPath = () => path.join(tempDir, "specrunner", "credentials.json");

async function writeCredentials(data: unknown): Promise<void> {
  await fs.mkdir(credDir(), { recursive: true });
  await fs.writeFile(credPath(), JSON.stringify(data), { mode: 0o600 });
}

// TC-ANTH-001
describe("TC-ANTH-001: resolveSpecRunnerApiKey() returns credentials.json apiKey (priority 1)", () => {
  it("returns apiKey from credentials file when both credentials and env are set", async () => {
    await writeCredentials({ anthropic: { apiKey: "cred-key" } });
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    const result = await resolveSpecRunnerApiKey({ SPECRUNNER_API_KEY: "env-key" });
    expect(result.apiKey).toBe("cred-key");
    expect(result.source).toBe("credentials");
  });
});

// TC-ANTH-002
describe("TC-ANTH-002: resolveSpecRunnerApiKey() falls back to SPECRUNNER_API_KEY env", () => {
  it("returns apiKey from env when credentials file has no anthropic key", async () => {
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    const result = await resolveSpecRunnerApiKey({ SPECRUNNER_API_KEY: "env-key" });
    expect(result.apiKey).toBe("env-key");
    expect(result.source).toBe("env");
  });
});

// TC-ANTH-003
describe("TC-ANTH-003: resolveSpecRunnerApiKey() throws ANTHROPIC_KEY_MISSING when both absent", () => {
  it("throws SpecRunnerError with ANTHROPIC_KEY_MISSING code", async () => {
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    await expect(resolveSpecRunnerApiKey({})).rejects.toMatchObject({
      code: "ANTHROPIC_KEY_MISSING",
    });
  });
});

// TC-ANTH-004
describe("TC-ANTH-004: resolveSpecRunnerApiKey({ optional: true }) returns undefined when both absent", () => {
  it("returns undefined without throwing", async () => {
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    const result = await resolveSpecRunnerApiKey({}, { optional: true });
    expect(result).toBeUndefined();
  });
});

// TC-ANTH-005
describe("TC-ANTH-005: resolveSpecRunnerApiKey({ optional: true }) returns credentials value when present", () => {
  it("returns apiKey from credentials when optional and credentials exist", async () => {
    await writeCredentials({ anthropic: { apiKey: "cred-key" } });
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    const result = await resolveSpecRunnerApiKey({}, { optional: true });
    expect(result).toBeDefined();
    expect(result!.apiKey).toBe("cred-key");
    expect(result!.source).toBe("credentials");
  });
});

// TC-ANTH-006
describe("TC-ANTH-006: resolveSpecRunnerApiKey({ optional: true }) returns env value when only env set", () => {
  it("returns apiKey from env when optional and only env is set", async () => {
    const { resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    const result = await resolveSpecRunnerApiKey({ SPECRUNNER_API_KEY: "env-key" }, { optional: true });
    expect(result).toBeDefined();
    expect(result!.apiKey).toBe("env-key");
    expect(result!.source).toBe("env");
  });
});

// TC-SAVE-001
describe("TC-SAVE-001: saveSpecRunnerApiKey() writes to credentials.json", () => {
  it("creates credentials.json with anthropic.apiKey", async () => {
    const { saveSpecRunnerApiKey, resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    await saveSpecRunnerApiKey("sk-ant-test123");

    const result = await resolveSpecRunnerApiKey({});
    expect(result.apiKey).toBe("sk-ant-test123");
    expect(result.source).toBe("credentials");
  });
});

// TC-SAVE-002
describe("TC-SAVE-002: saveSpecRunnerApiKey() preserves existing github.token", () => {
  it("keeps github.token intact when saving anthropic apiKey", async () => {
    await writeCredentials({ github: { token: "ghp_existing" } });
    const { saveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    await saveSpecRunnerApiKey("sk-ant-new");

    const raw = await fs.readFile(credPath(), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    expect((data["github"] as { token: string }).token).toBe("ghp_existing");
    expect((data["anthropic"] as { apiKey: string }).apiKey).toBe("sk-ant-new");
  });
});

// TC-SAVE-003
describe("TC-SAVE-003: saveSpecRunnerApiKey() overwrites existing anthropic.apiKey", () => {
  it("updates anthropic.apiKey when called again", async () => {
    await writeCredentials({ anthropic: { apiKey: "sk-ant-old" } });
    const { saveSpecRunnerApiKey, resolveSpecRunnerApiKey } = await import("../../../src/core/credentials/anthropic.js");
    await saveSpecRunnerApiKey("sk-ant-new");

    const result = await resolveSpecRunnerApiKey({});
    expect(result.apiKey).toBe("sk-ant-new");
  });
});

// TC-MERGE-001: deep merge test — github preserves anthropic
describe("TC-MERGE-001: saveCredentials({ github }) preserves existing anthropic field", () => {
  it("preserves anthropic.apiKey when saving github token", async () => {
    await writeCredentials({ anthropic: { apiKey: "sk-ant-existing" } });
    const { saveCredentials, loadCredentials } = await import("../../../src/core/credentials/github.js");
    await saveCredentials({ github: { token: "ghp_new" } });

    const loaded = await loadCredentials();
    expect(loaded.github?.token).toBe("ghp_new");
    expect(loaded.anthropic?.apiKey).toBe("sk-ant-existing");
  });
});

// TC-MERGE-002: deep merge test — anthropic preserves github
describe("TC-MERGE-002: saveCredentials({ anthropic }) preserves existing github field", () => {
  it("preserves github.token when saving anthropic apiKey", async () => {
    await writeCredentials({ github: { token: "ghp_existing" } });
    const { saveCredentials, loadCredentials } = await import("../../../src/core/credentials/github.js");
    await saveCredentials({ anthropic: { apiKey: "sk-ant-new" } });

    const loaded = await loadCredentials();
    expect(loaded.github?.token).toBe("ghp_existing");
    expect(loaded.anthropic?.apiKey).toBe("sk-ant-new");
  });
});
