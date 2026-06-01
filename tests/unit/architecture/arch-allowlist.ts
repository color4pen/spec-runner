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


  // ── B-9: JobState.status must only be mutated via transitionJob ──────────────
  //
  // B-9 (architecture/model.md §4): JobState.status changes must flow through
  // transitionJob (src/state/lifecycle.ts) to enforce the valid-transition table
  // and prevent illegal state mutations.  The entries below are grandfather'd
  // bypass sites that write status directly (enforce-then-burn-down ratchet).
  //
  // Burn-down: replace each bypass with transitionJob call (separate change).
  {
    file: "src/store/job-state-store.ts",
    pattern: '"failed" as JobStatus',
    invariant: "B-9",
    tracking: "B9-store-fail",
    comment:
      "fail() が transitionJob を経由せず status: \"failed\" を直書き。" +
      "Fix: replace with transitionJob({ trigger: 'store-fail', reason: ... }) call.",
  },
  {
    file: "src/core/lifecycle/exit-guard.ts",
    pattern: '"awaiting-resume"',
    invariant: "B-9",
    tracking: "B9-exit-guard",
    comment:
      "exit-guard が transitionJob を経由せず status: \"awaiting-resume\" を直書き。" +
      "Fix: replace with transitionJob({ trigger: 'exit-guard', reason: ... }) call.",
  },
  {
    file: "src/core/runtime/local.ts",
    pattern: '"awaiting-resume" as const',
    invariant: "B-9",
    tracking: "B9-signal-handler",
    comment:
      "signal-handler が transitionJob を経由せず status: \"awaiting-resume\" を直書き。" +
      "Fix: replace with transitionJob({ trigger: 'signal-handler', reason: ... }) call.",
  },

  // ── B-3: shared-kernel / persistence must not import domain (core/) ──────────
  //
  // B-3 (model.md §4): upward edges from shared-kernel (parser/, config/,
  // state/, git/, prompts/, logger/, templates/) and persistence (store/)
  // into the domain (core/) are forbidden per the §3 closure table.
  //
  // These entries are grandfather'd at arch-upward-edge-ratchet.
  // Burn-down requests: parser-kernel-demote (R1 — DONE), step-names-kernel-demote (R3 — DONE),
  // port-types-kernel-demote (B3-state-port / B3-state-helpers — DONE),
  // event-bus-interface-demote (B3-logger — DONE).
  //
  // B-3 実違反ゼロ達成: 全エントリ burn-down 完了。

];
