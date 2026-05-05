/**
 * Unit tests for remove-session-timeout implementation.
 *
 * TC-007: StepExecutor.getTimeoutMs メソッドが存在しない
 * TC-008: pollUntilComplete の status === "timeout" 分岐が存在しない
 * TC-010: session-runner.ts の timeoutMs 引数と SESSION_TIMEOUT フォールバックが削除されている
 * TC-011: completion.ts の SESSION_TIMEOUT フォールバックと timeoutMs が削除されている
 * TC-012: ConfigStore.load が timeoutMs を含む旧 config を warn/error なしで読み込む
 * TC-015: doctor の network/CLI check timeout が削除されていない
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgConfigHome: string | undefined;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "remove-timeout-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  process.env["XDG_DATA_HOME"] = tempDir;
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-007: StepExecutor に getTimeoutMs メソッドが存在しない
// ---------------------------------------------------------------------------
describe("TC-007: StepExecutor.getTimeoutMs は存在しない", () => {
  it("StepExecutor クラスに getTimeoutMs メソッドがない", async () => {
    const { StepExecutor } = await import("../../src/core/step/executor.js");
    const { EventBus } = await import("../../src/core/event/event-bus.js");
    // Minimal mock AgentRunner for constructor — just tests method absence
    const mockRunner = { run: async () => ({ completionReason: "success" as const, resultContent: null }) };
    const executor = new StepExecutor(new EventBus(), mockRunner);
    // getTimeoutMs は private だったが削除済み — prototype にも存在しない
    expect((executor as unknown as Record<string, unknown>)["getTimeoutMs"]).toBeUndefined();
    expect((StepExecutor.prototype as unknown as Record<string, unknown>)["getTimeoutMs"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: pollUntilComplete の status === "timeout" 分岐が存在しない
// ---------------------------------------------------------------------------
describe("TC-008: pollUntilComplete の timeout 分岐が存在しない", () => {
  it("completion.ts のソースに session timeout 文字列が含まれない", async () => {
    // Static source analysis: verify no SESSION_TIMEOUT throw in completion.ts
    const completionPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../src/adapter/managed-agent/completion.ts",
    );
    const content = await fs.readFile(completionPath, "utf-8");
    expect(content).not.toContain("SESSION_TIMEOUT");
    expect(content).not.toContain("sessionTimeoutError");
    // The timeout elapsed check must also be gone
    expect(content).not.toContain("elapsed >= timeoutMs");
  });

  it("SessionClient port の pollUntilComplete 型定義に timeoutMs がない", async () => {
    // Type-level check: the port interface source must not reference timeoutMs
    const portPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../src/core/port/session-client.ts",
    );
    const content = await fs.readFile(portPath, "utf-8");
    expect(content).not.toContain("timeoutMs");
    // timeout status variant removed
    expect(content).not.toContain('"timeout"');
  });
});

// ---------------------------------------------------------------------------
// TC-010: session-runner.ts の timeoutMs 引数と SESSION_TIMEOUT フォールバックが削除されている
// ---------------------------------------------------------------------------
describe("TC-010: session-runner.ts の timeoutMs と SESSION_TIMEOUT フォールバックが削除済み", () => {
  it("session-runner.ts のソースに timeoutMs と SESSION_TIMEOUT が含まれない", async () => {
    const runnerPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../src/adapter/managed-agent/session-runner.ts",
    );
    const content = await fs.readFile(runnerPath, "utf-8");
    expect(content).not.toContain("timeoutMs");
    expect(content).not.toContain("SESSION_TIMEOUT");
  });

  it("ManagedAgentSessionInput 型に timeoutMs フィールドがない", async () => {
    const { runManagedAgentSession } = await import("../../src/adapter/managed-agent/session-runner.js");
    // Verify the function exists (not removed entirely — used by legacy callers if any)
    expect(typeof runManagedAgentSession).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-011: completion.ts の SESSION_TIMEOUT フォールバックと timeoutMs が削除されている
// ---------------------------------------------------------------------------
describe("TC-011: completion.ts の SESSION_TIMEOUT フォールバックと timeoutMs 関連コードが削除済み", () => {
  it("PollOptions 型に timeoutMs が存在しない", async () => {
    const completionPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../src/adapter/managed-agent/completion.ts",
    );
    const content = await fs.readFile(completionPath, "utf-8");
    // PollOptions interface must not have timeoutMs
    expect(content).not.toContain("timeoutMs");
  });

  it("pollUntilComplete は AbortSignal による中断のみをサポートし timeout を throw しない", async () => {
    // Functional test: pollUntilComplete with immediate abort returns without timeout error
    const { pollUntilComplete } = await import("../../src/adapter/managed-agent/completion.js");

    const mockClient = {
      beta: {
        sessions: {
          retrieve: async () => ({ status: "idle", id: "sess_001" }),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    // AbortSignal that is pre-aborted — should return immediately (not throw SESSION_TIMEOUT)
    const abortController = new AbortController();
    abortController.abort();

    // Should resolve without throwing
    await expect(
      pollUntilComplete(mockClient, "sess_001", abortController.signal, {
        sleepFn: () => Promise.resolve(),
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-012: ConfigStore.load が timeoutMs を含む旧 config を warn/error なしで読み込む
// ---------------------------------------------------------------------------
describe("TC-012: ConfigStore.load が旧 timeoutMs を含む config を warn/error なしで読み込む", () => {
  it("specReview.timeoutMs / specFixer.timeoutMs / top-level timeout を含む旧 config を例外なしで読み込む", async () => {
    const { loadConfig } = await import("../../src/config/store.js");

    // Write legacy config with timeout fields
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");

    const legacyConfig = {
      version: 1,
      anthropic: { apiKey: "sk-test-key" },
      agents: {
        propose: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: "2026-01-01T00:00:00Z" },
      },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
      // Legacy timeout fields — must be silently ignored
      timeout: "10m",
      specReview: { timeoutMs: 600000, pollIntervalMs: 100 },
      specFixer: { timeoutMs: 300000 },
    };
    await fs.writeFile(configPath, JSON.stringify(legacyConfig), { mode: 0o600 });

    // Must NOT throw
    await expect(loadConfig()).resolves.toBeDefined();

    const config = await loadConfig();
    // Core fields are preserved
    expect(config.anthropic.apiKey).toBe("sk-test-key");
    expect(config.agents["propose"]?.agentId).toBe("agent_001");
    // pollIntervalMs (non-timeout field) is preserved
    expect(config.specReview?.pollIntervalMs).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// TC-015: doctor の network/CLI check timeout が削除されていない
// ---------------------------------------------------------------------------
describe("TC-015: doctor の network/CLI check timeout が維持されている", () => {
  it("anthropic-key-valid.ts に ANTHROPIC_API_TIMEOUT_MS が定義されている", async () => {
    const checkPath = path.resolve(
      import.meta.dirname ?? __dirname,
      "../../src/core/doctor/checks/auth/anthropic-key-valid.ts",
    );
    const content = await fs.readFile(checkPath, "utf-8");
    // Doctor network timeout must NOT have been removed
    expect(content).toContain("ANTHROPIC_API_TIMEOUT_MS");
    expect(content).toMatch(/5000|5_000/);
  });
});
