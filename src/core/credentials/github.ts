/**
 * Credentials file I/O and GitHub token resolver.
 *
 * File: ~/.config/specrunner/credentials.json (0600)
 * Structure: { "github": { "token": "ghp_..." } }
 *
 * Priority for resolveGitHubToken:
 *   1. credentials.json github.token
 *   2. GITHUB_TOKEN env var
 *   3. SpecRunnerError with hint to run 'specrunner login'
 */
import * as fs from "node:fs/promises";
import { getCredentialsPath } from "../../util/xdg.js";
import { atomicWriteJson } from "../../util/atomic-write.js";
import { stderrWrite } from "../../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { CredentialsFile } from "./types.js";

export type { CredentialsFile };

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

  try {
    return JSON.parse(raw) as CredentialsFile;
  } catch {
    // Malformed JSON — return empty so resolveGitHubToken falls through
    // to env-var priority and eventually throws GITHUB_TOKEN_MISSING.
    return {};
  }
}

/**
 * Save credentials to disk using atomic write with 0600 permissions.
 * Merges with existing file to preserve other provider keys.
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

  const merged: CredentialsFile = { ...existing, ...creds };
  await atomicWriteJson(credPath, merged, { mode: CREDENTIALS_MODE });
}

/**
 * Resolve GitHub token with priority:
 *   1. credentials.json github.token
 *   2. GITHUB_TOKEN env var
 *   3. Throw SpecRunnerError with login hint
 */
export async function resolveGitHubToken(
  env: Record<string, string | undefined>,
): Promise<{ token: string; source: "credentials" | "env" }> {
  // Priority 1: credentials file
  const creds = await loadCredentials();
  if (creds.github?.token && creds.github.token.length > 0) {
    return { token: creds.github.token, source: "credentials" };
  }

  // Priority 2: GITHUB_TOKEN env var
  const envToken = env["GITHUB_TOKEN"];
  if (envToken && envToken.length > 0) {
    return { token: envToken, source: "env" };
  }

  // Neither — throw with guidance
  throw new SpecRunnerError(
    ERROR_CODES.GITHUB_TOKEN_MISSING,
    "Run 'specrunner login' to authenticate with GitHub, or set GITHUB_TOKEN env var.",
    "GitHub token not found in credentials file or GITHUB_TOKEN env var.",
  );
}
