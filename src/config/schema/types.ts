/**
 * Config schema types: interfaces, type aliases, and default constants.
 * Pure declarations — no validation logic, no resolvers.
 */
import type { AgentStepName } from "../../state/schema.js";

/**
 * Per-step execution config: model, maxTurns, timeoutMs.
 * All fields are optional — missing fields fall back to the next priority level.
 *
 * maxTurns: null = unlimited (do not pass maxTurns to SDK)
 * maxTurns: undefined = not set at this priority level, fall back to next
 * timeoutMs: null = no timeout
 *
 * byRequestType: per-request-type model override. Keys are request type names
 * (e.g. "bug-fix", "spec-change", "new-feature"). Values are StepExecutionConfig
 * objects — 1 level deep only, nested byRequestType is prohibited (CONFIG_INVALID).
 * When requestType matches a key, the corresponding config takes highest priority
 * over the step-level config.
 */
export interface StepExecutionConfig {
  model?: string;
  maxTurns?: number | null;
  timeoutMs?: number | null;
  byRequestType?: Record<string, StepExecutionConfig>;
}

export interface ModelEntry {
  provider: "anthropic" | "openai";
}

export interface ModelsConfig {
  [modelName: string]: ModelEntry;
}

/**
 * Map of step names to per-step execution config.
 * `defaults` applies to all steps not explicitly overridden.
 * Other keys are step names (kebab-case: "implementer", "spec-review", etc.)
 *
 * D1 (design.md): Record-based to avoid type changes when new steps are added.
 */
export interface StepConfigMap {
  defaults?: StepExecutionConfig;
  [stepName: string]: StepExecutionConfig | undefined;
}

/**
 * Per-role agent record stored in config.
 * Note: field is `agentId` (not `id`) in the new canonical schema.
 */
export interface AgentRecord {
  agentId: string;
  definitionHash: string;
  lastSyncedAt: string;
}

export interface EnvironmentConfig {
  id: string;
  lastSyncedAt: string;
}

export interface SpecReviewConfig {
  /** Polling interval in milliseconds. Default: 10000 (10s) */
  pollIntervalMs?: number;
}

/** Progress display settings */
export interface ProgressConfig {
  /**
   * Heartbeat interval in seconds.
   * 0 or null disables the heartbeat entirely.
   * When absent, defaults to 30s (TTY) or 60s (non-TTY) at runtime.
   */
  heartbeatIntervalSec?: number | null;
}

export type SpecFixerConfig = Record<string, never>;

/**
 * A single shell command entry.
 * Can be a plain string (shorthand) or an object with optional name and required run.
 *
 * - string: `"ruff check"` → executed as `sh -c "ruff check"`
 * - object with name: `{ name: "lint", run: "eslint ./src" }` → label displayed on failure
 * - object without name: `{ run: "pytest" }` → command string displayed on failure
 *
 * Used by both `verification.commands` and `workspace.setup`.
 */
export type ShellCommand = string | { name?: string; run: string };

/**
 * Alias for backward compatibility.
 * @deprecated Use ShellCommand directly.
 */
export type VerificationCommand = ShellCommand;

/**
 * Changed-line coverage gate configuration.
 * When declared, verification runs a coverage command, parses the lcov output,
 * and asserts that changed lines (base…HEAD diff) were executed by the test suite.
 */
export interface CoverageConfig {
  /**
   * Shell command that runs the test suite with coverage output enabled.
   * Must produce an lcov file at `lcovPath` when successful.
   * Executed via `sh -c <command>` (POSIX shell, Windows not supported).
   */
  command: ShellCommand;
  /**
   * cwd-relative path to the lcov output file (e.g. "coverage/lcov.info").
   * Must be a non-empty string.
   */
  lcovPath: string;
  /**
   * Glob patterns of files to include in coverage verification (required, non-empty).
   * Only changed files matching at least one pattern are checked.
   * Example: ["src/**"]
   */
  include: string[];
  /**
   * Glob patterns of files to exclude from coverage verification (optional).
   * Changed files matching any pattern are skipped (not treated as failures).
   * Example: ["src/generated/**"]
   */
  exclude?: string[];
  /**
   * Minimum ratio of changed executable lines (DA records) that must be executed.
   * Range: greater than 0, at most 1 (0 is rejected — it would be weaker than the default).
   * When absent, the default threshold is "at least 1 changed line executed".
   * Example: 0.8 = 80% of changed DA lines must have count > 0.
   */
  minChangedLineCoverage?: number;
}

