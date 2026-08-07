import * as path from "node:path";
import * as fs from "node:fs/promises";
import { getConfigPath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateConfig } from "./schema.js";
import type { SpecRunnerConfig } from "./schema.js";
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
      "Delete the config and run specrunner init again.",
      `JSON parse error in ${label}.`,
    );
  }
  try {
    return applyMigration(parsed);
  } catch (err: unknown) {
    throw new SpecRunnerError(
      ERROR_CODES.CONFIG_INVALID,
      "Delete the config and run specrunner init again.",
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
        "Delete the config and run specrunner init again.",
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
  return (await loadConfigWithSourceMetadata(repoRoot)).config;
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

