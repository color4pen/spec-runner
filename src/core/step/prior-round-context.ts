/**
 * prior-round-context.ts — spec-review 周回間 context の機械導出と注入ブロック生成。
 *
 * spec-review の iteration ≥ 2 で起動され、前周 findings と前周 spec-fixer の
 * 変更 file 集合（commit diff 由来）を reviewer に渡す。
 *
 * Design:
 *   - I/O は runtimeStrategy port 背後のみ（node:child_process / git を直接 import しない）
 *   - 注入は one-shot（state への永続化なし。DynamicContext に乗せて buildMessage に渡す）
 *   - 導出できない場合（OID 欠落・diff unavailable）は null を返して黙って degrade
 */
import type { JobState } from "../../state/schema.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { STEP_NAMES } from "./step-names.js";
import { getLatestJudgeFindings } from "./fixer-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Prior-round context injected into spec-review messages for iteration ≥ 2.
 * Structure matches DynamicContext.priorRoundContext (defined in src/git/dynamic-context.ts).
 */
export type PriorRoundContext = {
  /** Previous spec-review findings (severity / resolution / file / title projection). */
  findings: { severity: string; resolution: string; file: string; title: string }[];
  /** Files changed by the prior spec-fixer — machine-derived from commit diff. */
  changedFiles: string[];
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Resolve the commit OID of the last spec-fixer run from job state.
 *
 * Returns the commitOid of the most recent spec-fixer StepRun, or null if:
 * - state.steps[SPEC_FIXER] is absent or empty
 * - the last StepRun has no commitOid
 *
 * Pure function — no I/O.
 */
export function resolvePriorFixerOid(state: JobState): string | null {
  const runs = state.steps?.[STEP_NAMES.SPEC_FIXER];
  if (!runs || runs.length === 0) return null;
  const lastRun = runs[runs.length - 1];
  return lastRun?.commitOid ?? null;
}

/**
 * Build the prior-round context injection block for embedding in spec-review messages.
 *
 * Returns a string enclosed in <prior-round-context>…</prior-round-context> XML tags.
 * The block includes:
 *   - Prior-round spec-review findings (severity / resolution / file / title)
 *   - Prior spec-fixer changed files (machine-derived from commit diff)
 *   - Re-inspection protocol (read-before-re-report, rationale requirement, 全量列挙 maintenance)
 *
 * Pure function — no I/O.
 */
export function buildPriorRoundContextBlock(ctx: PriorRoundContext): string {
  const lines: string[] = [];

  lines.push("<prior-round-context>");
  lines.push("");
  lines.push("## 前周レビュー context（iteration ≥ 2）");
  lines.push("");

  // --- Prior findings ---
  lines.push("### 前周 spec-review findings");
  lines.push("");
  if (ctx.findings.length === 0) {
    lines.push("前周指摘なし");
  } else {
    for (const f of ctx.findings) {
      lines.push(`- [${f.severity}] ${f.title} (${f.resolution}) — ${f.file}`);
    }
  }
  lines.push("");

  // --- Changed files (machine-derived) ---
  lines.push("### 前周 spec-fixer 変更 file（commit diff 由来・machine-derived）");
  lines.push("");
  if (ctx.changedFiles.length === 0) {
    lines.push("変更なし（machine-derived: commit diff から機械導出）");
  } else {
    for (const f of ctx.changedFiles) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");

  // --- Re-inspection protocol ---
  lines.push("### 再指摘プロトコル");
  lines.push("");
  lines.push("前周指摘と同一対象を再指摘する場合は以下を守ること:");
  lines.push("1. 現在のファイル内容を Read tool で読み直してから再指摘する");
  lines.push("2. なぜ修正が不十分かを rationale に明示する。解消済みの指摘は再指摘しない");
  lines.push("3. 全量列挙を維持する: この round で確認できる finding をすべて列挙する（前周 approved 観点も含め免除なし）");
  lines.push("");

  lines.push("</prior-round-context>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Async derivation (I/O via runtimeStrategy port)
// ---------------------------------------------------------------------------

/**
 * Derive prior-round context for spec-review iteration ≥ 2.
 *
 * Returns null (injection skipped) in any of these cases:
 * - iteration < 2 (no prior round)
 * - prior spec-fixer OID not recorded in state
 * - runtimeStrategy is absent or has no listCommitChangedFiles (managed runtime)
 * - listCommitChangedFiles returns { kind: "unavailable" }
 *
 * On success, returns { findings, changedFiles } where:
 * - findings: projection of prior spec-review toolResult findings (severity/resolution/file/title)
 * - changedFiles: files changed by the prior spec-fixer (machine-derived, not self-reported)
 *
 * Never throws — all failures degrade to null.
 */
export async function derivePriorRoundContext(params: {
  state: JobState;
  iteration: number;
  cwd: string;
  runtimeStrategy: RuntimeStrategy | undefined;
}): Promise<PriorRoundContext | null> {
  const { state, iteration, cwd, runtimeStrategy } = params;

  // Guard: only inject for iteration ≥ 2
  if (iteration < 2) return null;

  // Guard: prior fixer OID must be resolvable
  const priorOid = resolvePriorFixerOid(state);
  if (!priorOid) return null;

  // Guard: runtimeStrategy must provide listCommitChangedFiles
  if (!runtimeStrategy?.listCommitChangedFiles) return null;

  // Derive changed files from commit diff (machine-derived, never self-reported)
  const result = await runtimeStrategy.listCommitChangedFiles(priorOid, cwd);
  if (result.kind !== "success") return null;

  // Derive prior findings from state (prior spec-review toolResult)
  const rawFindings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW) ?? [];
  const findings = rawFindings.map((f) => ({
    severity: f.severity,
    resolution: f.resolution,
    file: f.file,
    title: f.title,
  }));

  return { findings, changedFiles: result.files };
}
