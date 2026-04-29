import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "../sdk/client.js";
import { createAgent, retrieveAgent, updateAgent } from "../sdk/agents.js";
import { createEnvironment, retrieveEnvironment } from "../sdk/environments.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { bootstrapTools } from "../core/tools/index.js";
import {
  buildAgentDefinition,
  buildSpecFixerAgentDefinition,
  computeDefinitionHash,
} from "../core/agent-definition.js";
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

  // Build agent definitions
  const agentDef = buildAgentDefinition();
  const definitionHash = computeDefinitionHash(agentDef);
  const specFixerAgentDef = buildSpecFixerAgentDefinition();
  const specFixerDefinitionHash = computeDefinitionHash(specFixerAgentDef);

  // --- Propose Agent step ---
  let agentId: string;

  // Support legacy config.agent.id as the propose agent ID
  const existingProposeId = existingConfig.agents?.propose?.id ?? existingConfig.agent?.id;
  const existingProposeHash = existingConfig.agents?.propose?.definitionHash ?? existingConfig.agent?.definitionHash;

  if (existingProposeId) {
    // Try to retrieve existing propose agent
    try {
      const existing = await retrieveAgent(client, existingProposeId);

      if (existingProposeHash === definitionHash) {
        logStep(`Propose Agent unchanged (${existingProposeId})`);
        agentId = existingProposeId;
      } else {
        logStep(`Propose Agent definition changed — updating ${existingProposeId}...`);
        await updateAgent(client, existingProposeId, {
          version: existing.version,
          name: agentDef.name,
          system: agentDef.system,
          tools: agentDef.tools,
        });
        agentId = existingProposeId;
        logSuccess(`Propose Agent updated (${agentId})`);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep("Existing propose agent not found — creating new propose agent...");
        agentId = await createNewAgent(client, agentDef);
      } else {
        throw err;
      }
    }
  } else {
    logStep("Creating propose agent...");
    agentId = await createNewAgent(client, agentDef);
  }

  // --- Spec-Fixer Agent step ---
  let specFixerAgentId: string;
  const existingSpecFixerId = existingConfig.agents?.specFixer?.id;
  const existingSpecFixerHash = existingConfig.agents?.specFixer?.definitionHash;

  if (existingSpecFixerId) {
    try {
      const existing = await retrieveAgent(client, existingSpecFixerId);

      if (existingSpecFixerHash === specFixerDefinitionHash) {
        logStep(`Spec-Fixer Agent unchanged (${existingSpecFixerId})`);
        specFixerAgentId = existingSpecFixerId;
      } else {
        logStep(`Spec-Fixer Agent definition changed — updating ${existingSpecFixerId}...`);
        await updateAgent(client, existingSpecFixerId, {
          version: existing.version,
          name: specFixerAgentDef.name,
          system: specFixerAgentDef.system,
          tools: specFixerAgentDef.tools,
        });
        specFixerAgentId = existingSpecFixerId;
        logSuccess(`Spec-Fixer Agent updated (${specFixerAgentId})`);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logStep("Existing spec-fixer agent not found — creating new spec-fixer agent...");
        specFixerAgentId = await createNewSpecFixerAgent(client, specFixerAgentDef);
      } else {
        throw err;
      }
    }
  } else {
    logStep("Creating spec-fixer agent...");
    specFixerAgentId = await createNewSpecFixerAgent(client, specFixerAgentDef);
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
    // Legacy field kept in sync with agents.propose for backward compatibility
    agent: {
      id: agentId,
      definitionHash,
      lastSyncedAt: now,
    },
    agents: {
      propose: {
        id: agentId,
        definitionHash,
        lastSyncedAt: now,
      },
      specFixer: {
        id: specFixerAgentId,
        definitionHash: specFixerDefinitionHash,
        lastSyncedAt: now,
      },
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
  logSuccess(`Propose Agent created (${agent.id})`);
  return agent.id;
}

async function createNewSpecFixerAgent(
  client: Anthropic,
  agentDef: ReturnType<typeof buildSpecFixerAgentDefinition>,
): Promise<string> {
  const agent = await createAgent(client, {
    name: agentDef.name,
    model: agentDef.model,
    system: agentDef.system,
    tools: agentDef.tools,
  });
  logSuccess(`Spec-Fixer Agent created (${agent.id})`);
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
