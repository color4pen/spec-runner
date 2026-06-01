/**
 * Architecture enforcement allowlist.
 *
 * Documents known divergences from the structural invariants defined in
 * architecture/model.md §4 (B-1 through B-8).
 *
 * GOVERNANCE:
 * - All entries were grandfather'd at the arch-test-core-wide-ratchet change.
 * - This list ONLY shrinks: each entry removal must be paired with the
 *   corresponding code fix (burn-down request).
 * - Adding entries requires explicit approval and a paired tracking issue.
 * - This file is CODEOWNERS-gated (/tests/unit/architecture/ @color4pen) to
 *   prevent unauthorized expansion by the pipeline.
 *
 * Burn-down priority (from architecture/model.md §5):
 *   R1 (parser→core circular) → R4 (util leaf) → R2 (SDK)
 *
 * MATCHING SEMANTICS (used by core-invariants.test.ts):
 * An allowlist entry covers a grep match iff:
 *   - the match file path ends with entry.file (or equals it), AND
 *   - the match line content includes entry.pattern as a substring.
 * Both conditions must hold simultaneously.
 */

/** Single known-divergence record. */
export interface AllowlistEntry {
  /** File path relative to project root (e.g. "src/core/runtime/local.ts") */
  file: string;
  /**
   * Substring present in the violating line — specific enough to identify
   * this violation without accidentally covering future violations in the
   * same file.
   */
  pattern: string;
  /** Invariant being violated (e.g. "B-1", "B-2") */
  invariant: string;
  /**
   * Tracking identifier for the burn-down request.
   * Format: R# (pre-existing) or B#-xxx (new, per-site).
   */
  tracking: string;
  /** Human-readable explanation of why this entry exists and how to fix it. */
  comment?: string;
}

/**
 * Known divergences, grandfather'd at arch-test-core-wide-ratchet.
 * Ordered by invariant, then by file.
 */
