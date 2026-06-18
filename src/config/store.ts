import * as path from "node:path";
import * as fs from "node:fs/promises";
import { getConfigPath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateConfig } from "./schema.js";
import type { SpecRunnerConfig, AgentRecord } from "./schema.js";
import type { AgentStepName } from "../state/schema.js";
import { configMissingError, configIncompleteError } from "../errors.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { applyMigration } from "./migrate.js";
import { deepMergeConfig } from "./merge.js";

const CONFIG_MODE = 0o600;

/**
 * Parse raw JSON string, apply migration, and return the migrated unknown object.
 * Throws SpecRunnerError on JSON parse failure or migration failure.
 */
function parseAndMigrate(content: string, label: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Delete the config and run 'specrunner init' again.",
      `JSON parse error in ${label}.`,
    );
  }
  try {
    return applyMigration(parsed);
  } catch (err: unknown) {
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Delete the config and run 'specrunner init' again.",
      `Config migration failed in ${label}: ${(err as Error).message}`,
    );
  }
}

/**
 * Validate a migrated config object, wrapping errors as SpecRunnerError.
 */
function validateAndWrap(migrated: unknown): SpecRunnerConfig {
  try {
    return validateConfig(migrated);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "CONFIG_INVALID") {
      throw new SpecRunnerError(
        ERROR_CODES.CONFIG_INVALID,
        "Delete the config and run 'specrunner init' again.",
        (err as Error).message,
      );
    }
    throw configIncompleteError((err as Error).message);
  }
}

/**
 * Load config from disk. Applies migration (legacy/intermediate → new schema)
 * and validates the result.
 *
 * Load order:
 *   1. User global: ~/.config/specrunner/config.json (XDG_CONFIG_HOME)
 *   2. Project local: <repoRoot>/.specrunner/config.json (when repoRoot provided)
 *
 * Overlay behavior:
 *   - Both exist: deep merge (project local overlays user global), then validate merged result.
 *     Project local may be a partial config — missing keys are inherited from user global.
 *   - Only project local: validate as a standalone full config (version: 1 + required fields).
 *   - Only user global: existing behavior (validate user global).
 *   - Neither: throw CONFIG_MISSING.
 *
 * Throws SpecRunnerError if config is missing or invalid.
 */
