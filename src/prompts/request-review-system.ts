/**
 * System prompt and initial message builder for the request-review pipeline step.
 *
 * The agent acts as an architect reviewer performing a structured evaluation
 * of a request.md file before the design step runs.
 *
 * This is a read-only pipeline step — the agent writes findings to a result file
 * and reports its completion result to declare its verdict.
 */
import { changesDirRel, requestReviewResultPath } from "../util/paths.js";
import { buildSystemPrompt } from "./builder.js";
import { EVIDENCE_DISCIPLINE, CAUSE_CLASSIFICATION } from "./fragments.js";
import { DECISION_NEEDED_DEFINITION, OBSERVATION_DEFINITION, VERDICT_BLOCKING_RULES, REQUEST_REVIEW_SEVERITY_DEFINITION, EVIDENCE_COUNTS_DEFINITION } from "./judge-rules.js";

const _changesDir = changesDirRel();

const REQUEST_REVIEW_BASE = `あなたは spec-runner pipeline のステップ agent（request-review）です。
作業開始前に rules.md（= \`specrunner/changes/<slug>/rules.md\`）を Read tool で読み、規律を確認してから着手してください。

## Question

この request は単体で完結し、根拠の付いた正典か（現状断定は実コードと一致するか、受け入れ基準は観測可能か、量化子・数値・入口経路に根拠があるか）

## Contract

**入力**:
- \`${_changesDir}/<slug>/request.md\` — 正典（評価対象）
- プロジェクトの構造定義・codebase（Read / Grep / Glob で確認可）

**出力**: \`${_changesDir}/<slug>/request-review-result-NNN.md\` — evidence report

**write-set**: result file のみ。request.md を含む他の全ファイルは変更禁止（read-only review）
- git add / git commit / git push の実行は禁止
- コード実装・設計提案は禁止

**Fact-Check Attestation Output**（Step 2 完了後、初期メッセージに attestationPath が指定される場合）:
attestation ファイルを指定パスへ書き出す。以下のフィールドを verbatim（do NOT recompute）で記録する:
- \`requestHash\`: 初期メッセージの値をそのままコピー
- \`codeAssertionsVerified\`: true（Step 2 完了）
- \`sourceRevision\`: 初期メッセージの値をそのままコピー（指定なし / if not instructed の場合は omit）

attestation は verdict / findings に影響しない。

## Method

1. **Codebase Context**: プロジェクトの規約・アーキテクチャ境界を最小限確認する（Read / Grep / Glob）

2. **Code Assertion Fact-Check**: scan the entire request（全体が対象 — \`## 現状コードの前提\` 節に限らない）— 含まれる断定を検証する。対象: file:line 参照・具体的なシンボル名・具体的なファイルパス。意図・方針・将来の構想は対象外。不一致は HIGH severity finding。

3. **Request Validation**: 目標の明確さ・受け入れ基準のテスト可能性・スコープの一貫性を検証する。

4. **External Dependency Check**: 外部 SDK / API / サードパーティサービスの制約・バージョン要件が文書化されているか確認する。

5. **Scope & Complexity Evaluation**: YAGNI 違反・スコープクリープ・隠れたコスト・未記載の設計判断を確認する。複数の設計アプローチが存在する場合は並列列挙せず、根拠付きで 1 案を推奨する。

severity は request-level の欠陥にのみ適用する。コンポーネント責任・API 契約・内部実装トレードオフは design phase の評価対象であり、findings に含めない。

## Evidence

${EVIDENCE_DISCIPLINE}

**step 固有の evidence 要求**:
- Code Assertion Fact-Check: 各断定について確認コマンドと結果を明記する。attestation が valid な場合は列挙外の断定のみ検証。
- evidence report の \`## 検証した項目\` に確認手順を、\`## 検証できなかった項目\` に未確認項目（無ければ None）を記載する。

## Completion

作業が完了したら、completion result（完了結果）を報告してください。

result file を書き出す前に Read tool でテンプレートを読み、evidence report 形式（\`## 検証した項目\` / \`## 検証できなかった項目\` / \`## Findings 詳細\`）に従うこと。verdict 行は書かない。

**正常完了の場合 (ok=true)**:
\`findings\` 配列を必ず含めてください。各要素は以下の形式です:
\`\`\`json
{
  "severity": "critical" | "high" | "medium" | "low",
  "resolution": "fixable" | "decision-needed",
  "file": "specrunner/changes/<slug>/request.md",
  "line": 42,
  "title": "短い説明",
  "rationale": "なぜ問題か"
}
\`\`\`

${REQUEST_REVIEW_SEVERITY_DEFINITION}

**Resolution 定義**:
- \`fixable\`: request.md の修正で解決可能
${DECISION_NEEDED_DEFINITION}

${OBSERVATION_DEFINITION}

${EVIDENCE_COUNTS_DEFINITION}

**重要**: CLI が \`findings\` 配列から verdict を決定します。\`verdict\` フィールドは互換のために残されていますが routing に使用されません。
指摘がない場合は \`findings: []\` を渡してください。

**Verdict（CLI が findings から導出）**: approve（指摘なし）/ needs-discussion（decision-needed ≥ 1）/ needs-fix（critical|high ≥ 1）/ reject（自発的失敗 — ok=false 経路）

${VERDICT_BLOCKING_RULES}

**自発的失敗 (ok=false)**: \`{ok: false, reason: "理由"}\` — findings は不要です。

${CAUSE_CLASSIFICATION}

完了結果を報告せずに作業を終えないでください。`;

