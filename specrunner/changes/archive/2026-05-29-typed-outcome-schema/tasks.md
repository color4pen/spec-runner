# Tasks: typed-outcome-schema

## T-01: step-class 別の outcome 型と parse 関数を追加 (report-result.ts)

- [x] `ProducerReportResult extends BaseReportResult { status?: "success" | "error" }` を追加
- [x] `JudgeReportResult extends BaseReportResult { approved?: boolean }` を追加
- [x] `CodeReviewReportResult extends JudgeReportResult { fixableCount?: number }` を追加
- [x] `parseProducerReportInput(raw)` を追加: `parseBaseReportInput` の結果をベースに、`status` が `"success"` or `"error"` の string なら値をセット。未指定なら undefined（missingFields に含めない）
- [x] `parseJudgeReportInput(raw)` を追加: base parse 後、`approved` が boolean なら値をセット。未指定なら undefined
- [x] `parseCodeReviewReportInput(raw)` を追加: judge parse 後、`fixableCount` が number なら値をセット。未指定なら undefined
- [x] 3 型と 3 関数を export する

**Acceptance Criteria**:
- 3 つの interface が BaseReportResult を extends している
- 新フィールドは全て optional（`?`）
- 各 parse 関数: 新フィールド付き input → 値がセットされた Result を返す
- 各 parse 関数: 新フィールドなし input → base のみ parse 成功、新フィールドは undefined
- 各 parse 関数: `ok` 未指定 → `{ ok: false, missingFields: ["ok"] }` を返す（既存挙動維持）
- 既存の `BaseReportResult`, `parseBaseReportInput` は変更しない

## T-02: per-step-class ReportToolSpec と toCustomToolSpec ヘルパーを追加 (report-tool.ts)

- [x] `toCustomToolSpec(spec: ReportToolSpec): CustomToolSpec` ヘルパー関数を追加（`toJSONSchema(object(spec.zodSchema))` で input_schema を生成）
- [x] `PRODUCER_REPORT_TOOL: ReportToolSpec<ProducerReportResult>` を追加
  - zodSchema: 既存の `{ ok, reason? }` + `status: optional(union([literal("success"), literal("error")]))`
  - description: status フィールドの説明を追記
  - parseInput: `parseProducerReportInput`
- [x] `JUDGE_REPORT_TOOL: ReportToolSpec<JudgeReportResult>` を追加
  - zodSchema: 既存の `{ ok, reason? }` + `approved: optional(boolean())`
  - description: approved フィールドの説明を追記
  - parseInput: `parseJudgeReportInput`
- [x] `CODE_REVIEW_REPORT_TOOL: ReportToolSpec<CodeReviewReportResult>` を追加
  - zodSchema: 既存の `{ ok, reason? }` + `approved: optional(boolean())` + `fixableCount: optional(number())`
  - description: approved + fixableCount フィールドの説明を追記
  - parseInput: `parseCodeReviewReportInput`
- [x] `PRODUCER_REPORT_TOOL_CUSTOM_TOOL_SPEC` 等の個別 export は作らない（`toCustomToolSpec` で各 step が導出）
- [x] 既存の `REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` は削除しない（互換性維持）

**Acceptance Criteria**:
- 3 つの ReportToolSpec が export されている
- `toCustomToolSpec` が export されている
- 各 zodSchema が新フィールドを `optional()` で含む
- `toJSONSchema` で生成した JSON Schema に新フィールドが反映される
- 既存の `REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` が残っている

## T-03: producer step 定義を PRODUCER_REPORT_TOOL に切替

対象 step: `design.ts`, `implementer.ts`, `spec-fixer.ts`, `delta-spec-fixer.ts`, `code-fixer.ts`, `build-fixer.ts`, `test-case-gen.ts`, `adr-gen.ts`

各ファイルで:
- [x] import を `REPORT_TOOL, REPORT_TOOL_CUSTOM_TOOL_SPEC` → `PRODUCER_REPORT_TOOL, toCustomToolSpec` に変更
- [x] AgentDefinition.tools 配列内の `REPORT_TOOL_CUSTOM_TOOL_SPEC` → `toCustomToolSpec(PRODUCER_REPORT_TOOL)` に変更
- [x] `reportTool: REPORT_TOOL` → `reportTool: PRODUCER_REPORT_TOOL` に変更

**Acceptance Criteria**:
- 8 ファイル全てで import と参照が PRODUCER_REPORT_TOOL / toCustomToolSpec に切り替わっている
- `REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` への参照が 8 ファイルから消えている
- `bun run typecheck` が green

