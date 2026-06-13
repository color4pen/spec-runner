/**
 * Shared credentials file I/O (load and save).
 * Imported by both github.ts and anthropic.ts to avoid circular deps
 * and to allow mocking github.ts without affecting anthropic.ts.
 *
 * File: ~/.config/specrunner/credentials.json (0600)
 */
import * as fs from "node:fs/promises";
import { getCredentialsPath } from "../../util/xdg.js";
import { atomicWriteJson } from "../../util/atomic-write.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { CredentialsFile } from "./types.js";

const CREDENTIALS_MODE = 0o600;
const LOOSE_MODE_THRESHOLD = 0o077; // group/other readable bits

/**
 * Load credentials file from disk.
 * Returns {} if file does not exist (ENOENT).
 * Warns to stderr if permissions are looser than 0600.
 */
export async function loadCredentials(): Promise<CredentialsFile> {
  const credPath = getCredentialsPath();

  let raw: string;
  try {
    raw = await fs.readFile(credPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }
    throw err;
  }

  // Check permissions — warn if too loose
  try {
    const stat = await fs.stat(credPath);
    const mode = stat.mode & 0o777;
    if (mode & LOOSE_MODE_THRESHOLD) {
      stderrWrite(
        `Warning: ${credPath} has loose permissions (recommend 0600).`,
      );
    }
  } catch {
    // Ignore stat errors — file was just read
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON — return empty
    return {};
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw Object.assign(
      new Error("CONFIG_INVALID: credentials file must be a JSON object."),
      { code: "CONFIG_INVALID" },
    );
  }

  const creds = parsed as Record<string, unknown>;
  if (creds["github"] !== undefined) {
    const github = creds["github"];
    if (
      typeof github !== "object" ||
      github === null ||
      typeof (github as Record<string, unknown>)["token"] !== "string"
    ) {
      throw Object.assign(
        new Error("CONFIG_INVALID: credentials file: github.token must be a string."),
        { code: "CONFIG_INVALID" },
      );
    }
  }

  if (creds["anthropic"] !== undefined) {
    const anthropic = creds["anthropic"];
    if (typeof anthropic !== "object" || anthropic === null) {
      throw Object.assign(
        new Error("CONFIG_INVALID: credentials file: anthropic must be an object."),
        { code: "CONFIG_INVALID" },
      );
    }
    const anthropicRecord = anthropic as Record<string, unknown>;
    if (
      anthropicRecord["apiKey"] !== undefined &&
      typeof anthropicRecord["apiKey"] !== "string"
    ) {
      throw Object.assign(
        new Error("CONFIG_INVALID: credentials file: anthropic.apiKey must be a string."),
        { code: "CONFIG_INVALID" },
      );
    }
    if (
      anthropicRecord["claudeCodeOAuthToken"] !== undefined &&
      typeof anthropicRecord["claudeCodeOAuthToken"] !== "string"
    ) {
      throw Object.assign(
        new Error("CONFIG_INVALID: credentials file: anthropic.claudeCodeOAuthToken must be a string."),
        { code: "CONFIG_INVALID" },
      );
    }
  }

  return parsed as CredentialsFile;
}

/**
 * Save credentials to disk using atomic write with 0600 permissions.
 * Merges with existing file to preserve other provider keys (deep merge).
 */
export async function saveCredentials(creds: CredentialsFile): Promise<void> {
  const credPath = getCredentialsPath();

  // Read existing to merge (preserve other provider keys)
  let existing: CredentialsFile = {};
  try {
    const raw = await fs.readFile(credPath, "utf-8");
    existing = JSON.parse(raw) as CredentialsFile;
  } catch {
    // ENOENT or parse error — start fresh
  }

  const merged: CredentialsFile = {
    ...existing,
    ...creds,
    github: creds.github ? { ...existing.github, ...creds.github } : existing.github,
    anthropic: creds.anthropic ? { ...existing.anthropic, ...creds.anthropic } : existing.anthropic,
  };
  await atomicWriteJson(credPath, merged, { mode: CREDENTIALS_MODE });
}