export async function loadConfig(repoRoot?: string): Promise<SpecRunnerConfig> {
  const userGlobalPath = getConfigPath();

  // Try to read user global config
  let userGlobalMigrated: unknown | null = null;
  try {
    const content = await fs.readFile(userGlobalPath, "utf-8");
    userGlobalMigrated = parseAndMigrate(content, "user global config");
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    // ENOENT → user global does not exist, continue
  }

  // Try to read project local config (only when repoRoot is provided)
  let projectLocalMigrated: unknown | null = null;
  if (repoRoot) {
    const projectLocalPath = path.join(repoRoot, ".specrunner", "config.json");
    try {
      const content = await fs.readFile(projectLocalPath, "utf-8");
      projectLocalMigrated = parseAndMigrate(content, "project local config");
    } catch (err: unknown) {
      if (err instanceof SpecRunnerError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      // ENOENT → project local does not exist, continue
    }
  }

  if (userGlobalMigrated !== null && projectLocalMigrated !== null) {
    // Both exist: validate user global first, then deep merge with project local overlay,
    // then validate the merged result (project local may be partial).
    const userGlobal = validateAndWrap(userGlobalMigrated);
    const merged = deepMergeConfig(userGlobal, projectLocalMigrated as Partial<SpecRunnerConfig>);
    return validateAndWrap(merged);
  }

  if (projectLocalMigrated !== null) {
    // Only project local: must be a complete standalone config (version: 1 + required fields).
    return validateAndWrap(projectLocalMigrated);
  }

  if (userGlobalMigrated !== null) {
    // Only user global: existing behavior.
    return validateAndWrap(userGlobalMigrated);
  }

  // Neither exists
  throw configMissingError();
}

export interface ConfigLayerMetadata {
  path: string;
  exists: boolean;
}

export interface SourceAwareConfigLoadResult {
  config: SpecRunnerConfig;
  userGlobal: ConfigLayerMetadata & { migrated: unknown | null };
  projectLocal: ConfigLayerMetadata & { migrated: unknown | null };
}

/**
 * Load config with the same semantics as loadConfig(), while preserving the two
 * input layers for read-only source attribution.
 */
export async function loadConfigWithSourceMetadata(repoRoot?: string): Promise<SourceAwareConfigLoadResult> {
  const userGlobalPath = getConfigPath();
  const projectLocalPath = repoRoot
    ? path.join(repoRoot, ".specrunner", "config.json")
    : path.join(process.cwd(), ".specrunner", "config.json");

  let userGlobalMigrated: unknown | null = null;
  try {
    const content = await fs.readFile(userGlobalPath, "utf-8");
    userGlobalMigrated = parseAndMigrate(content, "user global config");
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  let projectLocalMigrated: unknown | null = null;
  if (repoRoot) {
    try {
      const content = await fs.readFile(projectLocalPath, "utf-8");
      projectLocalMigrated = parseAndMigrate(content, "project local config");
    } catch (err: unknown) {
      if (err instanceof SpecRunnerError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
  }

  let config: SpecRunnerConfig;
  if (userGlobalMigrated !== null && projectLocalMigrated !== null) {
    const userGlobal = validateAndWrap(userGlobalMigrated);
    const merged = deepMergeConfig(userGlobal, projectLocalMigrated as Partial<SpecRunnerConfig>);
    config = validateAndWrap(merged);
  } else if (projectLocalMigrated !== null) {
    config = validateAndWrap(projectLocalMigrated);
  } else if (userGlobalMigrated !== null) {
    config = validateAndWrap(userGlobalMigrated);
  } else {
    throw configMissingError();
  }

  return {
    config,
    userGlobal: {
      path: userGlobalPath,
      exists: userGlobalMigrated !== null,
      migrated: userGlobalMigrated,
    },
    projectLocal: {
      path: projectLocalPath,
      exists: projectLocalMigrated !== null,
      migrated: projectLocalMigrated,
    },
  };
}

/**
 * Save config to disk using atomic write. Enforces 0600 permissions.
 * Writes only new canonical schema — legacy fields are stripped.
 * Design D3: silently ignore legacy timeout keys; do NOT write them back.
 */
export async function saveConfig(cfg: SpecRunnerConfig): Promise<void> {
  const configPath = getConfigPath();

  // Remove legacy fields before saving
  const toSave: Record<string, unknown> = { ...cfg };
  delete toSave["agent"]; // never write legacy agent field
  delete toSave["timeout"]; // removed in remove-session-timeout (D3)
  delete toSave["anthropic"]; // removed in managed-command-extraction

  await atomicWriteJson(configPath, toSave, { mode: CONFIG_MODE });
}

/**
 * Save a project local config overlay to <repoRoot>/.specrunner/config.json.
 * Uses atomic write + 0600 permissions (same as saveConfig).
 * The saved config may be a partial overlay — only fields that differ from user global
 * need to be included.
 *
 * Note: this function is provided for future CLI commands. No CLI command calls it yet.
 */
export async function saveProjectConfig(
  repoRoot: string,
  cfg: Partial<SpecRunnerConfig>,
): Promise<void> {
  const projectLocalPath = path.join(repoRoot, ".specrunner", "config.json");
  await atomicWriteJson(projectLocalPath, cfg, { mode: CONFIG_MODE });
}

/**
 * ConfigStore class implementation for use as a port.
 * Wraps loadConfig/saveConfig with in-memory caching and getAgentId.
 */
export class FileConfigStore {
  private cachedConfig: SpecRunnerConfig | undefined;

  async load(repoRoot?: string): Promise<SpecRunnerConfig> {
    this.cachedConfig = await loadConfig(repoRoot);
    return this.cachedConfig;
  }

  async save(config: SpecRunnerConfig): Promise<void> {
    this.cachedConfig = config;
    await saveConfig(config);
  }

  /**
   * Synchronously return agent ID for the given role.
   * Throws CONFIG_INCOMPLETE if load() has not been called or role is missing.
   */
  getAgentId(role: AgentStepName): string {
    if (!this.cachedConfig) {
      throw new SpecRunnerError(
        ERROR_CODES.CONFIG_INCOMPLETE,
        "Call ConfigStore.load() before getAgentId().",
        "ConfigStore not initialized — load() must complete before getAgentId().",
      );
    }
    const record = this.cachedConfig.agents?.[role];
    if (record?.agentId) {
      return record.agentId;
    }
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INCOMPLETE,
      `Run 'specrunner managed setup' to register the ${role} agent.`,
      `Missing agent ID for role: ${role}.`,
    );
  }

  /**
   * Upsert an AgentRecord for the given role into in-memory config.
   * Caller must call save() to persist.
   */
  async upsertAgent(role: AgentStepName, record: AgentRecord): Promise<void> {
    if (!this.cachedConfig) {
      throw new SpecRunnerError(
        ERROR_CODES.CONFIG_INCOMPLETE,
        "Call ConfigStore.load() first.",
        "ConfigStore not initialized.",
      );
    }
    this.cachedConfig = {
      ...this.cachedConfig,
      agents: {
        ...this.cachedConfig.agents,
        [role]: record,
      },
    };
  }
}
