/**
 * Unit tests for src/core/credentials/github.ts
 *
 * TC-CRED-001: loadCredentials() returns {} when file does not exist (ENOENT)
 * TC-CRED-002: loadCredentials() returns parsed credentials when file exists
 * TC-CRED-003: loadCredentials() returns {} when file contains invalid JSON
 * TC-CRED-004: saveCredentials() writes credentials.json with 0600 permissions
 * TC-CRED-005: saveCredentials() merges with existing credentials
 * TC-CRED-006: resolveGitHubToken() returns credentials-file token (priority 1)
 * TC-CRED-007: resolveGitHubToken() falls back to GITHUB_TOKEN env var
 * TC-CRED-008: resolveGitHubToken() throws SpecRunnerError when no token found
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cred-test-"));
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

// TC-CRED-001
describe("TC-CRED-001: loadCredentials() when file does not exist", () => {
  it("returns empty object when credentials file is absent", async () => {
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    const creds = await loadCredentials();
    expect(creds).toEqual({});
  });
});

// TC-CRED-002
describe("TC-CRED-002: loadCredentials() when file exists", () => {
  it("returns parsed credentials with github token", async () => {
    await writeCredentials({ github: { token: "ghp_abc123" } });
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    const creds = await loadCredentials();
    expect(creds.github?.token).toBe("ghp_abc123");
  });
});

// TC-CRED-003
describe("TC-CRED-003: loadCredentials() with invalid JSON", () => {
  it("returns empty object when JSON is malformed", async () => {
    await fs.mkdir(credDir(), { recursive: true });
    await fs.writeFile(credPath(), "not-json", { mode: 0o600 });
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    const creds = await loadCredentials();
    expect(creds).toEqual({});
  });
});

// TC-CRED-004
describe("TC-CRED-004: saveCredentials() writes with 0600 permissions", () => {
  it("creates credentials.json and the file is readable", async () => {
    const { saveCredentials, loadCredentials } = await import("../../../src/core/credentials/github.js");
    await saveCredentials({ github: { token: "ghp_saved" } });

    const stat = await fs.stat(credPath());
    expect(stat.mode & 0o777).toBe(0o600);

    const loaded = await loadCredentials();
    expect(loaded.github?.token).toBe("ghp_saved");
  });
});

// TC-CRED-005
describe("TC-CRED-005: saveCredentials() merges with existing credentials", () => {
  it("preserves existing keys when saving new credentials", async () => {
    await writeCredentials({ anthropic: { token: "sk-ant-test" } });
    const { saveCredentials, loadCredentials } = await import("../../../src/core/credentials/github.js");
    await saveCredentials({ github: { token: "ghp_merged" } });

    const loaded = await loadCredentials();
    expect(loaded.github?.token).toBe("ghp_merged");
    expect((loaded as Record<string, unknown>)["anthropic"]).toEqual({ token: "sk-ant-test" });
  });
});

// TC-CRED-006
describe("TC-CRED-006: resolveGitHubToken() from credentials file", () => {
  it("returns token from credentials file when present", async () => {
    await writeCredentials({ github: { token: "ghp_fromfile" } });
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const result = await resolveGitHubToken({});
    expect(result.token).toBe("ghp_fromfile");
    expect(result.source).toBe("credentials");
  });
});

// TC-CRED-007
describe("TC-CRED-007: resolveGitHubToken() falls back to GITHUB_TOKEN env", () => {
  it("returns token from GITHUB_TOKEN env when credentials file has no token", async () => {
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    const result = await resolveGitHubToken({ GITHUB_TOKEN: "ghp_fromenv" });
    expect(result.token).toBe("ghp_fromenv");
    expect(result.source).toBe("env");
  });
});

// TC-CRED-008
describe("TC-CRED-008: resolveGitHubToken() throws when no token found", () => {
  it("throws SpecRunnerError with GITHUB_TOKEN_MISSING code", async () => {
    const { resolveGitHubToken } = await import("../../../src/core/credentials/github.js");
    await expect(resolveGitHubToken({})).rejects.toMatchObject({
      code: "GITHUB_TOKEN_MISSING",
    });
  });
});

// TC-CRED-009
describe("TC-CRED-009: loadCredentials() warns on loose permissions (0644)", () => {
  it("emits warning to stderr when credentials file has 0644 permissions", async () => {
    await writeCredentials({ github: { token: "ghp_test" } });
    await fs.chmod(credPath(), 0o644);

    const stderrSpy = vi.spyOn(process.stderr, "write");
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    await loadCredentials();

    const warned = stderrSpy.mock.calls.some((args) =>
      String(args[0]).includes("has loose permissions"),
    );
    expect(warned).toBe(true);
  });
});

// TC-CRED-010
describe("TC-CRED-010: loadCredentials() emits no warning on strict permissions (0600)", () => {
  it("does not emit a loose-permissions warning when file has 0600 permissions", async () => {
    await writeCredentials({ github: { token: "ghp_test" } });
    // writeCredentials already writes with 0600 — ensure it stays that way
    await fs.chmod(credPath(), 0o600);

    const stderrSpy = vi.spyOn(process.stderr, "write");
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    await loadCredentials();

    const warned = stderrSpy.mock.calls.some((args) =>
      String(args[0]).includes("has loose permissions"),
    );
    expect(warned).toBe(false);
  });
});

// TC-CRED-011
describe("TC-CRED-011: loadCredentials() warns on group-readable permissions (0640)", () => {
  it("emits warning to stderr when credentials file has 0640 permissions (regression for 0o077 mask)", async () => {
    await writeCredentials({ github: { token: "ghp_test" } });
    await fs.chmod(credPath(), 0o640);

    const stderrSpy = vi.spyOn(process.stderr, "write");
    const { loadCredentials } = await import("../../../src/core/credentials/github.js");
    await loadCredentials();

    const warned = stderrSpy.mock.calls.some((args) =>
      String(args[0]).includes("has loose permissions"),
    );
    expect(warned).toBe(true);
  });
});
