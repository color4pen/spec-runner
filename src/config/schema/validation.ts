/**
 * Config validation: zod structural schema, error translation, and post-schema
 * semantic checks. `validateConfig` is the two-layer entry point.
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
  gt,
  gte,
  lte,
  minLength,
  boolean,
} from "zod/v4-mini";
import { BUILTIN_MODEL_REGISTRY } from "../model-registry.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { SpecRunnerConfig } from "./types.js";

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

/** Shell command: non-empty string or object with required run field. Shared by verification.commands and workspace.setup. */
const shellCommandSchema = union(
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
 * specReview → pipeline → steps → models → progress → verification → github → logs → archive →
 * inbox → transientRetry → tests.
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
        fast: optional(
          object(
            {
              forbiddenSurfaces: optional(
                array(
                  object(
                    {
                      id: string("must be a non-empty string.").check(
                        minLength(1, "must be a non-empty string."),
                      ),
                      paths: array(
                        string("must be a non-empty string.").check(
                          minLength(1, "must be a non-empty string."),
                        ),
                        "must be an array.",
                      ),
                    },
                    "must be an object.",
                  ),
                  "must be an array.",
                ),
              ),
            },
            "must be an object.",
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
          array(shellCommandSchema, "must be an array."),
        ),
        coverage: optional(
          object(
            {
              command: shellCommandSchema,
              lcovPath: nonEmptyString("must be a non-empty string."),
              include: array(
                nonEmptyString("must be a non-empty string."),
                "must be an array.",
              ).check(minLength(1, "must be a non-empty array.")),
              exclude: optional(
                array(
                  nonEmptyString("must be a non-empty string."),
                  "must be an array.",
                ),
              ),
              minChangedLineCoverage: optional(
                number("must be a number greater than 0 and at most 1.").check(
                  gt(0, "must be a number greater than 0 and at most 1."),
                  lte(1, "must be a number greater than 0 and at most 1."),
                ),
              ),
            },
            "must be an object.",
          ),
        ),
      },
      "must be an object.",
    ),
  ),
  workspace: optional(
    object(
      {
        setup: optional(array(shellCommandSchema, "must be an array.")),
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
        postMergeVerify: optional(array(shellCommandSchema, "must be an array.")),
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
  designLayer: optional(
    object(
      {
        enabled: optional(boolean("must be a boolean.")),
        command: optional(
          string("must be a non-empty string.").check(
            minLength(1, "must be a non-empty string."),
          ),
        ),
        requireCitationTypes: optional(
          array(
            string("must be a non-empty string.").check(
              minLength(1, "must be a non-empty string."),
            ),
            "must be an array.",
          ),
        ),
        topicEmission: optional(boolean("must be a boolean.")),
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
