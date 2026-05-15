import * as fs from "node:fs/promises";
import { getConfigPath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateConfig } from "./schema.js";
import type { SpecRunnerConfig, AgentRecord } from "./schema.js";
import type { StepName } from "../state/schema.js";
import { configMissingError, configIncompleteError } from "../errors.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";
import { stderrWrite } from "../logger/stdout.js";
import { applyMigration } from "./migrate.js";

const CONFIG_MODE = 0o600;
const LOOSE_MODE_THRESHOLD = 0o007; // group/other readable bits

/**
 * Load config from disk. Applies migration (legacy/intermediate → new schema)
 * and validates the result. Warns about loose permissions.
 * Throws SpecRunnerError if config is missing or invalid.
 */
export async function loadConfig(): Promise<SpecRunnerConfig> {
  const configPath = getConfigPath();

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw configMissingError();
    }
    throw err;
  }

  // Check permissions — warn if too loose
  try {
    const stat = await fs.stat(configPath);
    const mode = stat.mode & 0o777;
    if (mode & LOOSE_MODE_THRESHOLD) {
      stderrWrite(
        `Warning: ${configPath} has loose permissions (recommend 0600).`,
      );
    }
  } catch {
    // Ignore stat errors — file was just read
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Delete the config and run 'specrunner init' again.",
      "JSON parse error in config file.",
    );
  }

  // Apply migration: legacy/intermediate → canonical new schema
  let migrated: SpecRunnerConfig;
  try {
    migrated = applyMigration(parsed);
  } catch (err: unknown) {
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Delete the config and run 'specrunner init' again.",
      `Config migration failed: ${(err as Error).message}`,
    );
  }

  try {
    return validateConfig(migrated);
  } catch (err: unknown) {
    // TC-034: CONFIG_INVALID errors (e.g. invalid runtime value) propagate as CONFIG_INVALID
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

  await atomicWriteJson(configPath, toSave, { mode: CONFIG_MODE });
}

/**
 * ConfigStore class implementation for use as a port.
 * Wraps loadConfig/saveConfig with in-memory caching and getAgentId.
 */
export class FileConfigStore {
  private cachedConfig: SpecRunnerConfig | undefined;

  async load(): Promise<SpecRunnerConfig> {
    this.cachedConfig = await loadConfig();
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
  getAgentId(role: StepName): string {
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
      `Run 'specrunner init' to create the ${role} agent.`,
      `Missing agent ID for role: ${role}.`,
    );
  }

  /**
   * Upsert an AgentRecord for the given role into in-memory config.
   * Caller must call save() to persist.
   */
  async upsertAgent(role: StepName, record: AgentRecord): Promise<void> {
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
