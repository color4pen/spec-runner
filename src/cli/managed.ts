import * as readline from "node:readline";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { createEnvironment, retrieveEnvironment } from "../adapter/managed-agent/environments.js";
import { saveConfig } from "../config/store.js";
import { loadConfigWithOverlay } from "./load-config-with-overlay.js";
import { AgentRegistry, AgentSyncer } from "../core/agent/index.js";
import type { AgentSyncerConfig } from "../core/agent/syncer.js";
import { AnthropicClientAdapter } from "../adapter/managed-agent/index.js";
import { RequestReviewStep } from "../core/step/request-review.js";
import { DesignStep } from "../core/step/design.js";
import { SpecReviewStep } from "../core/step/spec-review.js";
import { SpecFixerStep } from "../core/step/spec-fixer.js";
import { ImplementerStep } from "../core/step/implementer.js";
import { BuildFixerStep } from "../core/step/build-fixer.js";
import { CodeReviewStep } from "../core/step/code-review.js";
import { CodeFixerStep } from "../core/step/code-fixer.js";
import { logInfo, logStep, logSuccess, logError, stderrWrite, logResult } from "../logger/stdout.js";
import type { SpecRunnerConfig, AgentRecord } from "../config/schema.js";
import type { AgentStepName } from "../state/schema.js";

const ENVIRONMENT_NAME = "specrunner-default";
const ENVIRONMENT_PACKAGES_NPM: string[] = [];

function hasStaleManagedConfig(config: SpecRunnerConfig): boolean {
  if (config.environment?.id) return true;
  if (Object.keys(config.agents ?? {}).length > 0) return true;
  return false;
}

export async function runManagedSetup(): Promise<number> {
  let apiKey: string;
  try {
    const resolved = await resolveSpecRunnerApiKey(
      process.env as Record<string, string | undefined>,
    );
    apiKey = resolved.apiKey;
  } catch (err) {
    logError(
      err instanceof Error
        ? err.message
        : "Anthropic API key not found. Export SPECRUNNER_API_KEY or save it to credentials.",
    );
    return 1;
  }

  const rawSdk = createAnthropicClient(apiKey);
  const agentClient = new AnthropicClientAdapter(rawSdk);

  let existingConfig: Partial<SpecRunnerConfig> = {};
  try {
    existingConfig = await loadConfigWithOverlay();
  } catch {
    // No existing config — OK for first run
  }

  logInfo("specrunner managed setup");

  const registry = AgentRegistry.fromSteps([RequestReviewStep, DesignStep, SpecReviewStep, SpecFixerStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]);

  const storedConfig: AgentSyncerConfig = {
    getStoredAgent(role: AgentStepName) {
      const record = existingConfig.agents?.[role];
      if (record?.agentId) {
        return { agentId: record.agentId, definitionHash: record.definitionHash ?? "" };
      }
      return undefined;
    },
  };

  const syncer = new AgentSyncer(agentClient, registry, storedConfig);
  const syncResult = await syncer.syncAll();

  for (const [role, result] of syncResult.results.entries()) {
    if (result.action === "create") {
      logSuccess(`Agent created for role '${role}' (${result.agentId})`);
    } else if (result.action === "update") {
      logSuccess(`Agent updated for role '${role}' (${result.agentId})`);
    } else {
      logStep(`Agent unchanged for role '${role}' (${result.agentId})`);
    }
  }

  // Environment step
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

  const now = new Date().toISOString();
  const agents: Partial<Record<AgentStepName, AgentRecord>> = {};
  for (const [role, result] of syncResult.results.entries()) {
    agents[role as AgentStepName] = {
      agentId: result.agentId,
      definitionHash: result.definitionHash,
      lastSyncedAt: result.lastSyncedAt ?? now,
    };
  }

  const newConfig: SpecRunnerConfig = {
    ...existingConfig,
    version: 1,
    runtime: "managed",
    agents,
    environment: {
      id: environmentId,
      lastSyncedAt: now,
    },
  };

  await saveConfig(newConfig);
  logSuccess("Config saved.");
  logInfo("Run 'specrunner run' to start the pipeline.");
  return 0;
}