/**
 * Verification step configuration.
 * When commands is defined, runVerification() executes them in order (fail-fast).
 * When commands is undefined, the existing phase-detection fallback is used.
 */
export interface VerificationConfig {
  /**
   * Ordered list of commands to execute during verification.
   * Each command is executed via `sh -c <command>` (POSIX shell, Windows not supported).
   * fail-fast: first non-zero exit code stops the sequence; remaining entries are skipped.
   * When absent, falls back to package.json script detection (build/typecheck/test/lint/security).
   */
  commands?: ShellCommand[];
  /**
   * Changed-line coverage gate configuration.
   * When declared, verification runs a coverage command after main verification,
   * parses the lcov output, and asserts that changed lines were executed.
   * Works in both commands path and phases path.
   * When absent, the gate is skipped (existing behaviour preserved).
   */
  coverage?: CoverageConfig;
}

/**
 * Workspace (worktree) setup configuration.
 * Controls commands executed in the worktree after `git worktree add` and before verification.
 *
 * When `setup` is defined, the specified commands are executed instead of the default
 * package-manager install (detectPm + installCommand).
 *
 * When `setup` is undefined (not set), the default behaviour applies:
 * - If JS dependency traces (lockfile or package.json) exist in repoRoot → detectPm + install (existing behaviour).
 * - If no JS dependency traces exist → install is skipped (non-JS / greenfield projects pass by default).
 *
 * An empty array `[]` is a valid value and means "explicitly skip install" (distinct from undefined).
 */
export interface WorkspaceConfig {
  /**
   * Ordered list of commands to execute in the worktree after `git worktree add`.
   * Executed via `sh -c <command>` (POSIX shell, Windows not supported).
   * fail-fast: first non-zero exit code stops the sequence; remaining entries are skipped.
   * On failure, the worktree is cleaned up (git worktree remove --force + rm -rf) and an error is thrown.
   *
   * When absent, falls back to JS dependency trace detection:
   * - Traces found → detectPm + install (lockfile-based package manager install).
   * - No traces → skip install (non-JS / greenfield project).
   *
   * Examples:
   *   ["uv sync"]
   *   ["go mod download"]
   *   [{ "name": "deps", "run": "pip install -r requirements.txt" }]
   *   []  (empty array = explicit install skip even for JS projects)
   */
  setup?: ShellCommand[];
}

/**
 * A single forbidden surface entry for the fast pipeline's permissionScope.
 * Structurally compatible with core's ForbiddenSurface — no cross-layer import needed.
 */
export interface ForbiddenSurfaceConfig {
  /** Stable identifier for this surface (e.g. "public-types"). */
  id: string;
  /** Glob patterns matched against base…HEAD changed-file paths. */
  paths: string[];
}

/**
 * Fast-pipeline-specific configuration.
 * Currently holds the per-repo forbidden surfaces list.
 */
export interface FastPipelineConfig {
  /**
   * Forbidden surface declarations for the fast pipeline's conformance checkpoint.
   * When absent or empty, no breach is detected (gate mechanism is still active).
   * Each entry is matched against changed files at the conformance step.
   *
   * Example:
   *   [{ "id": "public-types", "paths": ["src/core/port/**"] }]
   */
  forbiddenSurfaces?: ForbiddenSurfaceConfig[];
}

/** Pipeline-level settings */
export interface PipelineConfig {
  /**
   * Maximum number of spec-review iterations (body execution count).
   * Default: 2. Valid range: 1-10.
   */
  maxRetries?: number;
  /**
   * Fast pipeline profile settings.
   * Absent = fast pipeline has no forbidden surfaces (no breach detection).
   */
  fast?: FastPipelineConfig;
}

/**
 * Log retention settings.
 * Controls how many job logs are retained in .specrunner/logs/.
 */
export interface LogsConfig {
  /**
   * Maximum number of job log entries to retain.
   * Oldest logs are deleted when this limit is exceeded.
   * Valid range: 1-1000. Default: 20.
   */
  maxJobs?: number;
}

/**
 * Default test file suffix used by renderTestPlacementInstruction when suffix is not specified.
 */
