# Tasks: judge report tool に observations チャネルを追加する

## T-01: kernel に `Observation` 型を追加する

- [ ] `src/kernel/report-result.ts` に `Observation` interface を追加・export する。形は
  `{ severity: FindingSeverity; file: string; line?: number; title: string; rationale: string }`。
  `resolution` フィールドは持たない（D1）
- [ ] severity は既存の `FindingSeverity` を再利用する（severity 語彙の二重定義を作らない）
- [ ] 「severity は記録用で routing に使われない」旨を doc コメントで明記する

**Acceptance Criteria**:
- `Observation` が kernel に定義され export される
- `Observation` に `resolution` プロパティが型として存在しない
- `bun run typecheck` が green

## T-02: state schema / helpers の `toolResult` 型を observations で widen する

- [ ] `src/state/schema.ts:125` の `StepOutcome.toolResult` を
  `(BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null` に widen し、
  `Observation` を kernel から import する（D2）
- [ ] `src/state/helpers.ts:70` の `StepResultInput.toolResult` も同型に widen する
- [ ] 既存の toolResult 書き込み経路（`pushStepResult`）はロジック無変更

**Acceptance Criteria**:
- observations を含む toolResult オブジェクトを `StepOutcome.toolResult` に代入しても型エラーが出ない
- `bun run typecheck` が green

## T-03: port の typed interface に observations を追加し best-effort parse を実装する

- [ ] `src/core/port/report-result.ts` に純粋 helper `parseObservations(raw): { ok: true; value:
  Observation[] } | { ok: false }` を追加する。各要素の severity ∈ 4 値、file string、title string、
  rationale string、line は number または欠落、を typeof で検証する（`parseFindings` と同型、
  `resolution` 検証なし。zod parse は使わない＝純粋性維持）（D4）
- [ ] `JudgeReportResult` / `RequestReviewReportResult` に `observations?: Observation[]` を追加する
  （`CodeReviewReportResult` は Judge を継承）。`Observation` は kernel から import
- [ ] `parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput` を拡張し、
  `observations` を **best-effort silent-ignore** で取り込む:
  - 欠落 → `result.observations` 未設定
  - 正常な配列 → `result.observations` に検証済み配列をセット
  - 不正構造 → silent drop（undefined のまま）。**`missingFields` に `observations` を載せない**
- [ ] findings の必須判定・`missingFields`・ok 判定のロジックは無変更（observations は ok 判定に
  一切影響しない）

**Acceptance Criteria**:
- `parseJudgeReportInput({ ok: true, findings: [], observations: [valid] })` が `ok: true` で
  observations をセットする
- `parseJudgeReportInput({ ok: true, findings: [], observations: "bad" })` が `ok: true` で
  observations undefined（`missingFields` に observations を含めない）
- `parseJudgeReportInput({ ok: true, findings: [] })`（observations 欠落）が `ok: true` で
  observations undefined
- parseInput がファイル I/O を行わない（純粋関数）
- `bun run typecheck` が green

## T-04: judge-family の `report_result` スキーマに observations を追加する

- [ ] `src/core/step/report-tool.ts` に `observationSchema`（`array(object({ severity, file, line?,
  title, rationale }))`、`resolution` なし）を定義する（D3）
- [ ] `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` の zodSchema に
  `observations: optional(observationSchema)` を追加する
- [ ] 各 tool の description に observations の用途（「対応不要だが記録したい観察。verdict には影響しない。
  指摘がなければ省略可」）を追記する
- [ ] `findings` / `approved` / `fixableCount` / `verdict` フィールドは無変更

