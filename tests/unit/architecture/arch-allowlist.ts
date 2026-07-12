/**
 * Architecture enforcement allowlist.
 *
 * Documents known divergences from the structural invariants defined in
 * architecture/model.md §4 (B-1 through B-12).
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

  // ── B-6: process.env 直読みの known-safe call-site ────────────────────────
  //
  // B-6 (model.md §4): env must flow through the stripSecrets seam before
  // being passed to a subprocess or external SDK.  The entries below are
  // call-sites that read a single, benign (or explicitly-forwarded) key from
  // process.env WITHOUT passing the full env object to any child process.
  //
  // Governance: each entry must document why the raw read is safe.
  {
    file: "src/util/env-filter.ts",
    pattern: "SPECRUNNER_DEBUG",
    invariant: "B-6",
    tracking: "B6-specrunner-debug-read",
    comment: "getDebugSubsystems() reads a single non-secret diagnostic key; not passed to subprocess.",
  },
  {
    file: "src/util/xdg.ts",
    pattern: "XDG_CONFIG_HOME",
    invariant: "B-6",
    tracking: "B6-xdg-config-home-read",
    comment: "XDG path read; not a secret, not passed to subprocess.",
  },
  {
    file: "src/util/xdg.ts",
    pattern: "XDG_STATE_HOME",
    invariant: "B-6",
    tracking: "B6-xdg-state-home-read",
    comment: "XDG path read; not a secret, not passed to subprocess.",
  },
  {
    file: "src/adapter/claude-code/agent-runner.ts",
    pattern: "resolveClaudeCodeOAuthTokenFn(",
    invariant: "B-6",
    tracking: "B6-claude-oauth-token-resolver-input",
    comment:
      "Single-site match: resolveClaudeCodeOAuthTokenFn is called with process.env to extract " +
      "CLAUDE_CODE_OAUTH_TOKEN; the resolved token is explicitly injected into the already-stripped " +
      "sdkEnv — not passed raw to a subprocess. Pattern is site-specific (resolver call identifier) " +
      "so future cast-bearing raw-env spawns in the same file are NOT covered by this entry.",
  },
  {
    file: "src/adapter/codex/agent-runner.ts",
    pattern: "OPENAI_API_KEY",
    invariant: "B-6",
    tracking: "B6-codex-openai-apikey-read",
    comment:
      "Reads OPENAI_API_KEY from process.env to forward it as an explicit apiKey option to new Codex(). " +
      "The key is already stripped from strippedEnv by the preceding stripSecrets call. " +
      "Not passed as full env to a subprocess — only forwarded as a named SDK parameter.",
  },

  // ── B-12: direct `node:child_process` import banned outside seam modules ─────
  //
  // B-12: subprocess spawn must be confined to the two seam modules
  // (util/spawn.ts / util/git-exec.ts). Direct node:child_process import
  // in other files enables env-omission spawns that bypass stripSecrets
  // and cannot be detected by the B-6 process.env grep.
  //
  // Allowed importers are listed here with a reason. All other files that
  // import node:child_process are violations.
  {
    file: "src/util/spawn.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-spawn-seam",
    comment:
      "Seam module: spawnCommand is the stripSecrets strip point for util/spawn.ts. " +
      "Direct import is required; all callers must go through this seam.",
  },
  {
    file: "src/util/git-exec.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-git-exec-seam",
    comment:
      "Seam module: runSubprocess / gitExec are the stripSecrets strip points for git-exec.ts. " +
      "Direct import is required; all git callers must go through this seam.",
  },
  {
    file: "src/core/verification/commands.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-verification-commands",
    comment:
      "Composition-internal; already strips ({ ...stripSecrets(env), PATH }) at the call site. " +
      "Pinned by verification env tests.",
  },
  {
    file: "src/core/verification/runner.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-verification-runner",
    comment:
      "Composition-internal; already strips (stripSecrets(process.env)) at the call site. " +
      "Pinned by runner-git-show-env.test.ts.",
  },
  {
    file: "src/cli/doctor.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-doctor-composition-root",
    comment:
      "Composition-root; needs execFile timeout + AbortSignal not offered by the git-exec seam (D4). " +
      "Strips secrets via stripSecrets at the call site in buildExecFile (T-04).",
  },
  {
    file: "src/core/verification/changed-lines.ts",
    pattern: "node:child_process",
    invariant: "B-12",
    tracking: "B12-changed-lines-seam",
    comment:
      "Changed-line derivation for the lcov coverage gate. " +
      "Strips secrets via stripSecrets(process.env) inside spawnGit. " +
      "spawn is injected as an argument (SpawnFn) to enable test isolation. " +
      "Pinned by changed-lines.test.ts.",
  },

  // ── DSM: §3 全層 closure whitelist 違反 ────────────────────────────────────
  //
  // DSM (architecture/model.md §3): 許可された edge 以外の import は divergence。
  // arch-closure-src-wide (#495) でスキャン確定した 21 件を grandfather していたが、
  // burn-down 完了:
  //   - dsm-runtime-strategy-demote (#496): domain → comp-root 5件（RuntimeStrategy/prereqs を ports へ降格）
  //   - dsm-domain-type-demote (#497): adapters/ports → domain 16件（共有型を kernel/port/logger へ降格）
  //
  // DSM 実違反ゼロ達成: 全エントリ burn-down 完了。

];