export const DEFAULT_TEST_SUFFIX = ".test.ts";

/**
 * sibling placement: test file is placed in the same directory as the source file.
 * Example: src/foo/bar.ts → src/foo/bar.test.ts
 */
export interface SiblingPlacement {
  style: "sibling";
  /** File suffix for the generated test file. Defaults to DEFAULT_TEST_SUFFIX (".test.ts"). */
  suffix?: string;
}

/**
 * mirror placement: test files are placed under testsRoot, mirroring the source tree.
 * Example (testsRoot: "tests", sourceRoot: "src"): src/foo/bar.ts → tests/foo/bar.test.ts
 * Example (testsRoot: "tests", no sourceRoot): src/foo/bar.ts → tests/src/foo/bar.test.ts
 */
export interface MirrorPlacement {
  style: "mirror";
  /** Root directory for mirrored test files (non-empty string, e.g. "tests"). */
  testsRoot: string;
  /** Source root prefix to strip when mirroring (e.g. "src"). Optional. */
  sourceRoot?: string;
  /** File suffix for the generated test file. Defaults to DEFAULT_TEST_SUFFIX (".test.ts"). */
  suffix?: string;
}

/**
 * TestPlacement is a discriminated union on `style`.
 * Declared in project config under `tests.placement`.
 */
export type TestPlacement = SiblingPlacement | MirrorPlacement;

/**
 * Test file generation settings for this project.
 */
export interface TestsConfig {
  /**
   * Declares where generated test files should be placed.
   * When absent, the implementer agent follows the existing test placement pattern in the project.
   */
  placement?: TestPlacement;
}

/**
 * Default wait timeout for --with-merge (10 minutes).
 * Covers most typical CI pipelines. Set archive.mergeWaitTimeoutMs: null for unlimited.
 */
export const DEFAULT_MERGE_WAIT_TIMEOUT_MS = 600_000;

/**
 * Default poll interval for --with-merge check status polling (15 seconds).
 */
export const DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS = 15_000;

/**
 * Archive-specific configuration.
 * Controls --with-merge wait behaviour and merge guard.
 */
export interface ArchiveConfig {
  /**
   * Maximum time in milliseconds to wait for PR checks to become green before giving up.
   * null = wait indefinitely (no timeout) — aligns with maxTurns: null convention.
   * undefined / absent = use DEFAULT_MERGE_WAIT_TIMEOUT_MS (600_000 ms = 10 minutes).
   * 0 = no wait (attempt merge immediately after first check-status poll).
   */
  mergeWaitTimeoutMs?: number | null;
  /**
   * Interval in milliseconds between check-status polls while waiting for green.
   * undefined / absent = use DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS (15_000 ms = 15 seconds).
   */
  mergeWaitPollIntervalMs?: number;
  /**
   * Glob patterns for files that must not be auto-merged.
   * When a PR changes any file matching one of these patterns, `job archive --with-merge`
   * stops with an escalation instead of merging automatically.
   *
   * Absent or empty array = no guard (backward compatible).
   * Each element must be a non-empty string glob pattern.
   *
   * Examples:
   *   [".github/workflows/**", "release-please-config.json"]
   */
  protectedPaths?: string[];
  /**
   * Ordered list of shell commands to run on the merged base branch after
   * `job archive --with-merge` squash-merges. Commands run fail-fast inside an
   * ephemeral worktree at the merge SHA. A non-zero exit escalates immediately.
   *
   * Uses the same `ShellCommand` shape as `verification.commands` and `workspace.setup`.
   * Absent or empty array = no integrity check (backward compatible).
   *
   * Example: ["bun install --frozen-lockfile"]
   */
  postMergeVerify?: ShellCommand[];
}

/** GitHub host and API base URL configuration. */
export interface GitHubHostConfig {
  /** GitHub host (e.g. "github.com" or "ghes.corp.example.com"). Default: "github.com". */
  host?: string;
  /** Override API base URL (e.g. "https://ghes.corp.example.com/api/v3"). Derived from host when absent. */
  apiBaseUrl?: string;
}

/**
 * Default label name that marks an issue as approved for automatic job start.
 */
export const DEFAULT_INBOX_APPROVE_LABEL = "specrunner-approved";

/**
 * Default maximum number of new jobs to start in a single `inbox run` invocation.
 * 0 means no new starts (resume-only mode).
 */
