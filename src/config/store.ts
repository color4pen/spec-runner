import * as fs from "node:fs/promises";
import { getConfigPath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateConfig } from "./schema.js";
import type { SpecRunnerConfig } from "./schema.js";
import { configMissingError, configIncompleteError } from "../errors.js";
import { stderrWrite } from "../logger/stdout.js";

const CONFIG_MODE = 0o600;
const LOOSE_MODE_THRESHOLD = 0o007; // group/other readable bits

/**
 * Load config from disk. Validates schema and warns about loose permissions.
 * Throws SpecRunnerError if config is missing or incomplete.
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
    throw configIncompleteError("JSON parse error");
  }

  try {
    return validateConfig(parsed);
  } catch (err: unknown) {
    throw configIncompleteError((err as Error).message);
  }
}

/**
 * Save config to disk using atomic write. Enforces 0600 permissions.
 */
export async function saveConfig(cfg: SpecRunnerConfig): Promise<void> {
  const configPath = getConfigPath();
  await atomicWriteJson(configPath, cfg, { mode: CONFIG_MODE });
}

/**
 * Update partial fields in the config. Reads current config (if exists) and merges.
 */
export async function updateConfig(
  patch: Partial<SpecRunnerConfig>,
): Promise<SpecRunnerConfig> {
  let current: SpecRunnerConfig | null = null;
  try {
    current = await loadConfig();
  } catch {
    // Config may not exist yet; that's OK for partial updates
  }

  const merged = { ...(current ?? { version: 1 as const, anthropic: { apiKey: "" } }), ...patch };
  await saveConfig(merged as SpecRunnerConfig);
  return merged as SpecRunnerConfig;
}
