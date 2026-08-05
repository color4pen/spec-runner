/**
 * post-fix-context.ts — adr-gen 用 post-fix context の機械導出と注入ブロック生成。
 *
 * code-fixer が適用した変更（design 確定後の実装修正）の事実を adr-gen に注入する。
 * fixer round ごとに changed files（commit diff 由来）と対応 review findings（state 由来）を
 * 機械的に導出する。agent 自己申告には依存しない。
 *
 * Design:
 *   - I/O は runtimeStrategy port 背後のみ（node:child_process / git を直接 import しない）
 *   - 注入は one-shot（state への永続化なし。DynamicContext に乗せて buildMessage に渡す）
 *   - 導出できない場合（port 不在・OID 欠落・diff unavailable・throw）は null を返して黙って degrade
 *   - 縮退は all-or-nothing — 1 round でも失敗すれば全体 null（部分注入による誤認を防ぐ）
 */
import type { JobState } from "../../state/schema.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { STEP_NAMES } from "./step-names.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single review finding projected for post-fix context injection.
 * Rationale is omitted — only the fields needed for ADR context are included.
 */
export type PostFixFinding = {
  severity: string;
  resolution: string;
  file: string;
  title: string;
};

/**
 * A single code-fixer round's context.
 * round: 1-origin sequential number within this run.
 * commitOid: the git commit that the fixer produced (machine fact).
 * changedFiles: files changed in that commit (machine-derived from listCommitChangedFiles).
 * findings: review findings from the latest findings-bearing run immediately preceding this round.
 */
export type PostFixRound = {
  round: number;
  commitOid: string;
  changedFiles: string[];
  findings: PostFixFinding[];
};

/**
 * Post-fix context injected into the adr-gen message.
 * Structure matches DynamicContext.postFixContext (defined in src/git/dynamic-context.ts).
 */
