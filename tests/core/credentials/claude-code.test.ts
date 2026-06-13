import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-code-cred-test-"));
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

describe("resolveClaudeCodeOAuthToken", () => {
  it("returns env source when CLAUDE_CODE_OAUTH_TOKEN is set", async () => {
    await writeCredentials({ anthropic: { claudeCodeOAuthToken: "cred-token" } });
    const { resolveClaudeCodeOAuthToken } = await import("../../../src/core/credentials/claude-code.js");

    const result = await resolveClaudeCodeOAuthToken({ CLAUDE_CODE_OAUTH_TOKEN: "env-token" });

    expect(result).toEqual({ token: "env-token", source: "env" });
  });

  it("falls back to credentials when env is unset", async () => {
    await writeCredentials({ anthropic: { claudeCodeOAuthToken: "cred-token" } });
    const { resolveClaudeCodeOAuthToken } = await import("../../../src/core/credentials/claude-code.js");

    const result = await resolveClaudeCodeOAuthToken({});

    expect(result).toEqual({ token: "cred-token", source: "credentials" });
  });

  it("returns undefined when optional and unset", async () => {
    const { resolveClaudeCodeOAuthToken } = await import("../../../src/core/credentials/claude-code.js");

    await expect(resolveClaudeCodeOAuthToken({}, { optional: true })).resolves.toBeUndefined();
  });
});

describe("saveClaudeCodeOAuthToken", () => {
  it("preserves github.token and anthropic.apiKey", async () => {
    await writeCredentials({
      github: { token: "ghp_existing" },
      anthropic: { apiKey: "sk-ant-existing" },
    });
    const { saveClaudeCodeOAuthToken } = await import("../../../src/core/credentials/claude-code.js");
    const { loadCredentials } = await import("../../../src/core/credentials/credentials-io.js");

    await saveClaudeCodeOAuthToken("claude-token");

    const loaded = await loadCredentials();
    expect(loaded.github?.token).toBe("ghp_existing");
    expect(loaded.anthropic?.apiKey).toBe("sk-ant-existing");
    expect(loaded.anthropic?.claudeCodeOAuthToken).toBe("claude-token");
  });

  it("writes credentials.json with mode no looser than 0600", async () => {
    const { saveClaudeCodeOAuthToken } = await import("../../../src/core/credentials/claude-code.js");

    await saveClaudeCodeOAuthToken("claude-token");

    if (process.platform !== "win32") {
      const stat = await fs.stat(credPath());
      expect(stat.mode & 0o077).toBe(0);
    }
  });
});
