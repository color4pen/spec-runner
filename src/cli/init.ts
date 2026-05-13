import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createEnvironment, retrieveEnvironment } from "../adapter/managed-agent/environments.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { AgentRegistry, AgentSyncer } from "../core/agent/index.js";
import type { SyncRoleResult } from "../core/agent/syncer.js";
import type { AgentSyncerConfig } from "../core/agent/syncer.js";
import type { AnthropicClient } from "../core/port/anthropic-client.js";
import { AnthropicClientAdapter } from "../adapter/managed-agent/index.js";
import { DesignStep } from "../core/step/design.js";
import { SpecReviewStep } from "../core/step/spec-review.js";
import { SpecFixerStep } from "../core/step/spec-fixer.js";
import { ImplementerStep } from "../core/step/implementer.js";
import { BuildFixerStep } from "../core/step/build-fixer.js";
import { CodeReviewStep } from "../core/step/code-review.js";
import { CodeFixerStep } from "../core/step/code-fixer.js";
import { logInfo, logStep, logSuccess, logError, stderrWrite } from "../logger/stdout.js";
import type { SpecRunnerConfig, AgentRecord } from "../config/schema.js";
import type { StepName } from "../state/schema.js";

const ENVIRONMENT_NAME = "specrunner-default";
const ENVIRONMENT_PACKAGES_NPM: string[] = [];

/**
 * Run the specrunner init command.
 * Uses AgentRegistry + AgentSyncer to sync all roles atomically.
 * Creates or retrieves Environment after agent sync.
 *
 * TC-038/TC-041: runtime === "local" skips apiKey prompt, AgentSyncer, and Environment creation.
 * TC-042: runtime === "local" generates no Anthropic API requests.
 */
export async function runInit(options: {
  apiKey?: string;
  runtime?: "managed" | "local";
}): Promise<void> {
  const runtime = options.runtime ?? "managed";

  // TC-041: local runtime — skip apiKey requirement and agent sync entirely
  if (runtime === "local") {
    return runInitLocal();
  }

  // Get API key
  const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    logError("No API key found. Set ANTHROPIC_API_KEY or pass --api-key.");
    process.exit(1);
  }

  const rawSdk = createAnthropicClient(apiKey);

  // Wrap the raw SDK in the canonical adapter so all agent operations go through the port.
  // Tests mock createAnthropicClient via vi.mock("sdk/client.js"), so the returned rawSdk
  // is already a mock object — AnthropicClientAdapter wraps it and the mock chain still works.
  const agentClient: AnthropicClient = new AnthropicClientAdapter(rawSdk);

  // Load existing config if available
  let existingConfig: Partial<SpecRunnerConfig> = {};
  try {
    existingConfig = await loadConfig();
  } catch {
    // No existing config — that's OK for first run
  }

  logInfo("specrunner init");

  // Build AgentRegistry from all steps (VerificationStep is CLI-resident, not included)
  const registry = AgentRegistry.fromSteps([DesignStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]);

  // Build AgentSyncerConfig from existing loaded config
  const storedConfig: AgentSyncerConfig = {
    getStoredAgent(role: StepName) {
      const record = existingConfig.agents?.[role];
      // Return whenever agentId is set — even if definitionHash is empty (legacy migration).
      // An empty hash is not equal to any real hash, so AgentSyncer will take the
      // "hash differs → updateAgent" branch rather than leaking the existing agent ID.
      if (record?.agentId) {
        return { agentId: record.agentId, definitionHash: record.definitionHash ?? "" };
      }
      return undefined;
    },
  };

  // Run syncAll — atomically syncs all roles
  const syncer = new AgentSyncer(agentClient, registry, storedConfig);
  const syncResult = await syncer.syncAll();

  // Log per-role action
  for (const [role, result] of syncResult.results.entries()) {
    if (result.action === "create") {
      logSuccess(`Agent created for role '${role}' (${result.agentId})`);
    } else if (result.action === "update") {
      logSuccess(`Agent updated for role '${role}' (${result.agentId})`);
    } else {
      logStep(`Agent unchanged for role '${role}' (${result.agentId})`);
    }
  }

  // --- Environment step ---
  let environmentId: string;

  if (existingConfig.environment?.id) {
    try {
      await retrieveEnvironment(rawSdk, existingConfig.environment.id);
      logStep(`Environment unchanged (${existingConfig.environment.id})`);
      environmentId = existingConfig.environment.id;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep("Existing environment not found — creating new environment...");
        environmentId = await createNewEnvironment(rawSdk);
      } else {
        throw err;
      }
    }
  } else {
    logStep("Creating environment...");
    try {
      environmentId = await createNewEnvironment(rawSdk);
    } catch (envErr) {
      // Rollback: archive any newly created agents from this run
      const createdAgents = [...syncResult.results.entries()]
        .filter(([, r]) => r.action === "create");

      if (createdAgents.length > 0) {
        stderrWrite(`Environment creation failed. Rolling back ${createdAgents.length} agent(s)...`);
        for (const [, result] of createdAgents) {
          try {
            await agentClient.archiveAgent(result.agentId);
            logStep(`Agent rolled back (${result.agentId}).`);
          } catch {
            stderrWrite(`Failed to cleanup orphaned agent ${result.agentId}; please archive manually.`);
          }
        }
      }
      throw envErr;
    }
  }

  // --- Save config (new canonical schema only) ---
  const now = new Date().toISOString();
  const agents: Record<string, AgentRecord> = {};
  for (const [role, result] of syncResult.results.entries()) {
    agents[role] = {
      agentId: result.agentId,
      definitionHash: result.definitionHash,
      lastSyncedAt: result.lastSyncedAt ?? now,
    };
  }

  const newConfig: SpecRunnerConfig = {
    // Spread existing config first so that user-tuned fields (pipeline, specReview,
    // specFixer, github, etc.) survive re-runs. init only owns: version, anthropic,
    // agents, environment, runtime.
    ...existingConfig,
    version: 1,
    runtime: "managed", // TC-047: managed init persists runtime: "managed"
    anthropic: { apiKey },
    agents,
    environment: {
      id: environmentId,
      lastSyncedAt: now,
    },
  };

  await saveConfig(newConfig);
  logSuccess("Config saved.");
  logInfo("Run 'specrunner login' to authenticate with GitHub.");
}