export const DEFAULT_INBOX_MAX_STARTS_PER_RUN = 3;

/**
 * Inbox command configuration.
 * Controls automatic issue-to-job dispatch via `specrunner inbox run`.
 */
export interface InboxConfig {
  /**
   * GitHub label name that marks an issue as approved for automatic job start.
   * Default: "specrunner-approved".
   */
  approveLabel?: string;
  /**
   * Maximum number of new jobs to start in a single `inbox run` invocation.
   * 0 = resume-only mode (no new starts).
   * Default: 3.
   */
  maxStartsPerRun?: number;
}

/**
 * Default maximum number of automatic transient-error retries per agent step.
 */
export const DEFAULT_TRANSIENT_RETRY_MAX = 3;

/**
 * Default base delay in ms for the first transient retry (subsequent retries double).
 */
export const DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS = 1000;

/**
 * Configuration for automatic transient-error retries in agent steps.
 * Applied to local runtime runners (ClaudeCodeRunner and CodexAgentRunner); ignored by
 * the managed runtime.
 */
export interface TransientRetryConfig {
  /**
   * Maximum number of automatic retries on transient errors.
   * 0 = disable feature entirely (current behaviour — no retry wrapper, no events).
   * Default: 3.
   */
  maxRetries?: number;
  /**
   * Base delay in ms for the first retry. Subsequent retries double (exponential backoff).
   * Default: 1000.
   */
  baseDelayMs?: number;
}

/**
 * Design-layer CLI (aozu) integration configuration.
 * Controls opt-in wiring of the design layer check gate and mark-implemented hook.
 */
export interface DesignLayerConfig {
  /**
   * Enable design layer integration.
   * When false / absent, aozu is never spawned and existing behaviour is fully preserved.
   * Default: false.
   */
  enabled?: boolean;
  /**
   * Command name to spawn. Default: "aozu".
   * Allows injecting a custom binary or absolute path for testing.
   */
  command?: string;
  /**
   * Request types for which `--require-citation` is passed to `aozu check`.
   * Default: [] (no types require a citation).
   */
  requireCitationTypes?: string[];
  /**
   * Emit design-level findings (decision-needed / origin:"scope") as topic files
   * to design/topics/ during archive. Only meaningful when designLayer.enabled is true.
   * Default: true.
   */
  topicEmission?: boolean;
}

