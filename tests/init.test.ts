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

  // Track creation count to generate unique IDs for multiple agents
  let createCount = 0;

  const agents = {
    create:
      agentCreateStatus === "ok"
        ? vi.fn().mockImplementation(() => {
            createCount++;
            return Promise.resolve({ id: `agent_new_${String(createCount).padStart(3, "0")}`, version: 1 });
          })
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

    currentMockSdk = buildMockSdk({});

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ apiKey: "sk-ant-test-key" });

    // Config should have been created
    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.version).toBe(1);
    expect(config.anthropic?.apiKey).toBe("sk-ant-test-key");
    // New schema: agents["propose"].agentId (not agent.id)
    expect(config.agents?.["propose"]?.agentId).toBeDefined();
    expect(config.environment?.id).toBeDefined();
    // Legacy agent field must NOT be written
    expect(config.agent).toBeUndefined();

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
  it("does not create new agents when all role hashes match existing", async () => {

    // Compute current hashes using the new AgentRegistry / hashOf
    const { AgentRegistry } = await import("../src/core/agent/index.js");
    const { ProposeStep } = await import("../src/core/step/propose.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");

    // init.ts registers all 5 agent steps (VerificationStep is CLI-resident, excluded)
    const registry = AgentRegistry.fromSteps([ProposeStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep]);
    const proposeHash = registry.hashOf("propose");
    const specReviewHash = registry.hashOf("spec-review");
    const specFixerHash = registry.hashOf("spec-fixer");
    const implementerHash = registry.hashOf("implementer");
    const buildFixerHash = registry.hashOf("build-fixer");

    // Pre-populate config with matching hashes for all 5 roles
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "propose": {
          agentId: "agent_propose_001",
          definitionHash: proposeHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-review": {
          agentId: "agent_spec_review_001",
          definitionHash: specReviewHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-fixer": {
          agentId: "agent_spec_fixer_001",
          definitionHash: specFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "implementer": {
          agentId: "agent_implementer_001",
          definitionHash: implementerHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "build-fixer": {
          agentId: "agent_build_fixer_001",
          definitionHash: buildFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    // Mock retrieve to succeed for all 5 agents (no 404)
    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockResolvedValue({ id: "agent_new_001", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            const ids = [
              "agent_propose_001",
              "agent_spec_review_001",
              "agent_spec_fixer_001",
              "agent_implementer_001",
              "agent_build_fixer_001",
            ];
            if (ids.includes(id)) {
              return Promise.resolve({ id, version: 1 });
            }
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_propose_001", version: 2 }),
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

    // agents.create should NOT have been called (all hashes match)
    expect(currentMockSdk.beta.agents.create).not.toHaveBeenCalled();
    // agents.update should NOT have been called
    expect(currentMockSdk.beta.agents.update).not.toHaveBeenCalled();
  });
});

// TC-060: specrunner init — Agent 定義に差分がある場合 agents.update
describe("TC-060: specrunner init — calls agents.update when hash differs", () => {
  it("calls agents.update when existing propose hash differs from current", async () => {

    // Pre-populate config with a DIFFERENT (stale) hash for propose
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "propose": {
          agentId: "agent_existing_001",
          definitionHash: "sha256:staleHashValue",
          lastSyncedAt: new Date().toISOString(),
        },
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

// Regression test for finding #1: pipeline/specReview/specFixer survive re-init
describe("Regression #1: re-init preserves user-tuned pipeline/specReview/specFixer settings", () => {
  it("existing pipeline.maxRetries and specReview.timeoutMs survive a second init", async () => {

    // Pre-populate with user-tuned settings
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });

    const { AgentRegistry } = await import("../src/core/agent/index.js");
    const { ProposeStep } = await import("../src/core/step/propose.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");
    const registry = AgentRegistry.fromSteps([ProposeStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep]);

    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "propose": {
          agentId: "agent_propose_001",
          definitionHash: registry.hashOf("propose"),
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-review": {
          agentId: "agent_spec_review_001",
          definitionHash: registry.hashOf("spec-review"),
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-fixer": {
          agentId: "agent_spec_fixer_001",
          definitionHash: registry.hashOf("spec-fixer"),
          lastSyncedAt: new Date().toISOString(),
        },
        "implementer": {
          agentId: "agent_implementer_001",
          definitionHash: registry.hashOf("implementer"),
          lastSyncedAt: new Date().toISOString(),
        },
        "build-fixer": {
          agentId: "agent_build_fixer_001",
          definitionHash: registry.hashOf("build-fixer"),
          lastSyncedAt: new Date().toISOString(),
        },
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
      // User-tuned settings that init must NOT drop
      pipeline: { maxRetries: 5 },
      specReview: { timeoutMs: 120000 },
      specFixer: { timeoutMs: 90000 },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockResolvedValue({ id: "agent_new_001", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            const ids = [
              "agent_propose_001",
              "agent_spec_review_001",
              "agent_spec_fixer_001",
              "agent_implementer_001",
              "agent_build_fixer_001",
            ];
            if (ids.includes(id)) return Promise.resolve({ id, version: 1 });
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_propose_001", version: 2 }),
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

    // User-tuned fields must be preserved
    const raw = await fs.readFile(configPath, "utf-8");
    const savedConfig = JSON.parse(raw);
    expect(savedConfig.pipeline?.maxRetries).toBe(5);
    expect(savedConfig.specReview?.timeoutMs).toBe(120000);
    expect(savedConfig.specFixer?.timeoutMs).toBe(90000);
  });
});

// TC-061: specrunner init — Environment 作成失敗時に Agent を rollback
describe("TC-061: specrunner init — Agent rollback on Environment creation failure", () => {
  it("archives newly created agents when environment creation fails", async () => {

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

    // agents.archive should have been called for each newly created agent
    // (5 agents for 5 roles: propose, spec-review, spec-fixer, implementer, build-fixer)
    expect(currentMockSdk.beta.agents.archive).toHaveBeenCalled();

    // Config should NOT have been saved (dir should not contain config.json)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });
});

// TC-039: specrunner init は旧 schema config を migration して既存 agentId を updateAgent で再利用する
describe("TC-039: legacy migration — reuses existing agentId via updateAgent", () => {
  it("reads legacy agent.id + empty hash, calls updateAgent (not createAgent) for propose", async () => {

    // Pre-populate with legacy schema: only agent.id, no agents map
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const legacyConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-legacy" },
      // legacy single-agent field — no definitionHash
      agent: {
        id: "agent_legacy_propose",
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(legacyConfig), { mode: 0o600 });

    // Mock: propose agent retrieval succeeds (exists on Anthropic side)
    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockImplementation(() => {
            return Promise.resolve({ id: "agent_new_spec_review", version: 1 });
          }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            if (id === "agent_legacy_propose") {
              return Promise.resolve({ id: "agent_legacy_propose", version: 1 });
            }
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_legacy_propose", version: 2 }),
          archive: vi.fn().mockResolvedValue({}),
        },
        environments: {
          create: vi.fn().mockResolvedValue({ id: "env_new_001" }),
          retrieve: vi.fn().mockResolvedValue({ id: "env_existing_001" }),
        },
      },
    };

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ apiKey: "sk-ant-legacy" });

    // propose: stored agentId with empty hash → hash differs → updateAgent (NOT createAgent)
    expect(currentMockSdk.beta.agents.update).toHaveBeenCalledWith(
      "agent_legacy_propose",
      expect.objectContaining({ version: expect.any(Number) }),
    );

    // The old agentId should be preserved in config
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.agents?.["propose"]?.agentId).toBe("agent_legacy_propose");
  });
});

// TC-041: specrunner init は propose の 404 fallback で propose のみ再作成する
describe("TC-041: 404 fallback — only propose is re-created, others are no-op", () => {
  it("calls createAgent only for propose when retrieveAgent 404s for propose", async () => {

    // Compute current hashes (all 5 agent steps that init.ts registers)
    const { AgentRegistry } = await import("../src/core/agent/index.js");
    const { ProposeStep } = await import("../src/core/step/propose.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");

    const registry = AgentRegistry.fromSteps([ProposeStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep]);
    const specReviewHash = registry.hashOf("spec-review");
    const specFixerHash = registry.hashOf("spec-fixer");
    const implementerHash = registry.hashOf("implementer");
    const buildFixerHash = registry.hashOf("build-fixer");

    // Pre-populate with all 5 roles, but propose has a stored ID that will 404
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "propose": {
          agentId: "agent_propose_stale",
          // Use stale hash so AgentSyncer would update even if retrieved;
          // but since retrieve 404s, it falls through to create
          definitionHash: "sha256:old_hash_propose",
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-review": {
          agentId: "agent_spec_review_001",
          definitionHash: specReviewHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "spec-fixer": {
          agentId: "agent_spec_fixer_001",
          definitionHash: specFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "implementer": {
          agentId: "agent_implementer_001",
          definitionHash: implementerHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "build-fixer": {
          agentId: "agent_build_fixer_001",
          definitionHash: buildFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockResolvedValue({ id: "agent_propose_new", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            if (id === "agent_propose_stale") {
              // propose 404s → triggers create fallback
              return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
            }
            // spec-review, spec-fixer, implementer, build-fixer all retrieve succeed
            return Promise.resolve({ id, version: 1 });
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_propose_new", version: 2 }),
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

    // Only propose should have been created
    expect(currentMockSdk.beta.agents.create).toHaveBeenCalledTimes(1);
    // spec-review, spec-fixer, implementer, build-fixer should not have been updated or created
    expect(currentMockSdk.beta.agents.update).not.toHaveBeenCalled();

    // Config should reflect new propose agentId
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.agents?.["propose"]?.agentId).toBe("agent_propose_new");
    // Other role IDs unchanged
    expect(config.agents?.["spec-review"]?.agentId).toBe("agent_spec_review_001");
    expect(config.agents?.["spec-fixer"]?.agentId).toBe("agent_spec_fixer_001");
    expect(config.agents?.["implementer"]?.agentId).toBe("agent_implementer_001");
    expect(config.agents?.["build-fixer"]?.agentId).toBe("agent_build_fixer_001");
  });
});
