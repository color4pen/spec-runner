/**
 * Unit tests for src/core/credentials/credentials-io.ts — shape check.
 *
 * TC-CREDIO-001: valid { github: { token: "ghp_x" } } → returned as-is
 * TC-CREDIO-002: anthropic-only → no throw
 * TC-CREDIO-003: github.token is a number → throw CONFIG_INVALID
 * TC-CREDIO-004: github has no token field → throw CONFIG_INVALID
 * TC-CREDIO-005: github is a string → throw CONFIG_INVALID
 * TC-CREDIO-006: malformed JSON → returns {}
 * TC-CREDIO-007: file absent → returns {}
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cred-io-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

// TC-CREDIO-001
describe("TC-CREDIO-001: valid github credentials", () => {
  it("returns parsed object when github.token is a string", async () => {
    await writeCredentials({ github: { token: "ghp_x" } });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    const creds = await loadCredentials();
    expect(creds.github?.token).toBe("ghp_x");
  });
});

// TC-CREDIO-002
describe("TC-CREDIO-002: anthropic-only credentials", () => {
  it("does not throw for anthropic-only credentials", async () => {
    await writeCredentials({ anthropic: { apiKey: "sk-x" } });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    await expect(loadCredentials()).resolves.not.toThrow();
    const creds = await loadCredentials();
    expect((creds as Record<string, unknown>)["anthropic"]).toBeDefined();
  });
});

// TC-CREDIO-003
describe("TC-CREDIO-003: github.token is a number", () => {
  it("throws CONFIG_INVALID when github.token is a number", async () => {
    await writeCredentials({ github: { token: 123 } });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    await expect(loadCredentials()).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await expect(loadCredentials()).rejects.toThrow(/github\.token must be a string/);
  });
});

// TC-CREDIO-004
describe("TC-CREDIO-004: github object has no token field", () => {
  it("throws CONFIG_INVALID when github has no token", async () => {
    await writeCredentials({ github: {} });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    await expect(loadCredentials()).rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await expect(loadCredentials()).rejects.toThrow(/github\.token must be a string/);
  });
});

// TC-CREDIO-005
describe("TC-CREDIO-005: github is a string", () => {
  it("throws CONFIG_INVALID when github is a string (not an object)", async () => {
    await writeCredentials({ github: "bad" });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    await expect(loadCredentials()).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});

// TC-CREDIO-006
describe("TC-CREDIO-006: malformed JSON", () => {
  it("returns {} when file contains malformed JSON", async () => {
    await fs.mkdir(credDir(), { recursive: true });
    await fs.writeFile(credPath(), "{ not json", { mode: 0o600 });
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    const result = await loadCredentials();
    expect(result).toEqual({});
  });
});

// TC-CREDIO-007
describe("TC-CREDIO-007: file absent", () => {
  it("returns {} when credentials file does not exist", async () => {
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");
    const result = await loadCredentials();
    expect(result).toEqual({});
  });
});