export interface SpecRunnerConfig {
  version: 1;
  /**
   * Agent execution runtime.
   * - "managed": Anthropic Managed Agents via SessionClient
   * - "local":   Claude Code SDK via subprocess invocation (no API key required)
   *
   * D7 (design.md): runtime field added to config. Default "local".
   */
  runtime?: "managed" | "local";
  /**
   * Canonical per-role agent map.
   * Keys are AgentStepNames (kebab-case: "design", "spec-review", "spec-fixer").
   * Populated by ConfigStore.load() after migration.
   * Partial because not all agent steps may be configured (e.g. local runtime).
   */
  agents: Partial<Record<AgentStepName, AgentRecord>>;
  pipeline?: PipelineConfig;
  environment?: EnvironmentConfig;
  specReview?: SpecReviewConfig;
  specFixer?: SpecFixerConfig;
  /**
   * Per-step execution config: model, maxTurns, timeoutMs.
   * Effective for local runtime (ClaudeCodeRunner) and managed agent runtime (ManagedAgentRunner).
   * - ClaudeCodeRunner: AbortController + setTimeout
   * - ManagedAgentRunner: pollUntilComplete() の timeoutMs パラメータ経由
   * Default: null (unlimited) — timeout is only applied when explicitly configured.
   *
   * D1 (design.md): steps is optional for backward compatibility.
   * Steps section absent = use step definition hardcoded values.
   */
  steps?: StepConfigMap;
  /**
   * Progress display settings: heartbeat interval, TTY behaviour.
   * Absent → defaults applied at CLI composition point.
   */
  progress?: ProgressConfig;
  /**
   * User-defined model registry. Merged with BUILTIN_MODEL_REGISTRY at runtime.
   * Use this to add new models or override provider assignments.
   * When absent, only built-in models are available.
   * D5 (design.md): user entries override built-ins.
   */
  models?: ModelsConfig;
  /**
   * Verification step configuration.
   * When verification.commands is defined, runVerification() executes them in order (fail-fast).
   * When absent, the existing phase-detection fallback is used (package.json scripts).
   */
  verification?: VerificationConfig;
  /**
   * Workspace (worktree) setup configuration.
   * When workspace.setup is defined, the specified commands are executed after `git worktree add`
   * instead of the default package-manager install.
   * When absent, JS dependency traces (lockfile or package.json) determine whether install runs.
   */
  workspace?: WorkspaceConfig;
  /**
   * Log retention settings.
   * Controls how many job logs are kept in .specrunner/logs/.
   * When absent, defaults to 20 jobs retained.
   */
  logs?: LogsConfig;
  /**
   * GitHub host configuration.
   * When absent, defaults to github.com / api.github.com (public GitHub).
   */
  github?: GitHubHostConfig;
  /**
   * Archive command configuration.
   * Controls --with-merge wait behaviour (timeout, poll interval).
   */
  archive?: ArchiveConfig;
  /**
   * Inbox command configuration.
   * Controls automatic issue-to-job dispatch via `specrunner inbox run`.
   */
  inbox?: InboxConfig;
  /**
   * Transient-error auto-retry configuration.
   * Controls automatic retry of agent steps on transient connection/socket/5xx errors.
   * Applied to local runtime runners (ClaudeCodeRunner and CodexAgentRunner); ignored by
   * the managed runtime.
   */
  transientRetry?: TransientRetryConfig;
  /**
   * Test file generation settings.
   * When tests.placement is set, the implementer step injects a deterministic
   * test placement directive into its user message, overriding free-form agent judgment.
   * When absent, the implementer follows the existing test placement pattern in the project.
   */
  tests?: TestsConfig;
  /**
   * Design-layer CLI (aozu) integration.
   * When absent or enabled===false, aozu is never spawned and existing behaviour is fully preserved.
   */
  designLayer?: DesignLayerConfig;
}

/**
 * Raw config as it may appear on disk — may contain legacy/intermediate fields.
 * Used only for reading and migration; never written back.
 */
export interface RawConfig {
  version?: number;
  /** See SpecRunnerConfig.runtime */
  runtime?: string; // may be any string — validated in validateConfig
  /** @deprecated Legacy single-agent format. Migrated to agents.propose at load time. */
  agent?: {
    id?: string;
    definitionHash?: string;
    lastSyncedAt?: string;
  };
  /**
   * May be either old intermediate shape (camelCase keys) or new canonical shape (kebab-case).
   * Normalized by migrate().
   */
  agents?: Record<string, unknown>;
  pipeline?: Partial<PipelineConfig>;
  environment?: Partial<EnvironmentConfig>;
  specReview?: Partial<SpecReviewConfig>;
  specFixer?: Partial<SpecFixerConfig>;
  /** Per-step execution config — passed through as-is. Validated in validateConfig(). */
  steps?: Record<string, unknown>;
  models?: Record<string, unknown>;
  progress?: Partial<Record<string, unknown>>;
  /** Verification configuration — passed through as-is. Validated in validateConfig(). */
  verification?: unknown;
  /** Workspace setup configuration — passed through as-is. Validated in validateConfig(). */
  workspace?: unknown;
  /** GitHub host configuration — passed through as-is. Validated in validateConfig(). */
  github?: Partial<Record<string, unknown>>;
  /** Archive configuration — passed through as-is. Validated in validateConfig(). */
  archive?: Partial<Record<string, unknown>>;
  /** Inbox configuration — passed through as-is. Validated in validateConfig(). */
  inbox?: Partial<Record<string, unknown>>;
  /** Transient-retry configuration — passed through as-is. Validated in validateConfig(). */
  transientRetry?: Partial<Record<string, unknown>>;
  /** Tests configuration — passed through as-is. Validated in validateConfig(). */
  tests?: unknown;
  /** Design-layer configuration — passed through as-is. Validated in validateConfig(). */
  designLayer?: Partial<Record<string, unknown>>;
}

/**
 * Resolved design-layer config with all fields present.
 * Use this type to interact with the design-layer integration throughout the codebase.
 */
export interface ResolvedDesignLayer {
  enabled: boolean;
  command: string;
  requireCitationTypes: string[];
  topicEmission: boolean;
}
