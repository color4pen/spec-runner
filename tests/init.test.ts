import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// vi.mock must be at top level (gets hoisted by vitest)
vi.mock("../src/adapter/managed-agent/client.js", () => ({
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
    // New schema: agents["design"].agentId (not agent.id)
    expect(config.agents?.["design"]?.agentId).toBeDefined();
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
    const { DesignStep } = await import("../src/core/step/design.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");
    const { CodeReviewStep } = await import("../src/core/step/code-review.js");
    const { CodeFixerStep } = await import("../src/core/step/code-fixer.js");

    // init.ts registers all 7 agent steps (VerificationStep is CLI-resident, excluded)
    const registry = AgentRegistry.fromSteps([DesignStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]);
    const designHash = registry.hashOf("design");
    const specReviewHash = registry.hashOf("spec-review");
    const specFixerHash = registry.hashOf("spec-fixer");
    const implementerHash = registry.hashOf("implementer");
    const buildFixerHash = registry.hashOf("build-fixer");
    const codeReviewHash = registry.hashOf("code-review");
    const codeFixerHash = registry.hashOf("code-fixer");

    // Pre-populate config with matching hashes for all 7 roles
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "design": {
          agentId: "agent_design_001",
          definitionHash: designHash,
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
        "code-review": {
          agentId: "agent_code_review_001",
          definitionHash: codeReviewHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "code-fixer": {
          agentId: "agent_code_fixer_001",
          definitionHash: codeFixerHash,
          lastSyncedAt: new Date().toISOString(),
        },
      },
      environment: { id: "env_existing_001", lastSyncedAt: new Date().toISOString() },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    // Mock retrieve to succeed for all 7 agents (no 404)
    currentMockSdk = {
      beta: {
        agents: {
          create: vi.fn().mockResolvedValue({ id: "agent_new_001", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            const ids = [
              "agent_design_001",
              "agent_spec_review_001",
              "agent_spec_fixer_001",
              "agent_implementer_001",
              "agent_build_fixer_001",
              "agent_code_review_001",
              "agent_code_fixer_001",
            ];
            if (ids.includes(id)) {
              return Promise.resolve({ id, version: 1 });
            }
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_design_001", version: 2 }),
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
  it("calls agents.update when existing design hash differs from current", async () => {

    // Pre-populate config with a DIFFERENT (stale) hash for design
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "design": {
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

// Regression test for finding #1: pipeline settings survive re-init
// TC-012 (partial): ConfigStore.load reads old timeoutMs without error, and init preserves pipeline.maxRetries
// ADR-0014: timeoutMs stripping from specReview/specFixer removed (ADR-0013 superseded)
describe("Regression #1: re-init preserves user-tuned pipeline settings", () => {
  it("existing pipeline.maxRetries survives a second init; old timeoutMs keys in specReview/specFixer do not cause errors", async () => {

    // Pre-populate with user-tuned settings including legacy timeoutMs (should be silently ignored)
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });

    const { AgentRegistry } = await import("../src/core/agent/index.js");
    const { DesignStep } = await import("../src/core/step/design.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");
    const registry = AgentRegistry.fromSteps([DesignStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep]);

    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "design": {
          agentId: "agent_design_001",
          definitionHash: registry.hashOf("design"),
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
      // Legacy timeout fields — must be silently ignored (TC-012), NOT cause an error
      specReview: { timeoutMs: 120000, pollIntervalMs: 100 },
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
              "agent_design_001",
              "agent_spec_review_001",
              "agent_spec_fixer_001",
              "agent_implementer_001",
              "agent_build_fixer_001",
            ];
            if (ids.includes(id)) return Promise.resolve({ id, version: 1 });
            return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_design_001", version: 2 }),
          archive: vi.fn().mockResolvedValue({}),
        },
        environments: {
          create: vi.fn().mockResolvedValue({ id: "env_new_001" }),
          retrieve: vi.fn().mockResolvedValue({ id: "env_existing_001" }),
        },
      },
    };

    const { runInit } = await import("../src/cli/init.js");
    // Should NOT throw even though specReview.timeoutMs is present in old config
    await expect(runInit({ apiKey: "sk-ant-existing" })).resolves.not.toThrow();

    // pipeline.maxRetries must be preserved
    const raw = await fs.readFile(configPath, "utf-8");
    const savedConfig = JSON.parse(raw);
    expect(savedConfig.pipeline?.maxRetries).toBe(5);
    // specReview.pollIntervalMs (a valid field) must be preserved
    expect(savedConfig.specReview?.pollIntervalMs).toBe(100);
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
    // (5 agents for 5 roles: design, spec-review, spec-fixer, implementer, build-fixer)
    expect(currentMockSdk.beta.agents.archive).toHaveBeenCalled();

    // Config should NOT have been saved (dir should not contain config.json)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });
});

// TC-039: specrunner init は旧 schema config を migration して既存 agentId を updateAgent で再利用する
describe("TC-039: legacy migration — reuses existing agentId via updateAgent", () => {
  it("reads legacy agent.id + empty hash, calls updateAgent (not createAgent) for design", async () => {

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

    // Mock: design agent retrieval succeeds (exists on Anthropic side)
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

    // design: stored agentId with empty hash → hash differs → updateAgent (NOT createAgent)
    expect(currentMockSdk.beta.agents.update).toHaveBeenCalledWith(
      "agent_legacy_propose",
      expect.objectContaining({ version: expect.any(Number) }),
    );

    // The old agentId should be preserved in config
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.agents?.["design"]?.agentId).toBe("agent_legacy_propose");
  });
});

// TC-041: specrunner init は design の 404 fallback で design のみ再作成する
describe("TC-041: 404 fallback — only design is re-created, others are no-op", () => {
  it("calls createAgent only for design when retrieveAgent 404s for design", async () => {

    // Compute current hashes (all 7 agent steps that init.ts registers)
    const { AgentRegistry } = await import("../src/core/agent/index.js");
    const { DesignStep } = await import("../src/core/step/design.js");
    const { SpecReviewStep } = await import("../src/core/step/spec-review.js");
    const { SpecFixerStep } = await import("../src/core/step/spec-fixer.js");
    const { ImplementerStep } = await import("../src/core/step/implementer.js");
    const { BuildFixerStep } = await import("../src/core/step/build-fixer.js");
    const { CodeReviewStep } = await import("../src/core/step/code-review.js");
    const { CodeFixerStep } = await import("../src/core/step/code-fixer.js");

    const registry = AgentRegistry.fromSteps([DesignStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]);
    const specReviewHash = registry.hashOf("spec-review");
    const specFixerHash = registry.hashOf("spec-fixer");
    const implementerHash = registry.hashOf("implementer");
    const buildFixerHash = registry.hashOf("build-fixer");
    const codeReviewHash = registry.hashOf("code-review");
    const codeFixerHash = registry.hashOf("code-fixer");

    // Pre-populate with all 7 roles, but design has a stored ID that will 404
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      anthropic: { apiKey: "sk-ant-existing" },
      agents: {
        "design": {
          agentId: "agent_design_stale",
          // Use stale hash so AgentSyncer would update even if retrieved;
          // but since retrieve 404s, it falls through to create
          definitionHash: "sha256:old_hash_design",
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
        "code-review": {
          agentId: "agent_code_review_001",
          definitionHash: codeReviewHash,
          lastSyncedAt: new Date().toISOString(),
        },
        "code-fixer": {
          agentId: "agent_code_fixer_001",
          definitionHash: codeFixerHash,
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
          create: vi.fn().mockResolvedValue({ id: "agent_design_new", version: 1 }),
          retrieve: vi.fn().mockImplementation((id: string) => {
            if (id === "agent_design_stale") {
              // design 404s → triggers create fallback
              return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
            }
            // all other agents retrieve succeed
            return Promise.resolve({ id, version: 1 });
          }),
          update: vi.fn().mockResolvedValue({ id: "agent_design_new", version: 2 }),
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

    // Only design should have been created
    expect(currentMockSdk.beta.agents.create).toHaveBeenCalledTimes(1);
    // all others should not have been updated or created
    expect(currentMockSdk.beta.agents.update).not.toHaveBeenCalled();

    // Config should reflect new design agentId
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.agents?.["design"]?.agentId).toBe("agent_design_new");
    // Other role IDs unchanged
    expect(config.agents?.["spec-review"]?.agentId).toBe("agent_spec_review_001");
    expect(config.agents?.["spec-fixer"]?.agentId).toBe("agent_spec_fixer_001");
    expect(config.agents?.["implementer"]?.agentId).toBe("agent_implementer_001");
    expect(config.agents?.["build-fixer"]?.agentId).toBe("agent_build_fixer_001");
  });
});

// TC-010: init で steps セクションなしの config に steps.defaults が追加される
describe("TC-010: specrunner init --runtime=local で steps.defaults が追加される", () => {
  it("steps フィールドがない config に steps.defaults を追加する", async () => {
    // No existing config — fresh init (local)
    const { runInit } = await import("../src/cli/init.js");
    await runInit({ runtime: "local" });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps).toBeDefined();
    expect(config.steps.defaults).toBeDefined();
    expect(config.steps.defaults.model).toBe("claude-sonnet-4-6");
    expect(config.steps.defaults.maxTurns).toBeNull();
    expect(config.steps.defaults.timeoutMs).toBeNull();
  });
});

// TC-011: init で既存の steps がある場合は上書きされない
describe("TC-011: specrunner init --runtime=local で既存の steps は上書きされない", () => {
  it("steps.defaults.maxTurns: 90 がある既存 config を保持する", async () => {
    // Pre-populate config with custom steps
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      runtime: "local",
      anthropic: { apiKey: "" },
      agents: {},
      steps: {
        defaults: {
          maxTurns: 90,
          model: "claude-haiku-4-5",
        },
      },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ runtime: "local" });

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // Existing steps must NOT be overwritten
    expect(config.steps.defaults.maxTurns).toBe(90);
    expect(config.steps.defaults.model).toBe("claude-haiku-4-5");
  });
});
