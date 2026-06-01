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

  // ── DSM: §3 全層 closure whitelist 違反 ────────────────────────────────────
  //
  // DSM (architecture/model.md §3): 許可された edge 以外の import は divergence。
  // 以下のエントリは arch-closure-src-wide change でスキャン確定した既存 divergence を
  // grandfather したもの。
  //
  // カテゴリ:
  //   A) adapters → domain: adapter 実装が core/ 内の非 port ファイルを直接 import
  //   B) ports → domain (△ strict): core/port/ が core/ 内の VO 等を直接 import
  //
  // Burn-down: 各 divergence は「型を shared-kernel に降格 / ports 経由にリルート」で解消できる。
  // 別途 burn-down request を起票して順次解消すること。

  // ── A) adapters → domain ─────────────────────────────────────────────────────

  // adapter/claude-code/agent-runner.ts
  {
    file: "src/adapter/claude-code/agent-runner.ts",
    pattern: "core/event/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-cc-event",
    comment:
      "adapters → domain: claude-code adapter が core/event/types (DomainEvent) を直接 import。" +
      "Fix: DomainEvent を shared-kernel に降格するか、ports 経由で公開する。",
  },
  {
    file: "src/adapter/claude-code/agent-runner.ts",
    pattern: "core/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-cc-types",
    comment:
      "adapters → domain: claude-code adapter が core/types.ts (StepContext) を直接 import。" +
      "Fix: StepContext を shared-kernel or ports に降格する。",
  },
  {
    file: "src/adapter/claude-code/agent-runner.ts",
    pattern: "core/lifecycle/diagnostic.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-cc-lifecycle",
    comment:
      "adapters → domain: claude-code adapter が core/lifecycle/diagnostic (logPipelineDiag) を直接 import。" +
      "Fix: diagnostic util を shared-kernel/logger に移動する。",
  },

  // adapter/codex/agent-runner.ts
  {
    file: "src/adapter/codex/agent-runner.ts",
    pattern: "core/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-codex-types",
    comment:
      "adapters → domain: codex adapter が core/types.ts (StepContext) を直接 import。" +
      "Fix: StepContext を shared-kernel or ports に降格する。",
  },

  // adapter/managed-agent/sse-stream.ts
  {
    file: "src/adapter/managed-agent/sse-stream.ts",
    pattern: "core/tools/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-sse-tools",
    comment:
      "adapters → domain: sse-stream が core/tools/types (CustomToolContext/CustomToolHandler) を直接 import。" +
      "Fix: CustomToolHandler を ports or shared-kernel に移動する。",
  },

  // adapter/managed-agent/anthropic-client.ts (covers both type and value import lines)
  {
    file: "src/adapter/managed-agent/anthropic-client.ts",
    pattern: "core/agent/definition.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-ac-agent",
    comment:
      "adapters → domain: anthropic-client が core/agent/definition (AgentDefinition, AGENT_TOOLSET_TYPE) を直接 import (2行)。" +
      "Fix: AgentDefinition を ports に降格し、AGENT_TOOLSET_TYPE を shared-kernel に移動する。",
  },

  // adapter/managed-agent/agent-runner.ts
  {
    file: "src/adapter/managed-agent/agent-runner.ts",
    pattern: "core/step/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-ma-step-types",
    comment:
      "adapters → domain: managed-agent が core/step/types (AgentStep) を直接 import。" +
      "Fix: AgentStep を ports に降格する。",
  },
  {
    file: "src/adapter/managed-agent/agent-runner.ts",
    pattern: "core/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-ma-types",
    comment:
      "adapters → domain: managed-agent が core/types.ts (StepContext) を直接 import。" +
      "Fix: StepContext を shared-kernel or ports に降格する。",
  },
  {
    file: "src/adapter/managed-agent/agent-runner.ts",
    pattern: "core/step/executor-helpers.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-ma-exec-helpers",
    comment:
      "adapters → domain: managed-agent が core/step/executor-helpers (throwWrappedError, attachStateAndRethrow) を直接 import。" +
      "Fix: helper を ports 経由で公開するか、adapter 内に複製する。",
  },
  {
    file: "src/adapter/managed-agent/agent-runner.ts",
    pattern: "core/step/step-names.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-ma-step-names",
    comment:
      "adapters → domain: managed-agent が core/step/step-names (STEP_NAMES) を直接 import。" +
      "Fix: STEP_NAMES を kernel/ or shared-kernel に降格する（既に src/kernel/step-names.ts が存在）。",
  },

  // adapter/managed-agent/session-client.ts
  {
    file: "src/adapter/managed-agent/session-client.ts",
    pattern: "core/tools/types.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-sc-tools",
    comment:
      "adapters → domain: session-client が core/tools/types (CustomToolHandler) を直接 import。" +
      "Fix: CustomToolHandler を ports or shared-kernel に移動する。",
  },

  // adapter/managed-agent/error-helpers.ts
  {
    file: "src/adapter/managed-agent/error-helpers.ts",
    pattern: "core/step/executor-helpers.js",
    invariant: "DSM",
    tracking: "DSM-adapter-domain-eh-exec-helpers",
    comment:
      "adapters → domain: error-helpers が core/step/executor-helpers (throwWrappedError) を直接 import。" +
      "Fix: helper を ports 経由で公開するか、adapter 内に複製する。",
  },

  // ── C) domain → composition-root ─────────────────────────────────────────────
  //
  // domain は composition-root を import できない（§3: domain → comp-root ✗）。
  // src/core/ の一部ファイルが src/core/runtime/ の型・関数を直接 import している divergence。
  // Fix: RuntimeStrategy 等の型を shared-kernel または ports に降格する。

  {
    file: "src/core/preflight.ts",
    pattern: "runtime/prereqs.js",
    invariant: "DSM",
    tracking: "DSM-domain-comp-root-preflight-prereqs",
    comment:
      "domain → composition-root: core/preflight.ts が core/runtime/prereqs を直接 import (import + re-export の2行)。" +
      "Fix: checkRuntimePrereqs / resolveRuntimeCredentials を ports に移動するか cli 側でのみ使う。",
  },
  {
    file: "src/core/types.ts",
    pattern: "runtime/strategy.js",
    invariant: "DSM",
    tracking: "DSM-domain-comp-root-types-strategy",
    comment:
      "domain → composition-root: core/types.ts が core/runtime/strategy (RuntimeStrategy) を直接 import。" +
      "Fix: RuntimeStrategy を shared-kernel or ports に降格する。",
  },
  {
    file: "src/core/command/resume.ts",
    pattern: "runtime/strategy.js",
    invariant: "DSM",
    tracking: "DSM-domain-comp-root-resume-strategy",
    comment:
      "domain → composition-root: core/command/resume.ts が core/runtime/strategy (RuntimeStrategy) を直接 import。" +
      "Fix: RuntimeStrategy を shared-kernel or ports に降格する。",
  },
  {
    file: "src/core/command/runner.ts",
    pattern: "runtime/strategy.js",
    invariant: "DSM",
    tracking: "DSM-domain-comp-root-runner-strategy",
    comment:
      "domain → composition-root: core/command/runner.ts が core/runtime/strategy (RuntimeStrategy 等) を直接 import。" +
      "Fix: RuntimeStrategy を shared-kernel or ports に降格する。",
  },
  {
    file: "src/core/command/pipeline-run.ts",
    pattern: "runtime/strategy.js",
    invariant: "DSM",
    tracking: "DSM-domain-comp-root-pipeline-strategy",
    comment:
      "domain → composition-root: core/command/pipeline-run.ts が core/runtime/strategy (RuntimeStrategy) を直接 import。" +
      "Fix: RuntimeStrategy を shared-kernel or ports に降格する。",
  },

  // ── B) ports → domain (△ strict) ─────────────────────────────────────────────

  {
    file: "src/core/port/anthropic-client.ts",
    pattern: "../agent/definition.js",
    invariant: "DSM",
    tracking: "DSM-ports-domain-ac-agent",
    comment:
      "ports → domain (△ strict): core/port/anthropic-client が core/agent/definition (AgentDefinition) を直接 import。" +
      "Fix: AgentDefinition を shared-kernel に降格する（理想は VO を shared-kernel に置く）。",
  },
  {
    file: "src/core/port/agent-runner.ts",
    pattern: "../step/types.js",
    invariant: "DSM",
    tracking: "DSM-ports-domain-ar-step",
    comment:
      "ports → domain (△ strict): core/port/agent-runner が core/step/types (AgentStep) を直接 import。" +
      "Fix: AgentStep を shared-kernel に降格する。",
  },
  {
    file: "src/core/port/agent-runner.ts",
    pattern: "../event/types.js",
    invariant: "DSM",
    tracking: "DSM-ports-domain-ar-event",
    comment:
      "ports → domain (△ strict): core/port/agent-runner が core/event/types (DomainEvent) を直接 import。" +
      "Fix: DomainEvent を shared-kernel に降格する。",
  },
  {
    file: "src/core/port/session-client.ts",
    pattern: "../tools/types.js",
    invariant: "DSM",
    tracking: "DSM-ports-domain-sc-tools",
    comment:
      "ports → domain (△ strict): core/port/session-client が core/tools/types (CustomToolHandler) を直接 import。" +
      "Fix: CustomToolHandler を shared-kernel or ports に移動する。",
  },
];
