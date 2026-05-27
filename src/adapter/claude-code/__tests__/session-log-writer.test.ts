/**
 * Unit tests for SessionLogWriter.
 *
 * T-027: write error → fd closed, no-op thereafter
 * T-023/T-024/T-025: session summary contains session ID, model, token usage
 * T-026: sensitive values are masked
 * T-028: getAgentLogDir returns correct path
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SessionLogWriter } from "../session-log-writer.js";
import { getAgentLogDir } from "../../../util/xdg.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "session-log-test-"));
});

afterEach(async () => {
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

function readJsonLines(filePath: string): Record<string, unknown>[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// T-023/T-024/T-025: session summary fields
describe("SessionLogWriter: writeSummary", () => {
  it("T-023: session ID is recorded in summary", () => {
    const logPath = path.join(tempDir, "test-step-1.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.writeSummary({ sessionId: "sess-abc-123", model: "claude-sonnet-4-6", modelUsage: undefined });
    writer.close();

    const lines = readJsonLines(logPath);
    const summary = lines.find((l) => l["type"] === "session:summary");
    expect(summary).toBeDefined();
    expect(summary!["sessionId"]).toBe("sess-abc-123");
  });

  it("T-024: model name is recorded in summary", () => {
    const logPath = path.join(tempDir, "test-step-1.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.writeSummary({ sessionId: "sess-xyz", model: "claude-opus-4-7", modelUsage: undefined });
    writer.close();

    const lines = readJsonLines(logPath);
    const summary = lines.find((l) => l["type"] === "session:summary");
    expect(summary!["model"]).toBe("claude-opus-4-7");
  });

  it("T-025: token usage is recorded in summary", () => {
    const logPath = path.join(tempDir, "test-step-1.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.writeSummary({
      sessionId: "sess-xyz",
      model: "claude-sonnet-4-6",
      modelUsage: {
        "claude-sonnet-4-6": {
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadInputTokens: 200,
          cacheCreationInputTokens: 100,
        },
      },
    });
    writer.close();

    const lines = readJsonLines(logPath);
    const summary = lines.find((l) => l["type"] === "session:summary");
    expect(summary!["modelUsage"]).toBeDefined();
    const usage = summary!["modelUsage"] as Record<string, unknown>;
    expect(usage["claude-sonnet-4-6"]).toBeDefined();
  });

  it("records null session ID when not provided", () => {
    const logPath = path.join(tempDir, "test-step-1.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.writeSummary({ sessionId: undefined, model: "claude-sonnet-4-6", modelUsage: undefined });
    writer.close();

    const lines = readJsonLines(logPath);
    const summary = lines.find((l) => l["type"] === "session:summary");
    expect(summary!["sessionId"]).toBeNull();
  });
});

// SessionLogWriter: write messages
describe("SessionLogWriter: write messages", () => {
  it("writes a JSONL entry for each message", () => {
    const logPath = path.join(tempDir, "messages.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.write({ type: "assistant", content: [{ type: "text", text: "Hello" }] });
    writer.write({ type: "tool_use", name: "Bash", input: {} });
    writer.close();

    const lines = readJsonLines(logPath);
    expect(lines).toHaveLength(2);
    expect(lines[0]!["type"]).toBe("assistant");
    expect(lines[1]!["type"]).toBe("tool_use");
  });

  it("each line has a ts field", () => {
    const logPath = path.join(tempDir, "messages.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.write({ type: "assistant" });
    writer.close();

    const lines = readJsonLines(logPath);
    expect(lines[0]!["ts"]).toBeDefined();
    expect(typeof lines[0]!["ts"]).toBe("string");
  });

  it("creates intermediate directories", () => {
    const logPath = path.join(tempDir, "sub", "dir", "step-1.jsonl");
    expect(fs.existsSync(path.dirname(logPath))).toBe(false);
    const writer = new SessionLogWriter(logPath);
    writer.write({ type: "test" });
    writer.close();
    expect(fs.existsSync(logPath)).toBe(true);
  });
});

// T-027: write error resilience
describe("T-027: write error → fd closed, no-op thereafter", () => {
  it("does not throw when write fails after close", () => {
    const logPath = path.join(tempDir, "test.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.close(); // close before any write
    expect(() => {
      writer.write({ type: "test" });
    }).not.toThrow();
  });

  it("close() is idempotent", () => {
    const logPath = path.join(tempDir, "test.jsonl");
    const writer = new SessionLogWriter(logPath);
    expect(() => {
      writer.close();
      writer.close();
    }).not.toThrow();
  });
});

// T-026: sensitive values are masked
describe("T-026: sensitive values are masked", () => {
  it("masks Anthropic API keys in session log entries", () => {
    const logPath = path.join(tempDir, "masked.jsonl");
    const writer = new SessionLogWriter(logPath);
    // Use a key with underscore so prefix extraction works
    writer.write({ type: "text", content: "token=sk-ant-api_MYVERYSECRETSECRET" });
    writer.close();

    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).not.toContain("sk-ant-api_MYVERYSECRETSECRET");
    // The raw value is not present (masked form has prefix + ...)
    expect(content).not.toContain("MYVERYSECRETSECRET");
  });

  it("masks GitHub OAuth tokens (gho_) in session log entries", () => {
    const logPath = path.join(tempDir, "masked.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.write({ type: "text", token: "gho_MYGITHUBOAUTHTOKEN1234" });
    writer.close();

    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).not.toContain("gho_MYGITHUBOAUTHTOKEN1234");
    expect(content).toContain("gho_...");
  });

  it("masks GitHub PAT tokens (ghp_) in session log entries", () => {
    const logPath = path.join(tempDir, "masked.jsonl");
    const writer = new SessionLogWriter(logPath);
    writer.write({ type: "text", token: "ghp_MYGITHUBPERSTOKEN12345" });
    writer.close();

    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).not.toContain("ghp_MYGITHUBPERSTOKEN12345");
    expect(content).toContain("ghp_...");
  });
});

// T-028: getAgentLogDir path
describe("T-028: getAgentLogDir returns correct path", () => {
  it("returns <repoRoot>/.specrunner/logs/<jobId>/", () => {
    const result = getAgentLogDir("/Users/user/myrepo", "abc-def-123");
    expect(result).toBe("/Users/user/myrepo/.specrunner/logs/abc-def-123");
  });

  it("uses path.join semantics correctly", () => {
    const result = getAgentLogDir("/my/repo", "job-456");
    expect(result).toContain("job-456");
    expect(result).toContain(".specrunner");
    expect(result).toContain("logs");
  });
});