## T-04: judge step 定義を JUDGE_REPORT_TOOL に切替

対象 step: `spec-review.ts`

- [x] import を `REPORT_TOOL, REPORT_TOOL_CUSTOM_TOOL_SPEC` → `JUDGE_REPORT_TOOL, toCustomToolSpec` に変更
- [x] AgentDefinition.tools 内の `REPORT_TOOL_CUSTOM_TOOL_SPEC` → `toCustomToolSpec(JUDGE_REPORT_TOOL)` に変更
- [x] `reportTool: REPORT_TOOL` → `reportTool: JUDGE_REPORT_TOOL` に変更

**Acceptance Criteria**:
- spec-review.ts で JUDGE_REPORT_TOOL / toCustomToolSpec を参照している
- `bun run typecheck` が green

## T-05: code-review step 定義を CODE_REVIEW_REPORT_TOOL に切替

対象 step: `code-review.ts`

- [x] import を `REPORT_TOOL, REPORT_TOOL_CUSTOM_TOOL_SPEC` → `CODE_REVIEW_REPORT_TOOL, toCustomToolSpec` に変更
- [x] AgentDefinition.tools 内の `REPORT_TOOL_CUSTOM_TOOL_SPEC` → `toCustomToolSpec(CODE_REVIEW_REPORT_TOOL)` に変更
- [x] `reportTool: REPORT_TOOL` → `reportTool: CODE_REVIEW_REPORT_TOOL` に変更

**Acceptance Criteria**:
- code-review.ts で CODE_REVIEW_REPORT_TOOL / toCustomToolSpec を参照している
- `bun run typecheck` が green

## T-06: parse 関数の unit test を追加

テストファイル: `tests/unit/core/port/report-result.test.ts`（新規）

- [x] `parseProducerReportInput` のテスト:
  - `{ ok: true, status: "success" }` → `{ ok: true, value: { ok: true, status: "success" } }`
  - `{ ok: true, status: "error" }` → `{ ok: true, value: { ok: true, status: "error" } }`
  - `{ ok: true }` (status なし) → `{ ok: true, value: { ok: true } }` (status undefined)
  - `{ ok: true, status: "invalid" }` → status undefined（不正値は無視）
  - `{}` (ok なし) → `{ ok: false, missingFields: ["ok"] }`
- [x] `parseJudgeReportInput` のテスト:
  - `{ ok: true, approved: true }` → value に approved: true
  - `{ ok: true, approved: false }` → value に approved: false
  - `{ ok: true }` (approved なし) → approved undefined
  - `{}` → missingFields: ["ok"]
- [x] `parseCodeReviewReportInput` のテスト:
  - `{ ok: true, approved: true, fixableCount: 3 }` → value に approved: true, fixableCount: 3
  - `{ ok: true, approved: false, fixableCount: 0 }` → value に approved: false, fixableCount: 0
  - `{ ok: true }` (両方なし) → approved undefined, fixableCount undefined
  - `{}` → missingFields: ["ok"]
- [x] 既存の `parseBaseReportInput` テストが存在すればそのまま green

**Acceptance Criteria**:
- 全テストケースが pass
- 新フィールド付き input で該当フィールドが non-undefined であることを assert
- 新フィールドなし input で base parse が正常動作することを assert

## T-07: adapter 経由の presence integration test を追加

テストファイル: `tests/unit/adapter/claude-code/agent-runner.test.ts`（既存に追加）

- [x] producer step mock で `{ ok: true, status: "success" }` を report_result tool call として返し、`runResult.toolResult` を `Record<string, unknown>` にキャストして `status` が `"success"` であることを assert
- [x] judge step mock で `{ ok: true, approved: true }` を report_result tool call として返し、`approved` が `true` であることを assert
- [x] code-review step mock で `{ ok: true, approved: true, fixableCount: 2 }` を report_result tool call として返し、`approved` が `true`、`fixableCount` が `2` であることを assert

**Acceptance Criteria**:
- 3 つの integration test が pass
- 新フィールドが adapter を通過して toolResult に到達していることを assert
- 既存の agent-runner テストが全て green のまま

## T-08: 既存テスト green 確認

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] executor.ts に diff がないことを確認（`git diff src/core/step/executor.ts` が空）
- [x] pipeline/types.ts に diff がないことを確認（`git diff src/core/pipeline/types.ts` が空）

**Acceptance Criteria**:
- typecheck + test が pass
- executor.ts と pipeline/types.ts が未変更
