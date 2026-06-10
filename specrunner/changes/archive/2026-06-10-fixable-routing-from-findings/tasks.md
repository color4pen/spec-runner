# Tasks: code-fixer への approved 時 routing を fixableCount 申告ではなく findings から導出する

## T-01: fixable findings 集計の純関数を judge-verdict.ts に追加する

- [x] `src/core/step/judge-verdict.ts` に `collectFixableFindings(findings: Finding[]): Finding[]`
  を追加・export する。実装は `findings.filter((f) => f.resolution === "fixable")`（D2）
- [x] 既存純関数群と同じ規約（pure, no I/O）を守る。`Finding` 型は既存 import を流用する
- [x] 「approved 時点で critical/high・decision-needed は存在しないため対象は実質 low/medium の
  fixable」である旨を doc コメントに残す

**Acceptance Criteria**:
- `collectFixableFindings` が副作用・I/O を持たない純関数として実装される
- `resolution: "fixable"` の finding のみを返し、`decision-needed` を含まない
- 空配列入力で空配列を返す
- `bun run typecheck` が green

## T-02: approved → code-fixer の `when` 述語を findings 由来に置き換える

- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` 内、
  `{ step: CODE_REVIEW, on: "approved", to: CODE_FIXER }` 行の `when` を、直前 code-review run の
  `toolResult.findings`（`?? []`）に対し `collectFixableFindings(...).length > 0` を返す形に
  置き換える（D1）
- [x] `collectFixableFindings` を `../step/judge-verdict.js` から import する。`fixableCount` の読み取り
  （`(...).fixableCount ?? 0`）を削除する。`CodeReviewReportResult` の cast 経由で `.findings` を読む
- [x] `Transition` interface の doc コメント例（types.ts:66 付近の「fixableCount > 0 → code-fixer」）
  と該当 transition 行直上のコメントを findings ベースの表現に更新する
- [x] 行の追加・削除はしない（approved の 2 行・評価順序・`STANDARD_TRANSITIONS` の行数を不変に保つ）

**Acceptance Criteria**:
- approved → code-fixer の `when` が `fixableCount` を一切読まず、`resolution: "fixable"` の finding
  件数 >= 1 で true を返す
- fixable findings 0 件（findings 不在を含む）で false を返し、conformance fallback 行が採用される
- `STANDARD_TRANSITIONS.length` が従来値（31）のまま
- `bun run typecheck` が green

## T-03: CODE_REVIEW_REPORT_TOOL の description から fixableCount 言及を外す

- [x] `src/core/step/report-tool.ts` の `CODE_REVIEW_REPORT_TOOL.description` から `fixableCount` の
  語を削除する（`'approved' field is kept for compatibility but is NOT used for routing.` の形に）。
  `findings` 提出指示は維持する（D3）
- [x] `CODE_REVIEW_REPORT_TOOL` 直上の doc コメントを「`fixableCount` は compat のためスキーマに残すが
  申告は要求しない」旨へ整える
- [x] `zodSchema` の `fixableCount: optional(number())` は削除しない（compat のため残す）
- [x] `src/core/port/report-result.ts` の `CodeReviewReportResult.fixableCount` フィールドおよび
  `parseCodeReviewReportInput` の `fixableCount` 受け口は変更しない（compat のため残す）

**Acceptance Criteria**:
- `CODE_REVIEW_REPORT_TOOL.description` に `fixableCount` の語が含まれない
- `toCustomToolSpec(CODE_REVIEW_REPORT_TOOL)` が例外なく JSON Schema を生成する（schema は無変更）
- `parseCodeReviewReportInput({ ok: true, fixableCount: 3, findings: [] })` が `value.fixableCount === 3`
  を返す（受け口が維持されている）
- `bun run typecheck` が green

## T-04: code-review prompt / self-check に fixableCount 言及が無いことを確認する

- [x] `src/prompts/code-review-system.ts` と `src/core/step/code-review.ts`（followUpPrompt self-check）
  に `fixableCount` の語が含まれないことを確認する。混入していれば除去する（D3）
- [x] `grep -n "fixableCount" src/prompts/code-review-system.ts src/core/step/code-review.ts` が
  該当なしであることを確認する

**Acceptance Criteria**:
- code-review system prompt および followUpPrompt に `fixableCount` の語が存在しない
- （現状すでに満たされている想定。混入があった場合のみ除去する）

## T-05: collectFixableFindings のユニットテスト

- [x] `tests/unit/step/judge-verdict.test.ts` に `collectFixableFindings` のテストを追加する:
  - 空配列 → `[]`
  - fixable のみ → 全件返す
  - fixable と decision-needed の混在 → fixable のみ返す
  - decision-needed のみ → `[]`

**Acceptance Criteria**:
- 上記ケースが pass する
- `bun run test tests/unit/step/judge-verdict.test.ts` が green

## T-06: approved → code-fixer routing（findings 由来）のユニットテスト

- [x] `tests/unit/pipeline/transition-when.test.ts` の既存 fixableCount ベースの述語テスト
  （TC-017/TC-018 ブロックの "returns true when fixableCount is 3" 等）を findings ベースに書き換える
- [x] 以下を `STANDARD_TRANSITIONS` の実 `when` 述語に対して検証する:
  - approved + `resolution: "fixable"` の finding 1 件以上 → `when` が true（→ code-fixer）
  - approved + findings 空 → `when` が false（→ conformance fallback）
  - 矛盾入力 `{ fixableCount: 0, findings: [{ resolution: "fixable", ... }] }` → true（findings に従う）
  - 矛盾入力 `{ fixableCount: 3 }`（findings 不在）→ false（findings に従う）
  - `toolResult` が null → false
- [x] approved → conformance fallback 行（`when` なし）が存在し続けることの確認（既存 TC-3）が
  green であることを確かめる。ヘッダコメントの fixableCount 記述は findings ベースに更新する

**Acceptance Criteria**:
- approved + fixable findings ≥ 1 → code-fixer、fixable findings = 0 → conformance の遷移が
  `when` 述語のテストで検証される
- fixableCount 申告と findings が矛盾する両方向の入力で routing が findings 側に従うことが示される
- `bun run test tests/unit/pipeline/transition-when.test.ts` が green

## T-07: code-fixer prompt 埋め込み findings のユニットテスト（low/medium fixable）

- [x] `tests/unit/step/fixer-findings.test.ts` に、直前 code-review run の toolResult が low/medium の
  `resolution: "fixable"` findings を持つ state（code-fixer 初回 = 前回 run なし）で
  `CodeFixerStep.buildMessage` を呼び、出力に当該 findings の title / file / rationale が含まれ、
  review-feedback ファイルパスの読み込み指示に依存しないことを検証するケースを追加する（D4）

**Acceptance Criteria**:
- low/medium の fixable findings が code-fixer の prompt 本文に埋め込まれることがテストで固定される
- `bun run test tests/unit/step/fixer-findings.test.ts` が green

## T-08: 配線確認と最終検証

- [x] `grep -rn "fixableCount" src/` の結果が routing / 判定ロジックを含まないことを確認する
  （許容: `src/core/port/report-result.ts` の型定義・parse 受け口、`src/core/step/report-tool.ts` の
  compat zod スキーマ・doc コメント、`src/core/parser/review-findings.ts` の歴史的コメント。
  `src/core/pipeline/types.ts` から fixableCount 読み取りが消えていること）
- [x] `bun run typecheck` が green
- [x] `bun run test` が green（regression なし。`tests/store/event-journal.test.ts` の TC-005、
  `tests/unit/core/port/report-result*.test.ts`、`tests/unit/core/step/executor-verdict.test.ts`、
  `tests/unit/adapter/claude-code/agent-runner.test.ts` の fixableCount compat テストが維持されること）

**Acceptance Criteria**:
- `src/` から fixableCount を読む routing / 判定ロジックが消えている（型定義と parse の受け口は残る）
- `typecheck && test` が green