**Acceptance Criteria**:
- `toCustomToolSpec(JUDGE_REPORT_TOOL)` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` が
  observations を含む有効な JSON Schema を生成する（`toJSONSchema` が例外を投げない）
- producer 系 tool（`REPORT_TOOL` / `PRODUCER_REPORT_TOOL`）には observations が追加されない
- `bun run typecheck` が green

## T-05: judge-rules に `OBSERVATION_DEFINITION` を追加し全 judge prompt に同梱する

- [ ] `src/prompts/judge-rules.ts` に `OBSERVATION_DEFINITION` 定数を追加する。内容に最低限:
  - 「対応不要だが記録すべき観察。verdict には影響しない」
  - 「**再現手順を構成できる問題を observation に入れることは禁止 — それは finding**」
  - finding / decision-needed / observation の置き場判断の手掛かり（D8）
- [ ] `DECISION_NEEDED_DEFINITION` を注入する全 prompt に `OBSERVATION_DEFINITION` を同梱する:
  `src/prompts/code-review-system.ts` / `src/prompts/spec-review-system.ts` /
  `src/prompts/request-review-system.ts` / `src/prompts/custom-reviewer-system.ts` /
  `src/prompts/regression-gate-system.ts`
- [ ] 各 prompt の Completion セクション（severity/resolution 定義近傍）に `observations` 配列の形式
  （`{ severity, file, line?, title, rationale }`、resolution なし、省略可）を併記する

**Acceptance Criteria**:
- `OBSERVATION_DEFINITION` が「対応不要だが記録すべき観察」と observation 禁止規律（再現手順を構成できる
  問題は finding）の双方を含む
- 上記 5 prompt がいずれも `OBSERVATION_DEFINITION` を含む
- `bun run typecheck` が green

## T-06: findings 消費経路が observations を読まない不変条件をテストで固定する

- [ ] verdict 不変（`src/core/step/__tests__/judge-verdict.test.ts` または新規）: observations に
  critical を含み findings が空の toolResult を parse → `deriveJudgeVerdict(findings ?? [], ok)` が
  `approved`、`collectVerdictAffectingFindings(findings ?? [])` が 0 件（D5、受け入れ基準 1/3）
- [ ] 台帳不変（`src/core/pipeline/__tests__/findings-ledger.test.ts` に追記）: StepRun の toolResult が
  `findings: [fixable]` + `observations: [1 件]` のとき `collectFindingsLedger` が finding のみを返す
  （observation を含めない）（受け入れ基準 3）
- [ ] fixer 不変（`tests/unit/step/fixer-findings.test.ts` または `fixer-helpers` のテスト）:
  toolResult が findings + observations を持つとき `getLatestJudgeFindings` が findings のみを返し、
  `buildFindingsBlock` の出力に observation の title が現れない（受け入れ基準 2）

**Acceptance Criteria**:
- observations を追加しても verdict / 台帳 / fixer 入力が findings のみで決まることがテストで固定される
- 上記いずれのテストも消費側コードの変更なしで pass する
- `bun run test` で当該テストが pass

## T-07: observations parse と後方互換のユニットテスト

- [ ] `tests/unit/core/port/report-result-observations.test.ts` を新規作成:
  - `parseObservations`: 正常配列 / 空配列 / 非配列 / 要素不正（severity 不正・file 欠落）/ line null・欠落
  - `parseJudgeReportInput` / `parseCodeReviewReportInput` / `parseRequestReviewReportInput`:
    observations 正常 → セット、不正 → silent drop（`missingFields` に含めない、ok=true 維持）、
    欠落 → undefined
  - 後方互換: observations フィールドなしの入力が従来通り parse され observations undefined になる
    （受け入れ基準 4）
  - parse → derive 結合: observations に critical を入れても verdict が `approved`（findings 空時）

**Acceptance Criteria**:
- observations の正常 / 不正 / 欠落の各ケースが pass する
- 旧形式（observations なし）入力で observations undefined・findings 検証が従来通り
- `bun run test` で当該テストが pass

## T-08: codex strict-schema の observations 対応テストを追加する

- [ ] `tests/adapter/codex/strict-schema.test.ts` に追記（変換コード `src/adapter/codex/strict-schema.ts`
  は generic walk のため無改修、D7）:
  - `toOpenAIStrictSchema(JUDGE_REPORT_TOOL の JSON Schema)` の top-level required に `observations` が
    含まれ、`observations` が nullable array になる
  - observation 要素の required に severity/file/title/rationale/line が含まれ、`line` が nullable、
    severity/file/title/rationale が非 nullable、`resolution` が要素に存在しない
  - `stripNullDeep` が observation 要素の `line: null` を除去する

**Acceptance Criteria**:
- codex strict 変換が observations を findings と同等に処理することがテストで固定される
- observation 要素に `resolution` が現れないことがテストで確認される
- `bun run test` で当該テストが pass

## T-09: prompt fragment-coverage テストを拡張する

- [ ] `src/prompts/__tests__/fragment-coverage.test.ts` に追記:
  - `OBSERVATION_DEFINITION` 定数が「対応不要だが記録すべき観察」と observation 禁止規律（再現手順を
    構成できる問題は finding）を含む
  - `DECISION_NEEDED_DEFINITION` を注入する 5 prompt（code-review / spec-review / request-review /
    custom-reviewer（`buildCustomReviewerSystemPrompt(makeSnapshot())`）/ regression-gate
    （`REGRESSION_GATE_SYSTEM_PROMPT`））がいずれも `OBSERVATION_DEFINITION` を含む（受け入れ基準 5）

**Acceptance Criteria**:
- 5 prompt すべてに observation 定義が同梱されることがテストで固定される
- `bun run test` で当該テストが pass

## T-10: 配線確認と最終検証

- [ ] `Observation` / `parseObservations` / `OBSERVATION_DEFINITION` の参照を grep で確認し、消費側
  （verdict / ledger / fixer / regression-gate / verifyFindingRefs）が observations を読まないことを
  目視確認する
- [ ] `bun run typecheck` が green
- [ ] `bun run test` で全テストが pass（regression なし）

**Acceptance Criteria**:
- findings 契約（verdict 駆動・台帳・fixer・regression-gate）が observations 追加で不変
- `typecheck && test` が green
