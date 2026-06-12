/**
 * Config schema and validator for specrunner CLI.
 * Validation is performed via a two-layer flow:
 *   1. configSchema.safeParse (zod/v4-mini) — structural type/range/enum checks
 *   2. runSemanticChecks — post-schema checks (model registry, byRequestType semantics)
 *
 * Design D4: agents is Record<StepName, AgentRecord> — the single canonical map.
 * Legacy `agent` (singular) and intermediate `agents.{propose,specFixer,specReview}` shapes
 * are handled by migrate.ts at load time.
 */
import {
  string,
  number,
  object,
  array,
  union,
  literal,
  optional,
  nullable,
  record,
  safeParse as zodSafeParse,
  int,
  gte,
  lte,
  minLength,
} from "zod/v4-mini";
import { BUILTIN_MODEL_REGISTRY } from "./model-registry.js";
import type { AgentStepName } from "../state/schema.js";
import { stderrWrite } from "../logger/stdout.js";

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
 * A single verification command entry.
 * Can be a plain string (shorthand) or an object with optional name and required run.
 *
 * - string: `"ruff check"` → executed as `sh -c "ruff check"`
 * - object with name: `{ name: "lint", run: "eslint ./src" }` → label displayed on failure
 * - object without name: `{ run: "pytest" }` → command string displayed on failure
 */
export type VerificationCommand = string | { name?: string; run: string };

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
  commands?: VerificationCommand[];
}

