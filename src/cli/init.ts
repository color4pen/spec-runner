import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "../sdk/client.js";
import { createAgent, retrieveAgent, updateAgent } from "../sdk/agents.js";
import { createEnvironment, retrieveEnvironment } from "../sdk/environments.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { bootstrapTools } from "../core/tools/index.js";
import { buildAgentDefinition, computeDefinitionHash } from "../core/agent-definition.js";
import { logInfo, logStep, logSuccess, logError, stderrWrite } from "../logger/stdout.js";
import type { SpecRunnerConfig } from "../config/schema.js";

const ENVIRONMENT_NAME = "specrunner-default";
const ENVIRONMENT_PACKAGES_NPM = ["@fission-ai/openspec"];

/**
 * Run the specrunner init command.
 * Creates or updates Agent + Environment, saves config.
 */
export async function runInit(options: {
  apiKey?: string;
}): Promise<void> {
  // Bootstrap tools (register all custom tools)
  bootstrapTools();

  // Get API key
  const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    logError("No API key found. Set ANTHROPIC_API_KEY or pass --api-key.");
    process.exit(1);
  }

  const client = createAnthropicClient(apiKey);

  // Load existing config if available
  let existingConfig: Partial<SpecRunnerConfig> = {};
  try {
    existingConfig = await loadConfig();
  } catch {
    // No existing config — that's OK for first run
  }

  logInfo("specrunner init");

  // Build agent definition
  const agentDef = buildAgentDefinition();
  const definitionHash = computeDefinitionHash(agentDef);

  // --- Agent step ---
  let agentId: string;
  let agentVersion: number | undefined;

  if (existingConfig.agent?.id) {
    // Try to retrieve existing agent
    try {
      const existing = await retrieveAgent(client, existingConfig.agent.id);
      agentVersion = existing.version;

      if (existingConfig.agent.definitionHash === definitionHash) {
        logStep(`Agent unchanged (${existingConfig.agent.id})`);
        agentId = existingConfig.agent.id;
      } else {
        logStep(`Agent definition changed — updating ${existingConfig.agent.id}...`);
        await updateAgent(client, existingConfig.agent.id, {
          version: existing.version,
          name: agentDef.name,
          system: agentDef.system,
          tools: agentDef.tools,
        });
        agentId = existingConfig.agent.id;
        logSuccess(`Agent updated (${agentId})`);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep("Existing agent not found — creating new agent...");
        agentId = await createNewAgent(client, agentDef);
      } else {
        throw err;
      }
    }
  } else {
    logStep("Creating agent...");
    agentId = await createNewAgent(client, agentDef);
  }

  // --- Environment step ---
  let environmentId: string;

  if (existingConfig.environment?.id) {
    try {
      await retrieveEnvironment(client, existingConfig.environment.id);
      logStep(`Environment unchanged (${existingConfig.environment.id})`);
      environmentId = existingConfig.environment.id;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep("Existing environment not found — creating new environment...");
        environmentId = await createNewEnvironment(client);
      } else {
        throw err;
      }
    }
  } else {
    logStep("Creating environment...");
    try {
      environmentId = await createNewEnvironment(client);
    } catch (envErr) {
      // Rollback: try to archive the newly created agent
      if (!existingConfig.agent?.id) {
        stderrWrite(`Environment creation failed. Rolling back agent ${agentId}...`);
        try {
          await client.beta.agents.archive(agentId);
          logStep("Agent rolled back.");
        } catch (cleanupErr) {
          stderrWrite(
            `Failed to cleanup orphaned agent ${agentId}; please archive manually.`,
          );
        }
      }
      throw envErr;
    }
  }

  // --- Save config ---
  const now = new Date().toISOString();
  const newConfig: SpecRunnerConfig = {
    version: 1,
    anthropic: { apiKey },
    agent: {
      id: agentId,
      definitionHash,
      lastSyncedAt: now,
    },
    environment: {
      id: environmentId,
      lastSyncedAt: now,
    },
    github: existingConfig.github,
  };

  await saveConfig(newConfig);
  logSuccess("Config saved.");
  logInfo("Run 'specrunner login' to authenticate with GitHub.");
}

async function createNewAgent(
  client: Anthropic,
  agentDef: ReturnType<typeof buildAgentDefinition>,
): Promise<string> {
  const agent = await createAgent(client, {
    name: agentDef.name,
    model: agentDef.model,
    system: agentDef.system,
    tools: agentDef.tools,
  });
  logSuccess(`Agent created (${agent.id})`);
  return agent.id;
}

async function createNewEnvironment(
  client: Anthropic,
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
