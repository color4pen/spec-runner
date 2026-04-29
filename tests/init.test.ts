import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// vi.mock must be at top level (gets hoisted by vitest)
vi.mock("../src/sdk/client.js", () => ({
  createAnthropicClient: () => currentMockSdk,
}));

// Module-level variable to hold mock SDK — updated per test
let currentMockSdk: ReturnType<typeof buildMockSdk>;

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

function buildMockSdk(opts: {
  agentCreateStatus?: "ok" | "error";
  envCreateStatus?: "ok" | "error";
  agentArchiveStatus?: "ok" | "error";
  existingAgentId?: string;
}) {
  const {
    agentCreateStatus = "ok",
    envCreateStatus = "ok",
    agentArchiveStatus = "ok",
    existingAgentId,
  } = opts;

  const agents = {
    create:
      agentCreateStatus === "ok"
        ? vi.fn().mockResolvedValue({ id: "agent_new_001", version: 1 })
        : vi.fn().mockRejectedValue(new Error("Agent creation failed")),
    retrieve: existingAgentId
      ? vi.fn().mockResolvedValue({ id: existingAgentId, version: 1 })
      : vi.fn().mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 })),
    update: vi.fn().mockResolvedValue({ id: existingAgentId ?? "agent_001", version: 2 }),
    archive:
      agentArchiveStatus === "ok"
        ? vi.fn().mockResolvedValue({})
        : vi.fn().mockRejectedValue(new Error("Archive failed")),
  };

  const environments = {
    create:
      envCreateStatus === "ok"
        ? vi.fn().mockResolvedValue({ id: "env_new_001" })
        : vi.fn().mockRejectedValue(new Error("Environment creation failed")),
    retrieve: vi.fn().mockResolvedValue({ id: "env_existing_001" }),
  };

  return { beta: { agents, environments } };
}

// TC-057: specrunner init — 初回実行（config 未作成）
describe("TC-057: specrunner init — first run, no existing config", () => {
  it("creates Agent and Environment, saves config with 0600 permissions", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    currentMockSdk = buildMockSdk({});

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ apiKey: "sk-ant-test-key" });

    // Config should have been created
    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.version).toBe(1);
    expect(config.anthropic?.apiKey).toBe("sk-ant-test-key");
    expect(config.agent?.id).toBeDefined();
    expect(config.environment?.id).toBeDefined();

    // Check permissions
    const stat = await fs.stat(configPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// TC-058: specrunner init — API key が未設定
describe("TC-058: specrunner init — no API key exits with error", () => {
  it("calls process.exit(1) when no API key is available", async () => {
    const savedApiKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error("process.exit called");
    });

    const { runInit } = await import("../src/cli/init.js");

    await expect(runInit({})).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    if (savedApiKey !== undefined) {
      process.env["ANTHROPIC_API_KEY"] = savedApiKey;
    }
  });
});

// TC-059: specrunner init — 既存 Agent/Environment で差分なし（冪等）
describe("TC-059: specrunner init — idempotent when agent hash matches", () => {
  it("does not create new agents when both propose and specFixer hashes match existing", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    // Compute current hashes so we can pre-populate config
    const { computeDefinitionHash, buildAgentDefinition, buildSpecFixerAgentDefinition } = await import(
      "../src/core/agent-definition.js"
    );
    const currentProposeHash = computeDefinitionHash(buildAgentDefinition());
    const currentSpecFixerHash = computeDefinitionHash(buildSpecFixerAgentDefinition());

    // Pre-populate config with matching hashes for both agents
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agent: {
        id: "agent_existing_001",
        definitionHash: currentProposeHash,
        lastSyncedAt: new Date().toISOString(),
      },
      agents: {
        propose: {
          id: "agent_existing_001",
          definitionHash: currentProposeHash,
          lastSyncedAt: new Date().toISOString(),
        },
        specFixer: {
          id: "agent_spec_fixer_001",
          definitionHash: currentSpecFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    // Mock retrieve to succeed for both agents (no 404)
    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockResolvedValue({ id: "agent_new_001", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            if (id === "agent_existing_001") {
              return Promise.resolve({ id: "agent_existing_001", version: 1 });
            }
            if (id === "agent_spec_fixer_001") {
              return Promise.resolve({ id: "agent_spec_fixer_001", version: 1 });
            }
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_existing_001", version: 2 }),
          archive: vi.fn().mockResolvedValue({}),
        },
        environments: {
          create: vi.fn().mockResolvedValue({ id: "env_new_001" }),
          retrieve: vi.fn().mockResolvedValue({ id: "env_existing_001" }),
        },
      },
    };

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ apiKey: "sk-ant-existing" });

    // agents.create should NOT have been called (both hashes match)
    expect(currentMockSdk.beta.agents.create).not.toHaveBeenCalled();
    // agents.update should NOT have been called
    expect(currentMockSdk.beta.agents.update).not.toHaveBeenCalled();
  });
});

// TC-060: specrunner init — Agent 定義に差分がある場合 agents.update
describe("TC-060: specrunner init — calls agents.update when hash differs", () => {
  it("calls agents.update when existing hash differs from current", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    // Pre-populate config with a DIFFERENT (stale) hash
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agent: {
        id: "agent_existing_001",
        definitionHash: "sha256:staleHashValue",
        lastSyncedAt: new Date().toISOString(),
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    currentMockSdk = buildMockSdk({ existingAgentId: "agent_existing_001" });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ apiKey: "sk-ant-existing" });

    // agents.update should have been called because hash differs
    expect(currentMockSdk.beta.agents.update).toHaveBeenCalled();
  });
});

// TC-061: specrunner init — Environment 作成失敗時に Agent を rollback
describe("TC-061: specrunner init — Agent rollback on Environment creation failure", () => {
  it("archives newly created agent when environment creation fails", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    // No existing config — fresh init
    currentMockSdk = buildMockSdk({
      agentCreateStatus: "ok",
      envCreateStatus: "error",
      agentArchiveStatus: "ok",
    });

    const { runInit } = await import("../src/cli/init.js");

    await expect(runInit({ apiKey: "sk-ant-test" })).rejects.toThrow(
      "Environment creation failed",
    );

    // agents.archive should have been called with the newly created agent id
    expect(currentMockSdk.beta.agents.archive).toHaveBeenCalledWith("agent_new_001");

    // Config should NOT have been saved (dir should not contain config.json)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });
});
