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
  /**
   * Human-only rounded view of `details`.
   * When present, `formatHuman` renders this instead of `details`.
   * `formatJson` always uses the full `details` and never emits this field.
   */
  detailsHuman?: string[];
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
 *
 * The const below co-exists with the interface in separate declaration spaces,
 * providing a runtime-accessible export so dynamic import destructuring works.
 * @internal
 */
export const DoctorContext: undefined = undefined;

export interface DoctorContext {
  /** Current working directory (invoker cwd — may be a subdirectory of the repo root) */
  cwd: string;
  /**
   * Git repository root resolved at dispatch time.
   * undefined = not yet resolved (backward-compatible with existing check mocks that don't set it).
   * null      = invoker is outside a git repository (doctor runs, repo checks report fail).
   * string    = the actual repo root path (repo/storage checks must use this instead of cwd).
   */
  repoRoot?: string | null;
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
  /**
   * Resolved GitHub token from credentials file or GITHUB_TOKEN env var.
   * null when no token is available (credentials missing + env var not set).
   */
  resolvedGitHubToken: string | null;
  /**
   * Source of the resolved GitHub token ("credentials", "env", or "gh").
   * null when no token is available (resolvedGitHubToken is null).
   */
  githubTokenSource: "credentials" | "env" | "gh" | null;
  /**
   * Resolved Anthropic API key from credentials file or SPECRUNNER_API_KEY env var.
   * null when no key is available.
   */
  resolvedSpecRunnerApiKey: string | null;
  /**
   * Source of the resolved Anthropic API key ("credentials" or "env").
   * null when no key is available (resolvedSpecRunnerApiKey is null).
   */
  specRunnerApiKeySource: "credentials" | "env" | null;
  /**
   * Resolved Claude Code OAuth token from env or credentials.
   * null when no token is available.
   */
  resolvedClaudeCodeOAuthToken: string | null;
  /**
   * Source of the resolved Claude Code OAuth token ("credentials" or "env").
   * null when no token is available.
   */
  claudeCodeOAuthTokenSource: "credentials" | "env" | null;
  /**
   * Absolute path to the user-global config file, resolved using the same
   * XDG_CONFIG_HOME logic as getConfigPath() in src/util/xdg.ts.
   * Used by config-file-exists check so that the check honours XDG_CONFIG_HOME.
   */
  configPath: string;
}

/**
 * Config accessor used by doctor checks.
 * Provides access to raw config values without requiring the full ConfigStore port.
 */
export interface DoctorConfig {
  /** Get a dotted-path config value, e.g. "github.accessToken" or "agents.design.agentId" */
  get(path: string): unknown;
  /** Whether the config was successfully loaded */
  loaded: boolean;
  /** Error message if config failed to load (e.g. malformed JSON), otherwise undefined */
  loadError?: string;
  /** Absolute path to the config file that failed to load. When set, used in doctor hints
   *  instead of the default user-global path. Undefined preserves backward-compatible behaviour. */
  loadErrorPath?: string;
}