export const ARCH_ALLOWLIST: AllowlistEntry[] = [
  // ── B-1: domain must not import from adapter/ ─────────────────────────────
  //
  // core/runtime/ is classified as composition-root (model.md §2), which is
  // explicitly allowed to import adapters per the §3 closure table
  // (composition-root → adapters ✓).  These entries are documented here for
  // completeness; the B-1 test scopes to domain only (core/ excluding
  // runtime/) and will NOT fire on these paths.
  //
  // model.md §5 note: "core/runtime→adapter は divergence でない".
  {
    file: "src/core/runtime/local.ts",
    pattern: "adapter/claude-code/agent-runner",
    invariant: "B-1",
    tracking: "R2-local-adapter",
    comment:
      "core/runtime/ = composition-root; adapter import is allowed per §3 closure model. " +
      "Documented for completeness — not caught by B-1 test (runtime/ excluded from domain scope).",
  },
  {
    file: "src/core/runtime/local.ts",
    pattern: "adapter/dispatching/agent-runner",
    invariant: "B-1",
    tracking: "R2-dispatching-adapter",
    comment:
      "core/runtime/ = composition-root; adapter import is allowed per §3 closure model. " +
      "Documented for completeness — not caught by B-1 test (runtime/ excluded from domain scope).",
  },
  {
    file: "src/core/runtime/managed.ts",
    pattern: "adapter/managed-agent/agent-runner",
    invariant: "B-1",
    tracking: "R2-managed-adapter",
    comment:
      "core/runtime/ = composition-root; adapter import is allowed per §3 closure model. " +
      "Documented for completeness — not caught by B-1 test (runtime/ excluded from domain scope).",
  },

  // ── B-6: process.env must pass through stripSecrets seam ─────────────────
  //
  // B-6 (model.md §4): subprocess / SDK query env must go through the
  // `stripSecrets` seam (util/env-filter) so credentials are never leaked to
  // child processes or external APIs.
  //
  // The following sites read process.env directly without going through
  // stripSecrets, or pass it raw to credential-resolution functions that do
  // not themselves filter secrets.
  //
  // Burn-down: B-6-preflight / B6-diagnostic / B6-commands — introduce an
  // injected env-provider or call stripSecrets at each call site.

  // preflight.ts line 105: resolveGitHubToken(process.env ...)
  {
    file: "src/core/preflight.ts",
    pattern: "resolveGitHubToken(process.env",
    invariant: "B-6",
    tracking: "B6-preflight",
    comment:
      "runPreflight() passes raw process.env to resolveGitHubToken. " +
      "Fix: thread env as an injectable parameter or strip before passing.",
  },
  // preflight.ts line 121: checkRuntimePrereqs(config, process.env ...)
  {
    file: "src/core/preflight.ts",
    pattern: "checkRuntimePrereqs(config, process.env",
    invariant: "B-6",
    tracking: "B6-preflight",
    comment:
      "runPreflight() passes raw process.env to checkRuntimePrereqs. " +
      "Fix: thread env as an injectable parameter.",
  },
  // preflight.ts line 136: resolveSpecRunnerApiKey( process.env ..., )
  // Pattern uniquely identifies line 136 via the trailing comma
  // (lines 105 and 121 end with `>);`, line 136 ends with `>,`).
  {
    file: "src/core/preflight.ts",
    pattern: "Record<string, string | undefined>,",
    invariant: "B-6",
    tracking: "B6-preflight",
    comment:
      "runPreflight() passes raw process.env as arg to resolveSpecRunnerApiKey (line 136). " +
      "Fix: thread env as an injectable parameter.",
  },
  // diagnostic.ts line 15: process.env["SPECRUNNER_DEBUG"]
  {
    file: "src/core/lifecycle/diagnostic.ts",
    pattern: 'process.env["SPECRUNNER_DEBUG"]',
    invariant: "B-6",
    tracking: "B6-diagnostic",
    comment:
      "logPipelineDiag() reads SPECRUNNER_DEBUG directly from process.env. " +
      "Fix: inject the debug env value or use a seam function.",
  },
  // commands.ts lines 53–54: process.env.PATH (two occurrences, same violation)
  {
    file: "src/core/verification/commands.ts",
    pattern: "process.env.PATH",
    invariant: "B-6",
    tracking: "B6-commands",
    comment:
      "spawnCommand() reads process.env.PATH directly to build the subprocess PATH. " +
      "Fix: inject PATH via a parameter or env-provider seam.",
  },

  // ── B-8: config.runtime branching must be confined to createRuntime ────────
  //
  // B-8 (model.md §4): only the createRuntime factory (core/runtime/factory.ts)
  // should branch on config.runtime. Branching scattered elsewhere violates
  // the single-point-of-change principle and makes runtime additions harder.
  //
  // Burn-down: B8-preflight / B8-executor — convert branches to runtime-
  // polymorphic calls or move branching into the factory / strategy.

  // preflight.ts line 43: cfg.runtime ?? "local" (checkRuntimePrereqs parameter name is `cfg`)
  {
    file: "src/core/preflight.ts",
    pattern: 'cfg.runtime ?? "local"',
    invariant: "B-8",
    tracking: "B8-preflight-checkRuntimePrereqs",
    comment:
      "checkRuntimePrereqs() reads cfg.runtime (parameter name cfg: SpecRunnerConfig) to derive " +
      "the requirements matrix. Fix: push the runtime-conditional logic into a strategy / factory seam.",
  },
  // preflight.ts line 59: cfg.runtime === "managed" (checkRuntimePrereqs parameter name is `cfg`)
  {
    file: "src/core/preflight.ts",
    pattern: 'cfg.runtime === "managed"',
    invariant: "B-8",
    tracking: "B8-preflight-checkRuntimePrereqs",
    comment:
      "checkRuntimePrereqs() branches on cfg.runtime === \"managed\" to check agents/environment config. " +
      "Fix: push the runtime-conditional logic into a strategy / factory seam.",
  },
  // preflight.ts line 133: if (config.runtime === "managed") { ... }
  {
    file: "src/core/preflight.ts",
    pattern: 'config.runtime === "managed"',
    invariant: "B-8",
    tracking: "B8-preflight",
    comment:
      "runPreflight() branches on config.runtime to conditionally resolve the API key. " +
      "Fix: push the runtime-conditional logic into a strategy / factory seam.",
  },
  // executor.ts lines 203, 208, 287, 295: if (deps.config.runtime === "local") { ... }
  {
    file: "src/core/step/executor.ts",
    pattern: 'deps.config.runtime === "local"',
    invariant: "B-8",
    tracking: "B8-executor",
    comment:
      "StepExecutor has four config.runtime branches guarding local-only operations " +
      "(headBeforeStep capture, template write, template cleanup, commit-and-push). " +
      "Fix: extract to a RuntimeStrategy seam so the executor stays runtime-agnostic.",
  },

  // ── B-3: shared-kernel / persistence must not import domain (core/) ──────────
  //
  // B-3 (model.md §4): upward edges from shared-kernel (parser/, config/,
  // state/, git/, prompts/, logger/, templates/) and persistence (store/)
  // into the domain (core/) are forbidden per the §3 closure table.
  //
  // These entries are grandfather'd at arch-upward-edge-ratchet.
  // Burn-down requests: parser-kernel-demote (R1 — DONE), step-names-kernel-demote (R3 — DONE),
  // port-types-kernel-demote (B3-state-port / B3-state-helpers — DONE).
  // B3-logger: logger/ → core/event/event-bus
  {
    file: "src/logger/pipeline-logger.ts",
    pattern: "core/event/event-bus.js",
    invariant: "B-3",
    tracking: "B3-logger",
    comment:
      "pipeline-logger.ts imports EventBus type from core/event/event-bus. " +
      "Fix: move EventBus interface to shared-kernel or core/port.",
  },

];