export type PostFixContext = {
  rounds: PostFixRound[];
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Resolve code-fixer runs that have a commitOid, in declaration order.
 *
 * Returns { commitOid, endedAt } for each code-fixer StepRun that has a commitOid.
 * Runs without commitOid are skipped.
 * Returns empty array when: no code-fixer runs exist, or all runs lack a commitOid.
 *
 * Pure function — no I/O.
 */
export function resolveCodeFixerRounds(
  state: JobState,
): { commitOid: string; endedAt: string }[] {
  const runs = state.steps?.[STEP_NAMES.CODE_FIXER];
  if (!runs || runs.length === 0) return [];

  const result: { commitOid: string; endedAt: string }[] = [];
  for (const run of runs) {
    if (run.commitOid) {
      result.push({ commitOid: run.commitOid, endedAt: run.endedAt });
    }
  }
  return result;
}

/**
 * Find review findings from the latest findings-bearing run with endedAt strictly before `timestamp`.
 *
 * Walks all step runs in state.steps, collects runs where:
 *   - run.endedAt < timestamp (strictly before)
 *   - run.outcome.toolResult?.findings is a non-empty array
 * Selects the run with the maximum endedAt among qualifying runs.
 * Returns its findings projected to { severity, resolution, file, title }.
 *
 * Returns empty array when no qualifying run is found.
 *
 * Pure function — no I/O.
 */
export function findFindingsBeforeTimestamp(
  state: JobState,
  timestamp: string,
): PostFixFinding[] {
  let bestEndedAt: string | null = null;
  let bestFindings: PostFixFinding[] = [];

  const steps = state.steps ?? {};
  for (const stepRuns of Object.values(steps)) {
    if (!stepRuns) continue;
    for (const run of stepRuns) {
      // Must be strictly before timestamp
      if (run.endedAt >= timestamp) continue;

      // Must have non-empty findings
      const toolResult = run.outcome.toolResult as
        | { findings?: Array<{ severity: string; resolution: string; file: string; title: string }> }
        | null
        | undefined;
      const findings = toolResult?.findings;
      if (!findings || findings.length === 0) continue;

      // Pick the run with the maximum endedAt
      if (bestEndedAt === null || run.endedAt > bestEndedAt) {
        bestEndedAt = run.endedAt;
        bestFindings = findings.map((f) => ({
          severity: f.severity,
          resolution: f.resolution,
          file: f.file,
          title: f.title,
        }));
      }
    }
  }

  return bestFindings;
}

/**
 * Build the post-fix context injection block for embedding in adr-gen messages.
 *
 * Returns a string enclosed in <post-fix-context>…</post-fix-context> XML tags.
 * The block includes:
 *   - Header explaining that this is machine-derived post-fix context
 *   - For each round: round number, commitOid, changed files (commit diff derived),
 *     and corresponding review findings (severity / resolution / file / title)
 *   - Explicit text for empty changedFiles / findings arrays
 *   - Priority note: post-fix block is authoritative over design.md where they diverge
 *
 * Pure function — no I/O.
 */
export function buildPostFixContextBlock(ctx: PostFixContext): string {
  const lines: string[] = [];

  lines.push("<post-fix-context>");
  lines.push("");
  lines.push("## design 確定後に code-fixer が適用した修正（machine-derived 事実）");
  lines.push("");
  lines.push(
    "以下は design フェーズ終了後に code-fixer が実装した変更の機械事実です。",
  );
  lines.push(
    "changed files は commit diff から機械導出（agent 自己申告ではない）。",
  );
  lines.push("");

  for (const round of ctx.rounds) {
    lines.push(`### Round ${round.round} — commit: ${round.commitOid}`);
    lines.push("");

    // Changed files (commit diff derived)
    lines.push("#### Changed files（commit diff 由来・machine-derived）");
    lines.push("");
    if (round.changedFiles.length === 0) {
      lines.push("変更 file なし（machine-derived: commit diff から機械導出）");
    } else {
      for (const f of round.changedFiles) {
        lines.push(`- ${f}`);
      }
    }
    lines.push("");

    // Corresponding review findings
    lines.push("#### 対応 review 指摘（state 由来・machine-derived）");
    lines.push("");
    if (round.findings.length === 0) {
      lines.push("対応 review 指摘なし");
    } else {
      for (const f of round.findings) {
        lines.push(`- [${f.severity}] ${f.title} (${f.resolution}) — ${f.file}`);
      }
    }
    lines.push("");
  }

  lines.push("### 優先順位");
  lines.push("");
  lines.push(
    "design.md と最終実装が乖離している箇所は本ブロックを正とする。詳細規律は system prompt を参照。",
  );
  lines.push("");

  lines.push("</post-fix-context>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Async derivation (I/O via runtimeStrategy port)
// ---------------------------------------------------------------------------

/**
 * Derive post-fix context for adr-gen when code-fixer round(s) exist.
 *
 * Returns null (injection skipped) in any of these cases:
 * - No code-fixer runs with a commitOid exist in state (fixer-less run)
 * - runtimeStrategy is absent or has no listCommitChangedFiles (managed runtime)
 * - listCommitChangedFiles throws or returns { kind: "unavailable" } for any round
 *   (all-or-nothing degradation — partial injection risks misleading the agent)
 *
 * On success, returns { rounds } where each round has:
 * - round: 1-origin sequential number
 * - commitOid: the fixer commit OID (machine fact)
 * - changedFiles: files changed in that commit (machine-derived, not self-reported)
 * - findings: review findings from the latest findings-bearing run immediately before this round
 *
 * Never throws — all failures degrade to null.
 */
export async function derivePostFixContext(params: {
  state: JobState;
  cwd: string;
  runtimeStrategy: RuntimeStrategy | undefined;
}): Promise<PostFixContext | null> {
  const { state, cwd, runtimeStrategy } = params;

  // Guard: code-fixer must have at least one run with a commitOid
  const fixerRounds = resolveCodeFixerRounds(state);
  if (fixerRounds.length === 0) return null;

  // Guard: runtimeStrategy must provide listCommitChangedFiles
  if (!runtimeStrategy?.listCommitChangedFiles) return null;

  // Derive changed files for each round — all-or-nothing (any failure → null)
  try {
    const rounds: PostFixRound[] = [];
    for (let i = 0; i < fixerRounds.length; i++) {
      const { commitOid, endedAt } = fixerRounds[i]!;
      const result = await runtimeStrategy.listCommitChangedFiles(commitOid, cwd);
      if (result.kind !== "success") return null;

      const findings = findFindingsBeforeTimestamp(state, endedAt);
      rounds.push({
        round: i + 1, // 1-origin
        commitOid,
        changedFiles: result.files,
        findings,
      });
    }
    return { rounds };
  } catch {
    // All-or-nothing: any port error degrades to null, step continues normally
    return null;
  }
}