export const REQUEST_REVIEW_SYSTEM_PROMPT = buildSystemPrompt(REQUEST_REVIEW_BASE, []);

export interface RequestReviewInitialMessageInput {
  slug: string;
  requestType: string;
  branch: string | undefined;
  iteration: number;
  findingsPath: string;
  /** Pre-computed SHA-256 hash of request.md content. When provided, the agent writes the attestation file. */
  requestContentHash?: string;
  /** Path where the attestation JSON should be written. Derived from factCheckAttestationPath(slug). */
  attestationPath?: string;
  /**
   * Source revision (git SHA) for the most recent commit outside the change folder.
   * When provided alongside requestContentHash and attestationPath, injected into the
   * attestation JSON template so the agent copies it verbatim — do not recompute.
   * Absent when git is unavailable (managed degradation path).
   */
  sourceRevision?: string;
}

/**
 * Build the initial user message for the request-review pipeline step.
 *
 * The agent is directed to Read the request.md from the change folder (not injected inline).
 * This ensures the agent works from the canonical change-folder copy at review time.
 *
 * When requestContentHash and attestationPath are provided, the message includes an explicit
 * instruction to write the attestation file after Step 2. When absent (e.g. managed degradation),
 * the attestation instruction is omitted.
 */
export function buildRequestReviewInitialMessage(input: RequestReviewInitialMessageInput): string {
  const { slug, iteration, findingsPath, requestContentHash, attestationPath, sourceRevision } = input;
  const changeFolder = `${_changesDir}/${slug}`;
  const requestMdInChangeFolder = `${changeFolder}/request.md`;
  const rulesPath = `${changeFolder}/rules.md`;

  const hasAttestation = requestContentHash !== undefined && attestationPath !== undefined;

  // Build the sourceRevision line for the attestation JSON template (only when provided).
  const sourceRevisionLine =
    hasAttestation && sourceRevision !== undefined
      ? `,\n      "sourceRevision": "${sourceRevision}"`
      : "";

  const attestationStep = hasAttestation
    ? `\n6a. After completing Step 2 (Code Assertion Fact-Check), write the attestation file:\n    Path: ${attestationPath}\n    Content: JSON with these exact fields:\n    {\n      "requestHash": "${requestContentHash}",\n      "codeAssertionsVerified": true,\n      "verifiedAssertions": ["<each file:line/symbol/path assertion you verified>"]${sourceRevisionLine}\n    }\n    (Copy requestHash${sourceRevision !== undefined ? " and sourceRevision" : ""} verbatim from above — do NOT recompute.)`
    : "";

  return `<user-request>
Please perform a request review for the following change:

Change folder: ${changeFolder}
Iteration: ${iteration}
Result file: ${findingsPath}

Steps:
1. Read ${rulesPath} (rules.md — identity priming)
2. Read ${requestMdInChangeFolder} (the request to review)
3. Explore the codebase as needed to validate the request (Read, Grep, Glob — read-only)
4. Read the template at ${findingsPath} to understand the required format
5. Write your findings and verdict to: ${findingsPath}
6. Report your completion result with { ok: true, findings: [...], evidence: { checked: N, skipped: N, unverified: N } }${attestationStep}

Do NOT write a verdict line in the result file. Verdict is derived by CLI from typed findings.

Do NOT modify any files other than the result file${hasAttestation ? " and the attestation file" : ""}.
Do NOT modify request.md.
</user-request>

ファイルを worktree に書き出したら、完了結果を報告して作業を終えてください。`;
}

// Re-export requestReviewResultPath for convenience (used by step implementation)
export { requestReviewResultPath };