export async function runManagedStatus(): Promise<number> {
  let config: SpecRunnerConfig;
  try {
    config = await loadConfigWithOverlay();
  } catch {
    logResult("Runtime: local (no config found)");
    return 0;
  }

  if (config.runtime !== "managed") {
    logResult("Runtime: local (managed setup not required)");
    if (hasStaleManagedConfig(config)) {
      logResult("Stale managed config detected:");
      if (config.environment?.id) {
        logResult(`  - environment.id: ${config.environment.id}`);
      }
      for (const [role, record] of Object.entries(config.agents ?? {})) {
        logResult(`  - agents.${role}: ${record.agentId}`);
      }
    }
    return 0;
  }

  const anthropicResult = await resolveSpecRunnerApiKey(
    process.env as Record<string, string | undefined>,
    { optional: true },
  );
  const apiKeyPresent = !!anthropicResult;
  logResult("Runtime: managed");
  logResult(`SPECRUNNER_API_KEY: ${apiKeyPresent ? "set" : "NOT SET"}`);
  logResult(`environment.id: ${config.environment?.id ?? "(not set)"}`);

  const agentEntries = Object.entries(config.agents ?? {});
  if (agentEntries.length === 0) {
    logResult("agents: (none registered)");
  } else {
    logResult("agents:");
    for (const [role, record] of agentEntries) {
      logResult(`  ${role}: ${record.agentId}`);
    }
  }
  return 0;
}

export async function runManagedReset(opts: { force: boolean }): Promise<number> {
  const anthropicResult = await resolveSpecRunnerApiKey(
    process.env as Record<string, string | undefined>,
    { optional: true },
  );
  const apiKey = anthropicResult?.apiKey;

  let config: SpecRunnerConfig;
  try {
    config = await loadConfigWithOverlay();
  } catch (err) {
    logError(`Error loading config: ${(err as Error).message}`);
    return 1;
  }

  // --- runtime mismatch guard: handle stale managed fields when runtime != managed ---
  if (config.runtime !== "managed") {
    if (!hasStaleManagedConfig(config)) {
      logResult("No stale managed config. Nothing to reset.");
      return 0;
    }

    stderrWrite(
      `Warning: runtime is "${config.runtime ?? "local"}", not "managed". This will reset stale managed fields only.`,
    );

    if (!opts.force) {
      const isTTY = (process.stdin as NodeJS.ReadStream).isTTY ?? false;
      if (!isTTY) {
        logResult("Non-interactive mode requires --force to reset stale config.");
        return 0;
      }
      const confirmed = await promptConfirm("Proceed? [y/N] ");
      if (!confirmed) {
        logResult("Aborted.");
        return 0;
      }
    }

    // SDK delete if environment.id present and API key available
    if (config.environment?.id && apiKey) {
      const rawSdk = createAnthropicClient(apiKey);
      try {
        await rawSdk.beta.environments.delete(config.environment.id);
        logSuccess(`Environment deleted (${config.environment.id})`);
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          logStep(`Environment ${config.environment.id} not found on provider side (already deleted)`);
        } else {
          throw err;
        }
      }
    } else if (config.environment?.id && !apiKey) {
      stderrWrite("Warning: SPECRUNNER_API_KEY not set — skipping provider-side environment deletion.");
    }

    // Clear stale fields
    const { environment: _env, ...rest } = config;
    const newConfig: SpecRunnerConfig = { ...rest, agents: {} };
    delete (newConfig as unknown as Record<string, unknown>)["runtime"];
    await saveConfig(newConfig);
    logSuccess("Reset stale managed fields.");
    return 0;
  }

  // --- managed runtime path (existing behavior, unchanged) ---
  if (!opts.force) {
    const confirmed = await promptConfirm(
      "This will delete the Anthropic Environment and clear managed config. Continue? [y/N] ",
    );
    if (!confirmed) {
      logResult("Aborted.");
      return 0;
    }
  }

  // Delete environment if configured and API key available
  if (config.environment?.id && apiKey) {
    const rawSdk = createAnthropicClient(apiKey);
    try {
      await rawSdk.beta.environments.delete(config.environment.id);
      logSuccess(`Environment deleted (${config.environment.id})`);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep(`Environment ${config.environment.id} not found on provider side (already deleted)`);
      } else {
        throw err;
      }
    }
  } else if (config.environment?.id && !apiKey) {
    stderrWrite("Warning: SPECRUNNER_API_KEY not set — skipping provider-side environment deletion.");
  }

  // Reset config: remove runtime, clear agents to {}, remove environment
  const { environment: _managedEnv, ...managedRest } = config;
  const managedNewConfig: SpecRunnerConfig = {
    ...managedRest,
    agents: {},
  };
  // Remove runtime field (delete it so it defaults to local)
  delete (managedNewConfig as unknown as Record<string, unknown>)["runtime"];

  await saveConfig(managedNewConfig);
  logSuccess("Config reset.");
  logResult("Note: Anthropic-side agent resources are NOT deleted (no delete API available) and remain as orphans.");
  return 0;
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

function promptConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}
