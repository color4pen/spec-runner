import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("../../../src/adapter/managed-agent/client.js", () => ({
  createAnthropicClient: () => currentMockSdk,
}));

// Prevent project local .specrunner/config.json from being loaded during tests.
// Without this, the worktree's project local config (added by this PR) would be
// deep-merged with the test config, overriding runtime: "managed" → "local".
vi.mock("../../../src/util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn().mockResolvedValue(null),
  resolveRepoRootOrFail: vi.fn().mockResolvedValue(null),
}));

// readline mock — createInterface is a vi.fn() so we can configure per-test
vi.mock("node:readline", () => ({
  createInterface: vi.fn(),
}));

let currentMockSdk: ReturnType<typeof buildMockSdk>;

function buildMockSdk(
  opts: {
    envDeleteStatus?: "ok" | "error" | "404";
    agentRetrieveStatus?: "ok" | "404";
  } = {},
) {
  const { envDeleteStatus = "ok", agentRetrieveStatus = "404" } = opts;

  let createCount = 0;
  return {
    beta: {
      agents: {
        create: vi.fn().mockImplementation(() => {
          createCount++;
          return Promise.resolve({ id: `agent_new_${String(createCount).padStart(3, "0")}`, version: 1 });
        }),
        retrieve:
          agentRetrieveStatus === "ok"
            ? vi.fn().mockResolvedValue({ id: "agent_existing_001", version: 1 })
            : vi.fn().mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 })),
        update: vi.fn().mockResolvedValue({ id: "agent_001", version: 2 }),
        archive: vi.fn().mockResolvedValue({}),
      },
      environments: {
        create: vi.fn().mockResolvedValue({ id: "env_new_001" }),
        retrieve: vi.fn().mockResolvedValue({ id: "env_existing_001" }),
        delete:
          envDeleteStatus === "ok"
            ? vi.fn().mockResolvedValue({})
            : envDeleteStatus === "404"
            ? vi.fn().mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }))
            : vi.fn().mockRejectedValue(new Error("Delete failed")),
      },
    },
  };
}

let tempDir: string;
let originalXdgConfigHome: string | undefined;
let originalApiKey: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-managed-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  originalApiKey = process.env["SPECRUNNER_API_KEY"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  currentMockSdk = buildMockSdk();
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  if (originalApiKey !== undefined) {
    process.env["SPECRUNNER_API_KEY"] = originalApiKey;
  } else {
    delete process.env["SPECRUNNER_API_KEY"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Helper: write a config file in tempDir
async function writeConfig(config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(tempDir, "specrunner");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(config), { mode: 0o600 });
}

// Helper: read saved config
async function readConfig(): Promise<Record<string, unknown>> {
  const configPath = path.join(tempDir, "specrunner", "config.json");
  const raw = await fs.readFile(configPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("runManagedSetup", () => {
  it("exits with 1 when SPECRUNNER_API_KEY is not set", async () => {
    delete process.env["SPECRUNNER_API_KEY"];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error("process.exit called");
    });

    const { runManagedSetup } = await import("../../../src/cli/managed.js");
    await expect(runManagedSetup()).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("creates agents and environment, saves config without anthropic field (TC-MS-001)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    const { runManagedSetup } = await import("../../../src/cli/managed.js");
    await runManagedSetup();

    const config = await readConfig();

    expect(config["runtime"]).toBe("managed");
    expect((config["agents"] as Record<string, unknown>)?.["design"]).toBeDefined();
    expect((config["environment"] as Record<string, unknown>)?.["id"]).toBeDefined();
    expect(config["anthropic"]).toBeUndefined();
  });

  it("reuses existing environment and does not call environments.create on 2nd run (TC-MS-002)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    // Pre-populate config with an existing environment
    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: {
        design: { agentId: "agent_existing_001", definitionHash: "old_hash", lastSyncedAt: "2026-01-01T00:00:00Z" },
      },
      environment: { id: "env_existing_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    // agents.retrieve succeeds → existing agent is retrieved, not freshly created
    currentMockSdk = buildMockSdk({ agentRetrieveStatus: "ok" });

    const { runManagedSetup } = await import("../../../src/cli/managed.js");
    await runManagedSetup();

    // environments.create must NOT be called — existing env retrieved
    expect(currentMockSdk.beta.environments.create).not.toHaveBeenCalled();
    expect(currentMockSdk.beta.environments.retrieve).toHaveBeenCalledWith("env_existing_001");

    // Config still has managed runtime and the existing environment id
    const saved = await readConfig();
    expect(saved["runtime"]).toBe("managed");
    expect((saved["environment"] as Record<string, unknown>)?.["id"]).toBe("env_existing_001");
  });

  it("propagates SDK error without swallowing it (TC-MS-004)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-invalid";

    // Simulate auth error from SDK
    currentMockSdk.beta.agents.create = vi.fn().mockRejectedValue(
      Object.assign(new Error("401 Unauthorized: Invalid API key"), { status: 401 }),
    );

    const { runManagedSetup } = await import("../../../src/cli/managed.js");
    // Error must propagate — not swallowed
    await expect(runManagedSetup()).rejects.toThrow();
  });

  it("rolls back created agents when environment creation fails (TC-MS-005)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    // agents.create succeeds but environments.create fails
    currentMockSdk.beta.environments.create = vi.fn().mockRejectedValue(
      new Error("Environment creation failed"),
    );

    const { runManagedSetup } = await import("../../../src/cli/managed.js");
    await expect(runManagedSetup()).rejects.toThrow();

    // archive should have been called to roll back newly created agents
    expect(currentMockSdk.beta.agents.archive).toHaveBeenCalled();

    // config should NOT have been saved
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.readFile(configPath)).rejects.toThrow();
  });
});

