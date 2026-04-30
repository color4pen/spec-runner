/**
 * Core types for the `specrunner doctor` subsystem.
 *
 * Design D1: DoctorCheck interface + DoctorContext injection for port-pattern consistency.
 * All checks receive a DoctorContext mock-able in unit tests.
 */

import type * as nodeFsSync from "node:fs";

export type DoctorCategory =
  | "runtime"
  | "config"
  | "env"
  | "auth"
  | "repo"
  | "agents"
  | "storage";

export interface DoctorResult {
  /** Display name of the check */
  name: string;
  /** Category of the check */
  category: DoctorCategory;
  /** Whether this check is required (affects exit code interpretation) */
  required: boolean;
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string;
  details?: string[];
}

export interface DoctorCheck {
  /** Display name of the check (e.g. "node-version") */
  name: string;
  category: DoctorCategory;
  /** Whether this check is required. Fail is still exit 1 regardless. */
  required: boolean;
  check(ctx: DoctorContext): Promise<Omit<DoctorResult, "name" | "category" | "required">>;
}

/**
 * Minimal fs interface needed by doctor checks.
 * Allows mocking in tests without requiring real file system.
 */
export interface DoctorFs {
  /** fs.promises.stat — resolves with stat or throws if not found */
  stat(path: string): Promise<{ mode: number; isDirectory(): boolean }>;
  /** fs.existsSync equivalent */
  existsSync(path: string): boolean;
  /** fs.readdirSync equivalent */
  readdirSync(path: string): string[];
  /** fs.promises.access equivalent */
  access(path: string, mode?: number): Promise<void>;
  /** fs.constants */
  constants: typeof nodeFsSync.constants;
  /** fs.promises.readFile */
  readFile(path: string, encoding: "utf-8"): Promise<string>;
}

/**
 * Minimal execFile interface for doctor checks.
 */
export type ExecFileFunction = (
  file: string,
  args: string[],
  options?: { timeout?: number; signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Minimal GitHubClient port subset needed by doctor checks.
 */
export interface DoctorGitHubClient {
  verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>;
}

/**
 * DoctorContext: injectable dependencies for all doctor checks.
 * Unit tests provide a mock; production code provides real implementations.
 */
export interface DoctorContext {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string | undefined>;
  /** Current time (useful for mocking) */
  now: Date;
  /** fetch function (injectable for mocking) */
  fetch: typeof globalThis.fetch;
  /** File system operations */
  fs: DoctorFs;
  /** execFile function */
  execFile: ExecFileFunction;
  /** Config data (already loaded) — provides raw config values */
  config: DoctorConfig;
  /** GitHub client port */
  githubClient: DoctorGitHubClient;
  /** Home directory */
  homeDir: string;
  /** Node.js version string (e.g. "v20.0.0") — injected from process.version */
  processVersion: string;
  /** OS platform — injected from process.platform */
  platform: NodeJS.Platform;
}

/**
 * Config accessor used by doctor checks.
 * Provides access to raw config values without requiring the full ConfigStore port.
 */
export interface DoctorConfig {
  /** Get a dotted-path config value, e.g. "anthropic.apiKey" */
  get(path: string): unknown;
  /** Whether the config was successfully loaded */
  loaded: boolean;
  /** Error message if config failed to load (e.g. malformed JSON), otherwise undefined */
  loadError?: string;
}
