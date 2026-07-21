# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: Codebase Context

- `specrunner/changes/typed-evidence-gate/rules.md` を Read — パイプライン規律を確認
- `src/core/step/judge-verdict.ts` を Read — `deriveJudgeVerdict` 等の全 verdict 導出関数を確認
- `src/state/helpers.ts` を Read — `StepResultInput.toolResult` の型定義を確認
- `src/prompts/fragments.ts` を Read — `EVIDENCE_DISCIPLINE` fragment の定義・内容を確認
- `src/prompts/judge-rules.ts` を Read — `VERDICT_BLOCKING_RULES`、`SEVERITY_DEFINITION` 等を確認

### Step 2: Code Assertion Fact-Check

**断定①**: `src/core/step/judge-verdict.ts` — `deriveJudgeVerdict` は findings の severity / resolution と ok フラグのみから verdict を導出する（checked === 0 等の検証量概念は存在しない）

- Read `src/core/step/judge-verdict.ts` 全体を確認
- `deriveJudgeVerdict(findings, ok)` の実装（lines 32-40）: `!ok → escalation`、`decision-needed ≥ 1 → escalation`、`critical|high ≥ 1 → needs-fix`、`else → approved`
- evidence / checked 概念は存在しない
- **VERIFIED** ✅

**断定②**: `src/state/helpers.ts:71` — `toolResult` の型は `BaseReportResult & { findings?: Finding[]; observations?: Observation[] }`

- Read `src/state/helpers.ts` — line 71 を確認
- 実際: `toolResult?: (BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null;`
- 記載通り（`| null` は追加情報だが矛盾しない）
- **VERIFIED** ✅

**断定③**: `src/prompts/fragments.ts` — `EVIDENCE_DISCIPLINE` fragment が全 agent step の system prompt に注入済み（prompt 規律としてのみ存在）

- Read `src/prompts/fragments.ts` — lines 74-85 で `EVIDENCE_DISCIPLINE` 定義を確認
- Grep で `EVIDENCE_DISCIPLINE` の使用箇所を全列挙:
  - design-system.ts, code-fixer-system.ts, adr-gen-system.ts, request-generate-system.ts,
    custom-reviewer-system.ts, code-review-system.ts, spec-fixer-system.ts, implementer-system.ts,
    regression-gate-system.ts, request-review-system.ts, spec-review-system.ts,
    build-fixer-system.ts, conformance-system.ts, test-materialize-system.ts, test-case-gen-system.ts
- drift-guard test (`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` TC-004 lines 283-291) がこれを機械保証
- 「prompt 規律としてのみ存在」= `EVIDENCE_DISCIPLINE` は agent への指示文であり、verified の場合は CLI 強制なし — **VERIFIED** ✅

**断定④**: 判定チャネルは typed findings に一本化済みで、result md は evidence report（機械 parse されない）

- `src/prompts/judge-rules.ts` VERDICT_BLOCKING_RULES コメント（lines 84-93）: "result md files are evidence reports — agents do NOT write verdict lines. Verdict is derived by CLI from typed findings (report_result tool) only."
- `src/core/step/step-completion.ts` を Read — verdict 導出は全て `toolResult.findings` から行われ、result md のパース経路なし
- `parseResult()` は `{ verdict: null, findingsPath: null }` を返す（judge steps の prose-parse path は dead）
- **VERIFIED** ✅

### Step 3: Request Validation

- **目標の明確さ**: 「findings: [] の approved を機械的に不成立にする」— 具体的で単一焦点
- **受け入れ基準のテスト可能性**: 6 項目全て観測可能（unit test + typecheck 確認可能）
- **スコープ一貫性**: スコープ外の明示列挙（真正性検証・承認 revision 束縛・producer 拡張）が明確

### Step 4: External Dependency Check

- 外部 SDK / API 制約: 本変更は spec-runner 内部の型・ロジック変更のみ。外部依存なし ✅

### Step 5: Scope & Complexity Evaluation

**regression-gate の空 ledger ケース確認**:

- `src/core/step/regression-gate.ts:110-117` を Read — `skipWhen()` により ledger が空の場合は step が skip（verdict="skipped"）
- 「checked=0 → escalation」が空 ledger 時に誤 escalation を引き起こさないことを確認
- **VERIFIED**: 空 ledger ケースは `skipWhen` が先に発火するため、 `deriveRegressionGateVerdict` の vacuous チェックは未到達 ✅

**step-completion.ts での evidence 伝播確認**:

- `src/core/step/step-completion.ts:156-160` を Read — `verdictFn(undecidedFindings, tr.ok)` — 現在 evidence を渡していない
- 本変更後は `tr.evidence` を渡す変更が step-completion.ts にも必要（request は `verdict 導出を拡張し` と明記しており、step-completion.ts への変更も含意されている）
- request の要件 3 で "verdict 導出を拡張し" と記載 — 実装スコープに含まれる ✅

**後方互換経路の確認**:

- `src/core/step/fixer-helpers.ts:60-65` を Read — `getLatestJudgeFindings` は state の `toolResult` を raw object cast で読む（`parseJudgeReportInput` を経由しない）
- `src/core/resume/resume-context.ts` を Read — resume 時は `previousRun?.outcome?.verdict` を読むのみ（re-parsing なし）
- 既存 state.json の `toolResult` に `evidence` フィールドがなくても再 parse されないため、後方互換は自然に担保される ✅

## 検証できなかった項目

None

## Findings 詳細

None