describe("runManagedStatus", () => {
  it("shows 'local' message when runtime is not managed", async () => {
    await writeConfig({ version: 1, agents: {} });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toMatch(/local/);
  });

  it("shows stale managed config when runtime is not managed (5-a)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Stale managed config detected:");
    expect(output).toContain("environment.id: env_001");
    expect(output).toContain("agents.design: agent_001");
  });

  it("shows only local message when no stale config (5-b)", async () => {
    await writeConfig({ version: 1, agents: {} });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("local");
    expect(output).not.toContain("Stale");
  });

  it("shows full managed status including agents, environment, and API key (TC-MST-001)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: {
        design: { agentId: "agent_d001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" },
      },
      environment: { id: "env_e001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Runtime: managed");
    expect(output).toContain("SPECRUNNER_API_KEY: set");
    expect(output).toContain("env_e001");
    expect(output).toContain("agent_d001");
  });

  it("lists only agents when only agents are stale (TC-MST-NEW-002)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      // no environment field
    });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Stale managed config detected:");
    expect(output).toContain("agents.design: agent_001");
    expect(output).not.toContain("environment.id");
  });

  it("lists only environment.id when only environment is stale (TC-MST-NEW-003)", async () => {
    await writeConfig({
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedStatus } = await import("../../../src/cli/managed.js");
    await runManagedStatus();

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Stale managed config detected:");
    expect(output).toContain("environment.id: env_001");
    expect(output).not.toContain("agents.");
  });
});