/** Pipeline-level settings */
export interface PipelineConfig {
  /**
   * Maximum number of spec-review iterations (body execution count).
   * Default: 2. Valid range: 1-10.
   */
  maxRetries?: number;
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
 * Resolve InboxConfig with defaults applied.
 * Returns a fully-resolved config with all fields present.
 */
export function resolveInboxConfig(config: SpecRunnerConfig): Required<InboxConfig> {
  return {
    approveLabel: config.inbox?.approveLabel ?? DEFAULT_INBOX_APPROVE_LABEL,
    maxStartsPerRun: config.inbox?.maxStartsPerRun ?? DEFAULT_INBOX_MAX_STARTS_PER_RUN,
  };
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
 * Applied to the local ClaudeCodeRunner only; ignored by managed runtime.
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
 * Resolve TransientRetryConfig with defaults applied.
 * Returns a fully-resolved config with all fields present.
 */
export function resolveTransientRetryConfig(config: SpecRunnerConfig): Required<TransientRetryConfig> {
  return {
    maxRetries: config.transientRetry?.maxRetries ?? DEFAULT_TRANSIENT_RETRY_MAX,
    baseDelayMs: config.transientRetry?.baseDelayMs ?? DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS,
  };
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
   * Applied to local runtime (ClaudeCodeRunner) only; ignored by managed runtime.
   */
  transientRetry?: TransientRetryConfig;
  /**
   * Test file generation settings.
   * When tests.placement is set, the implementer step injects a deterministic
   * test placement directive into its user message, overriding free-form agent judgment.
   * When absent, the implementer follows the existing test placement pattern in the project.
   */
  tests?: TestsConfig;
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
}

// ---------------------------------------------------------------------------
// Zod schema definitions (T-01)
// ---------------------------------------------------------------------------

/** Agent record: all three string fields are required. */
const agentRecordSchema = nullable(
  object(
    {
      agentId: string("must be a string."),
      definitionHash: string("must be a string."),
      lastSyncedAt: string("must be a string."),
    },
    "must be an object.",
  ),
);

/** byRequestType entry: step fields without nested byRequestType (nested detection is post-schema). */
const byRequestTypeEntrySchema = nullable(
  object(
    {
      maxTurns: optional(
        nullable(
          number("must be a positive integer or null.").check(
            int("must be a positive integer or null."),
            gte(1, "must be a positive integer or null."),
          ),
        ),
      ),
      model: optional(
        string("must be a non-empty string.").check(
          minLength(1, "must be a non-empty string."),
        ),
      ),
      timeoutMs: optional(
        nullable(
          number("must be a non-negative integer or null.").check(
            int("must be a non-negative integer or null."),
            gte(0, "must be a non-negative integer or null."),
          ),
        ),
      ),
    },
    "must be an object.",
  ),
);

/** Step entry: includes byRequestType (value schema does not include nested byRequestType). */
const stepEntrySchema = nullable(
  object(
    {
      maxTurns: optional(
        nullable(
          number("must be a positive integer or null.").check(
            int("must be a positive integer or null."),
            gte(1, "must be a positive integer or null."),
          ),
        ),
      ),
      model: optional(
        string("must be a non-empty string.").check(
          minLength(1, "must be a non-empty string."),
        ),
      ),
      timeoutMs: optional(
        nullable(
          number("must be a non-negative integer or null.").check(
            int("must be a non-negative integer or null."),
            gte(0, "must be a non-negative integer or null."),
          ),
        ),
      ),
      byRequestType: optional(
        record(string(), byRequestTypeEntrySchema, "must be an object."),
      ),
    },
    "must be an object.",
  ),
);

/** Model entry: provider must be "anthropic" or "openai". */
const modelEntrySchema = object(
  {
    provider: union(
      [literal("anthropic"), literal("openai")],
      'must be "anthropic" or "openai".',
    ),
  },
  "must be an object.",
);

/** Non-empty string helper used by test placement schemas. */
const nonEmptyString = (msg: string) =>
  string(msg).check(minLength(1, msg));

/** sibling: test file placed in the same directory as the source file. */
const siblingPlacementSchema = object(
  {
    style: literal("sibling", 'style must be "sibling" or "mirror".'),
    suffix: optional(nonEmptyString("must be a non-empty string.")),
  },
  'must be an object with style "sibling" or "mirror".',
);

/** mirror: test files placed under testsRoot, mirroring the source tree. */
const mirrorPlacementSchema = object(
  {
    style: literal("mirror", 'style must be "sibling" or "mirror".'),
    testsRoot: nonEmptyString("must be a non-empty string."),
    sourceRoot: optional(nonEmptyString("must be a non-empty string.")),
    suffix: optional(nonEmptyString("must be a non-empty string.")),
  },
  'must be an object with style "sibling" or "mirror".',
);

/**
 * Schema for tests.placement discriminated union.
 * Valid values: { style: "sibling", suffix? } | { style: "mirror", testsRoot, sourceRoot?, suffix? }
 */
const testPlacementSchema = union(
  [siblingPlacementSchema, mirrorPlacementSchema],
  'must have style "sibling" or "mirror" with required fields.',
);

/** Verification command: non-empty string or object with required run field. */
const verificationCommandSchema = union(
  [
    string("must be a non-empty string.").check(
      minLength(1, "must be a non-empty string."),
    ),
    object(
      {
        run: string().check(minLength(1, "must be a non-empty string.")),
        name: optional(string("must be a string.")),
      },
      "must be a string or object with a run field.",
    ),
  ],
  "must be a string or object with a run field.",
);

/**
 * Structural config schema using zod/v4-mini.
 * Field order matches legacy validation order: runtime → agents → environment →
 * specReview → pipeline → steps → models → progress → verification → github → logs → archive.
 * Unknown top-level fields are stripped (default object behavior).
 */
export const configSchema = object({
  version: literal(1, "Config version must be 1."),
  runtime: optional(
    union(
      [literal("managed"), literal("local")],
      'must be "managed" or "local".',
    ),
  ),
  agents: optional(record(string(), agentRecordSchema, "must be an object.")),
  environment: optional(
    object(
      {
        id: string("must be a string."),
        lastSyncedAt: string("must be a string."),
      },
      "must be an object.",
    ),
  ),
  specReview: optional(
    object(
      {
        pollIntervalMs: optional(
          number("must be a positive integer.").check(
            int("must be a positive integer."),
            gte(1, "must be a positive integer."),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  pipeline: optional(
    object(
      {
        maxRetries: optional(
          number("must be between 1 and 10.").check(
            int("must be between 1 and 10."),
            gte(1, "must be between 1 and 10."),
            lte(10, "must be between 1 and 10."),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  steps: optional(record(string(), stepEntrySchema, "must be an object.")),
  models: optional(
    record(string(), modelEntrySchema, "must be an object."),
  ),
  progress: optional(
    object(
      {
        heartbeatIntervalSec: optional(
          nullable(
            number("must be a non-negative integer or null.").check(
              int("must be a non-negative integer or null."),
              gte(0, "must be a non-negative integer or null."),
            ),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  verification: optional(
    object(
      {
        commands: optional(
          array(verificationCommandSchema, "must be an array."),
        ),
      },
      "must be an object.",
    ),
  ),
  github: optional(
    object(
      {
        host: optional(
          string("must be a non-empty string.").check(
            minLength(1, "must be a non-empty string."),
          ),
        ),
        apiBaseUrl: optional(
          string("must be a non-empty string.")
            .check(minLength(1, "must be a non-empty string."))
            .check((ctx) => {
              if (!ctx.value.startsWith("https://")) {
                ctx.issues.push({
                  code: "custom",
                  message: "must start with https://.",
                  input: ctx.value,
                });
              }
            }),
        ),
      },
      "must be an object.",
    ),
  ),
  logs: optional(
    object(
      {
        maxJobs: optional(
          number("must be an integer between 1 and 1000.").check(
            int("must be an integer between 1 and 1000."),
            gte(1, "must be an integer between 1 and 1000."),
            lte(1000, "must be an integer between 1 and 1000."),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  archive: optional(
    object(
      {
        mergeWaitTimeoutMs: optional(
          nullable(
            number("must be a non-negative integer or null.").check(
              int("must be a non-negative integer or null."),
              gte(0, "must be a non-negative integer or null."),
            ),
          ),
        ),
        mergeWaitPollIntervalMs: optional(
          number("must be a positive integer.").check(
            int("must be a positive integer."),
            gte(1, "must be a positive integer."),
          ),
        ),
        protectedPaths: optional(
          array(
            string("must be a non-empty string.").check(
              minLength(1, "must be a non-empty string."),
            ),
            "must be an array.",
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  inbox: optional(
    object(
      {
        approveLabel: optional(
          string("must be a non-empty string.").check(
            minLength(1, "must be a non-empty string."),
          ),
        ),
        maxStartsPerRun: optional(
          number("must be a non-negative integer.").check(
            int("must be a non-negative integer."),
            gte(0, "must be a non-negative integer."),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  transientRetry: optional(
    object(
      {
        maxRetries: optional(
          number("must be a non-negative integer.").check(
            int("must be a non-negative integer."),
            gte(0, "must be a non-negative integer."),
          ),
        ),
        baseDelayMs: optional(
          number("must be a non-negative integer.").check(
            int("must be a non-negative integer."),
            gte(0, "must be a non-negative integer."),
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  tests: optional(
    object(
      {
        placement: optional(testPlacementSchema),
      },
      "must be an object.",
    ),
  ),
});

// ---------------------------------------------------------------------------
// T-02: error translation layer
// ---------------------------------------------------------------------------

/**
 * Render a zod path array to a human-readable string.
 * Numeric segments → `[n]`, string segments → `.seg` (first segment: no prefix).
 * Example: ["steps","code-review","byRequestType","spec-change","model"]
 *       → "steps.code-review.byRequestType.spec-change.model"
 * Example: ["verification","commands",0,"run"] → "verification.commands[0].run"
 */
function renderPath(path: (string | number)[]): string {
  let result = "";
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]!;
    if (typeof seg === "number") {
      result += `[${seg}]`;
    } else if (i === 0) {
      result = seg;
    } else {
      result += `.${seg}`;
    }
  }
  return result;
}

/**
 * Translate the first zod issue into a thrown Error, following the no-code exception table.
 * Always throws; return type is `never`.
 */
function throwFromFirstIssue(issues: Array<{ path: (string | number)[]; message: string; code: string }>): never {
  const issue = issues[0]!;
  const { path, message } = issue;

  // Root non-object: empty path + invalid_type → no code, no CONFIG_INVALID prefix
  if (path.length === 0 && issue.code === "invalid_type") {
    throw new Error("Config must be a JSON object.");
  }

  // version field failure → no code, no CONFIG_INVALID prefix
  if (path.length === 1 && path[0] === "version") {
    throw new Error("Config version must be 1.");
  }

  const renderedPath = renderPath(path);
  const fullMsg = `CONFIG_INVALID: ${renderedPath} ${message}`;

  // pipeline.maxRetries → no code (special no-code exception)
  if (path[0] === "pipeline" && path[1] === "maxRetries") {
    throw new Error(fullMsg);
  }

  // All other validation failures: code = CONFIG_INVALID
  throw Object.assign(new Error(fullMsg), { code: "CONFIG_INVALID" });
}

// ---------------------------------------------------------------------------
// T-03: post-schema semantic checks
// ---------------------------------------------------------------------------

const KNOWN_REQUEST_TYPES = new Set([
  "bug-fix",
  "spec-change",
  "new-feature",
  "refactoring",
  "chore",
]);

/**
 * Check that step models exist in the merged registry and that OpenAI models
 * are not used with managed runtime.
 */
function checkModelRegistry(raw: Record<string, unknown>): void {
  if (raw["steps"] === undefined || raw["steps"] === null) return;

  const userModels = (raw["models"] ?? {}) as Record<string, { provider?: string }>;
  const merged = { ...BUILTIN_MODEL_REGISTRY, ...userModels };
  const allModelNames = new Set(Object.keys(merged));
  const openaiModels = new Set(
    Object.entries(merged)
      .filter(([, v]) => (v as { provider?: string }).provider === "openai")
      .map(([k]) => k),
  );
  const isManagedRuntime = raw["runtime"] === "managed";

  const checkModel = (model: string, path: string): void => {
    if (!allModelNames.has(model)) {
      throw Object.assign(
        new Error(
          `CONFIG_INVALID: ${path} "${model}" is not in the model registry. Add it to config.models.`,
        ),
        { code: "CONFIG_INVALID" },
      );
    }
    if (isManagedRuntime && openaiModels.has(model)) {
      throw Object.assign(
        new Error(
          `CONFIG_INVALID: OpenAI model "${model}" cannot be used with runtime "managed".`,
        ),
        { code: "CONFIG_INVALID" },
      );
    }
  };

  const stepsObj = raw["steps"] as Record<string, unknown>;
  for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
    if (!stepVal || typeof stepVal !== "object") continue;
    const stepCfg = stepVal as Record<string, unknown>;

    // Step-level model
    if (typeof stepCfg["model"] === "string" && stepCfg["model"].length > 0) {
      checkModel(stepCfg["model"], `steps.${stepKey}.model`);
    }

    // byRequestType models
    if (stepCfg["byRequestType"] && typeof stepCfg["byRequestType"] === "object") {
      const byRT = stepCfg["byRequestType"] as Record<string, unknown>;
      for (const [typeKey, typeVal] of Object.entries(byRT)) {
        if (!typeVal || typeof typeVal !== "object") continue;
        const typeCfg = typeVal as Record<string, unknown>;
        if (typeof typeCfg["model"] === "string" && typeCfg["model"].length > 0) {
          checkModel(
            typeCfg["model"],
            `steps.${stepKey}.byRequestType.${typeKey}.model`,
          );
        }
      }
    }
  }
}

/**
 * Check byRequestType semantics: empty string keys, nested byRequestType (1-level limit),
 * and unknown type key warnings.
 */
function checkByRequestTypeSemantics(raw: Record<string, unknown>): void {
  if (raw["steps"] === undefined || raw["steps"] === null) return;

  const stepsObj = raw["steps"] as Record<string, unknown>;
  for (const [stepKey, stepVal] of Object.entries(stepsObj)) {
    if (!stepVal || typeof stepVal !== "object") continue;
    const stepCfg = stepVal as Record<string, unknown>;

    if (
      stepCfg["byRequestType"] === undefined ||
      stepCfg["byRequestType"] === null
    )
      continue;
    const byRT = stepCfg["byRequestType"] as Record<string, unknown>;

    for (const [typeKey, typeVal] of Object.entries(byRT)) {
      // Empty string key
      if (typeKey.length === 0) {
        throw Object.assign(
          new Error(
            `CONFIG_INVALID: steps.${stepKey}.byRequestType contains an empty string key.`,
          ),
          { code: "CONFIG_INVALID" },
        );
      }

      // Unknown type key — warning only, do not throw
      if (!KNOWN_REQUEST_TYPES.has(typeKey)) {
        stderrWrite(
          `[specrunner] warn: steps.${stepKey}.byRequestType.${typeKey} is not a known request type. Known types: ${[...KNOWN_REQUEST_TYPES].join(", ")}.`,
        );
      }

      if (!typeVal || typeof typeVal !== "object") continue;
      const typeCfg = typeVal as Record<string, unknown>;

      // Nested byRequestType — 1-level limit
      if (typeCfg["byRequestType"] !== undefined) {
        throw Object.assign(
          new Error(
            `CONFIG_INVALID: steps.${stepKey}.byRequestType.${typeKey}.byRequestType is not allowed (1-level limit).`,
          ),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }
}

/**
 * Run all post-schema semantic checks on the raw (unmodified) config object.
 */
function runSemanticChecks(raw: Record<string, unknown>): void {
  checkModelRegistry(raw);
  checkByRequestTypeSemantics(raw);
}

// ---------------------------------------------------------------------------
// T-04: validateConfig — 2-layer flow
// ---------------------------------------------------------------------------

/**
 * Validate that the raw parsed config contains required fields.
 * Called AFTER migration — expects new canonical schema.
 * Returns typed config or throws describing the missing field.
 * Throws CONFIG_INVALID if pipeline.maxRetries is out of range (1-10).
 * Throws CONFIG_INVALID if runtime is not "managed" or "local".
 *
 * D7 (design.md): runtime === "local" skips apiKey validation.
 */
export function validateConfig(raw: unknown): SpecRunnerConfig {
  // Layer 1: structural validation via zod schema
  const result = zodSafeParse(configSchema, raw);
  if (!result.success) {
    throwFromFirstIssue(
      result.error.issues as Array<{ path: (string | number)[]; message: string; code: string }>,
    );
  }

  // Layer 2: post-schema semantic checks on the original raw (preserves unknown fields)
  runSemanticChecks(raw as Record<string, unknown>);

  // Return the original raw cast to SpecRunnerConfig (preserves unknown fields like `jobs`).
  return raw as SpecRunnerConfig;
}

/**
 * Check if config has all fields needed to run the pipeline.
 * Returns error message or null if complete.
 *
 * Managed-runtime specific checks (apiKey, agents, environment) have moved to
 * `checkRuntimePrereqs` in preflight.ts to allow a cleaner separation.
 * TC-033: CONFIG_INCOMPLETE not raised for local runtime with missing apiKey.
 * TC-052: local runtime allows missing spec-review agent ID.
 */
export function checkConfigComplete(
  _cfg: SpecRunnerConfig,
): { field: string; hint: string } | null {
  // GitHub token check moved to runPreflight (resolveGitHubToken via credentials file / env var).
  // Config no longer stores secrets.
  return null;
}