/**
 * Local runtime init: write config with runtime: "local".
 * No API key, no AgentSyncer, no Environment creation.
 *
 * TC-038: AgentSyncer.syncAll() is not called
 * TC-041: apiKey not required
 * TC-042: zero Anthropic API requests
 */
async function runInitLocal(): Promise<void> {
  logInfo("specrunner init --runtime local");

  // Load existing config (may not exist — that's OK for first run)
  let existingConfig: Partial<SpecRunnerConfig> = {};
  try {
    existingConfig = await loadConfig();
  } catch {
    // No existing config — OK
  }

  const newConfig: SpecRunnerConfig = {
    ...existingConfig,
    version: 1,
    runtime: "local",
    // Preserve existing anthropic/github/etc. fields; default empty anthropic for local
    anthropic: existingConfig.anthropic ?? { apiKey: "" },
    agents: existingConfig.agents ?? {},
    // TC-010: add steps.defaults if not already present
    // TC-011: do not overwrite existing steps config
    // D4 (design.md): null = unlimited for maxTurns; null = no timeout for timeoutMs
    steps: existingConfig.steps ?? {
      defaults: {
        model: "claude-sonnet-4-6",
        maxTurns: null,
        timeoutMs: null,
      },
    },
  };

  await saveConfig(newConfig);
  logSuccess("Config saved with runtime: local.");
  logInfo("Run 'specrunner login' to authenticate with GitHub (required for PR creation).");
}

async function createNewEnvironment(
  client: ReturnType<typeof createAnthropicClient>,
): Promise<string> {
  const environment = await createEnvironment(client, {
    name: ENVIRONMENT_NAME,
    config: {
      type: "cloud",
      packages: { type: "packages", npm: ENVIRONMENT_PACKAGES_NPM },
    },
  });
  logSuccess(`Environment created (${environment.id})`);
  return environment.id;
}

// Type-only export to satisfy unused variable lint
export type { SyncRoleResult };