describe("runManagedReset", () => {
  it("resets config agents to {} and removes environment when --force (TC-MR-001)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    currentMockSdk = buildMockSdk({ envDeleteStatus: "ok" });

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: true });

    const saved = await readConfig();
    expect(saved["agents"]).toEqual({});
    expect(saved["environment"]).toBeUndefined();
    expect(saved["runtime"]).toBeUndefined();
  });

  it("executes reset when confirmation prompt answered 'y' (TC-MR-002)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    currentMockSdk = buildMockSdk({ envDeleteStatus: "ok" });

    const readline = await import("node:readline");
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("y")),
      close: vi.fn(),
    } as unknown as import("node:readline").Interface);

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: false });

    expect(currentMockSdk.beta.environments.delete).toHaveBeenCalledWith("env_001");
    const saved = await readConfig();
    expect(saved["agents"]).toEqual({});
    expect(saved["environment"]).toBeUndefined();
  });

  it("aborts without changes when confirmation prompt answered 'n' (TC-MR-003)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    currentMockSdk = buildMockSdk({ envDeleteStatus: "ok" });

    const readline = await import("node:readline");
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("n")),
      close: vi.fn(),
    } as unknown as import("node:readline").Interface);

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: false });

    // SDK delete should NOT be called
    expect(currentMockSdk.beta.environments.delete).not.toHaveBeenCalled();
    // Config should be unchanged
    const saved = await readConfig();
    expect(saved["runtime"]).toBe("managed");
    expect((saved["environment"] as Record<string, unknown>)?.["id"]).toBe("env_001");
  });

  it("outputs orphan agent warning message after reset (TC-MR-004)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    currentMockSdk = buildMockSdk({ envDeleteStatus: "ok" });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: true });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toMatch(/orphan/i);
  });

  it("skips environment delete when environment.id is not set (TC-MR-007)", async () => {
    process.env["SPECRUNNER_API_KEY"] = "sk-test-key";

    await writeConfig({
      version: 1,
      runtime: "managed",
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      // no environment field
    });

    currentMockSdk = buildMockSdk({ envDeleteStatus: "ok" });

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: true });

    expect(currentMockSdk.beta.environments.delete).not.toHaveBeenCalled();
    const saved = await readConfig();
    expect(saved["agents"]).toEqual({});
    expect(saved["environment"]).toBeUndefined();
  });

  it("resets stale config with --force when runtime is not managed (5-d)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    delete process.env["SPECRUNNER_API_KEY"];

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: true });

    const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(stderrOutput).toContain("runtime is");
    expect(stderrOutput).toContain('not "managed"');

    // TC-MR-NEW-012: existing destructive prompt must NOT appear (no double confirmation)
    const stdoutOutput = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(stdoutOutput).not.toContain("This will delete the Anthropic Environment");

    const saved = await readConfig();
    expect(saved["agents"]).toEqual({});
    expect(saved["environment"]).toBeUndefined();
  });

  it("aborts in non-TTY mode without --force when runtime is not managed (5-e)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01T00:00:00Z" },
    });

    // process.stdin.isTTY is undefined in test environment (= non-TTY)
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: false });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("--force");

    // Config should be unchanged
    const saved = await readConfig();
    expect((saved["agents"] as Record<string, unknown>)?.["design"]).toBeDefined();
  });

  it("aborts when user answers 'n' to stale reset prompt (5-f)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    });

    // Mock TTY — save and restore original value
    const originalIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const readline = await import("node:readline");
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("n")),
      close: vi.fn(),
    } as unknown as import("node:readline").Interface);

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: false });

    // Restore isTTY
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });

    const saved = await readConfig();
    expect((saved["agents"] as Record<string, unknown>)?.["design"]).toBeDefined();
  });

  it("does nothing when no stale config and runtime is not managed (5-h)", async () => {
    await writeConfig({ version: 1, agents: {} });

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: true });

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("Nothing to reset");
  });

  it("resets stale config when TTY user answers 'y' (TC-MR-NEW-004)", async () => {
    await writeConfig({
      version: 1,
      agents: { design: { agentId: "agent_001", definitionHash: "hash", lastSyncedAt: "2026-01-01T00:00:00Z" } },
    });

    const originalIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const readline = await import("node:readline");
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((_msg: string, cb: (ans: string) => void) => cb("y")),
      close: vi.fn(),
    } as unknown as import("node:readline").Interface);

    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runManagedReset({ force: false });

    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });

    const saved = await readConfig();
    expect(saved["agents"]).toEqual({});
    expect(saved["environment"]).toBeUndefined();
  });
});
