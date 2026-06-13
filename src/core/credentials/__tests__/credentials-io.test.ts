/**
 * Unit tests for credentials-io: load/save, atomic write, 0600 permissions,
 * field preservation, and validation of anthropic.claudeCodeOAuthToken.
 *
 * TC-012: full credentials payload (github.token + apiKey + claudeCodeOAuthToken) loads correctly
 * TC-013: malformed claudeCodeOAuthToken is rejected
 * TC-014: saveCredentials preserves atomic write + 0600 mode + existing fields
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadCredentials, saveCredentials } from "../credentials-io.js";

// ── Mock xdg to isolate from real home dir ─────────────────────────────────
vi.mock("../../../util/xdg.js", () => ({
  getCredentialsPath: vi.fn().mockReturnValue("/fake/credentials.json"),
}));

// ── Mock atomic-write to verify it is called ──────────────────────────────
vi.mock("../../../util/atomic-write.js", () => ({
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

import { atomicWriteJson } from "../../../util/atomic-write.js";
const mockAtomicWrite = vi.mocked(atomicWriteJson);

// ── Mock fs/promises to control file reads ────────────────────────────────
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  stat: vi.fn().mockResolvedValue({ mode: 0o100600 }),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import * as fsPromises from "node:fs/promises";

function mockReadFileWith(content: string): void {
  // vitest mocks .readFile to return a string when given utf-8 encoding
  vi.mocked(fsPromises.readFile).mockResolvedValue(content as unknown as Awaited<ReturnType<typeof fsPromises.readFile>>);
}

function mockReadFileError(code: string): void {
  vi.mocked(fsPromises.readFile).mockRejectedValue(Object.assign(new Error(code), { code }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(atomicWriteJson).mockResolvedValue(undefined);
  vi.mocked(fsPromises.stat).mockResolvedValue({ mode: 0o100600 } as Awaited<ReturnType<typeof fsPromises.stat>>);
  vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: Full credentials payload with claudeCodeOAuthToken
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012: loadCredentials — full payload with claudeCodeOAuthToken", () => {
  it("returns all fields when credentials contains github.token, apiKey, and claudeCodeOAuthToken", async () => {
    const fullCreds = {
      github: { token: "ghp_test" },
      anthropic: { apiKey: "sk-ant-test", claudeCodeOAuthToken: "claude-oauth-test" },
    };
    mockReadFileWith(JSON.stringify(fullCreds));

    const result = await loadCredentials();
    expect(result.github?.token).toBe("ghp_test");
    expect(result.anthropic?.apiKey).toBe("sk-ant-test");
    expect(result.anthropic?.claudeCodeOAuthToken).toBe("claude-oauth-test");
  });

  it("claudeCodeOAuthToken is optional — absent field loads cleanly", async () => {
    mockReadFileWith(JSON.stringify({ github: { token: "ghp_test" }, anthropic: { apiKey: "sk-test" } }));

    const result = await loadCredentials();
    expect(result.anthropic?.claudeCodeOAuthToken).toBeUndefined();
    expect(result.github?.token).toBe("ghp_test");
  });

  it("returns empty object on ENOENT (no credentials file)", async () => {
    mockReadFileError("ENOENT");

    const result = await loadCredentials();
    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: Malformed claudeCodeOAuthToken validation
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-013: loadCredentials — malformed claudeCodeOAuthToken is rejected", () => {
  it("throws when anthropic.claudeCodeOAuthToken is a number", async () => {
    mockReadFileWith(JSON.stringify({ anthropic: { claudeCodeOAuthToken: 12345 } }));

    await expect(loadCredentials()).rejects.toThrow(/claudeCodeOAuthToken must be a string/i);
  });

  it("throws when anthropic.claudeCodeOAuthToken is an object", async () => {
    mockReadFileWith(JSON.stringify({ anthropic: { claudeCodeOAuthToken: { nested: true } } }));

    await expect(loadCredentials()).rejects.toThrow(/claudeCodeOAuthToken must be a string/i);
  });

  it("throws when anthropic.claudeCodeOAuthToken is null", async () => {
    mockReadFileWith(JSON.stringify({ anthropic: { claudeCodeOAuthToken: null } }));

    await expect(loadCredentials()).rejects.toThrow(/claudeCodeOAuthToken must be a string/i);
  });

  it("error message does not include any token value", async () => {
    mockReadFileWith(JSON.stringify({ anthropic: { claudeCodeOAuthToken: 99999 } }));

    const err = await loadCredentials().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("99999");
  });

  it("still validates github.token as string when anthropic is invalid", async () => {
    mockReadFileWith(JSON.stringify({ github: { token: 999 } }));

    await expect(loadCredentials()).rejects.toThrow(/github.token must be a string/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: saveCredentials — atomic write + 0600 + field preservation
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-014: saveCredentials — atomic write and field preservation", () => {
  it("calls atomicWriteJson (not fs.writeFile directly)", async () => {
    mockReadFileError("ENOENT");

    await saveCredentials({ anthropic: { claudeCodeOAuthToken: "oauth-tok" } });

    expect(mockAtomicWrite).toHaveBeenCalledOnce();
  });

  it("writes with mode 0o600 (TC-014 security)", async () => {
    mockReadFileError("ENOENT");

    await saveCredentials({ anthropic: { claudeCodeOAuthToken: "oauth-tok" } });

    const [, , opts] = mockAtomicWrite.mock.calls[0]!;
    expect((opts as { mode?: number }).mode).toBe(0o600);
  });

  it("merges with existing github.token when saving claudeCodeOAuthToken", async () => {
    mockReadFileWith(JSON.stringify({ github: { token: "ghp_existing" } }));

    await saveCredentials({ anthropic: { claudeCodeOAuthToken: "new-oauth" } });

    const [, mergedData] = mockAtomicWrite.mock.calls[0]!;
    const creds = mergedData as Record<string, unknown>;
    const github = creds["github"] as { token: string } | undefined;
    expect(github?.token).toBe("ghp_existing");
    const anthropic = creds["anthropic"] as { claudeCodeOAuthToken: string } | undefined;
    expect(anthropic?.claudeCodeOAuthToken).toBe("new-oauth");
  });

  it("merges with existing anthropic.apiKey when saving claudeCodeOAuthToken", async () => {
    mockReadFileWith(JSON.stringify({ anthropic: { apiKey: "sk-ant-existing" } }));

    await saveCredentials({ anthropic: { claudeCodeOAuthToken: "new-oauth" } });

    const [, mergedData] = mockAtomicWrite.mock.calls[0]!;
    const anthropic = (mergedData as Record<string, unknown>)["anthropic"] as Record<string, string>;
    expect(anthropic["apiKey"]).toBe("sk-ant-existing");
    expect(anthropic["claudeCodeOAuthToken"]).toBe("new-oauth");
  });

  it("preserves all three fields when all are present", async () => {
    mockReadFileWith(JSON.stringify({
      github: { token: "ghp_existing" },
      anthropic: { apiKey: "sk-ant-existing" },
    }));

    await saveCredentials({ anthropic: { claudeCodeOAuthToken: "oauth-new" } });

    const [, mergedData] = mockAtomicWrite.mock.calls[0]!;
    const creds = mergedData as Record<string, unknown>;
    const github = creds["github"] as { token: string };
    const anthropic = creds["anthropic"] as { apiKey: string; claudeCodeOAuthToken: string };
    expect(github.token).toBe("ghp_existing");
    expect(anthropic.apiKey).toBe("sk-ant-existing");
    expect(anthropic.claudeCodeOAuthToken).toBe("oauth-new");
  });
});
