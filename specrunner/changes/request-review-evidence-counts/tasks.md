# Tasks: request-review 完了契約に evidence counts を追加し、確認ゼロ approve を非 green 化する

<!-- 実装対象ファイル一覧（参照用）
- src/core/port/report-result.ts          — T-01: RequestReviewReportResult 拡張・parseRequestReviewReportInput の evidence 必須化
- src/core/step/report-tool.ts            — T-02: REQUEST_REVIEW_REPORT_TOOL の zodSchema に evidence・description 更新
- src/core/step/judge-verdict.ts          — T-03: deriveRequestReviewVerdict に evidence 引数・vacuous ルール
- src/core/step/step-completion.ts        — T-04: request-review 分岐で evidence 受け渡し・checked=0 診断
- src/prompts/request-review-system.ts    — T-05: EVIDENCE_COUNTS_DEFINITION 注入
- 各種テスト                              — T-06/T-07/T-08: 新規テスト・既存 drift-guard 反転・fixture 追随・破壊確認
既存資産（変更しない・再利用のみ）: parseEvidence / evidenceSchema / EVIDENCE_COUNTS_DEFINITION / Evidence 型 / 永続化スキーマ（evidence? 既存）
-->

---

## T-01: RequestReviewReportResult 型拡張と parse の evidence 必須化

request-review 完了結果型に evidence を additive 追加し、`ok=true` の tool 入力で必須化する。既存の `parseEvidence` を再利用する（複製しない）。

- [x] `src/core/port/report-result.ts` の `RequestReviewReportResult` インターフェースに `evidence?: Evidence;` を追加する（型上は optional）。`Evidence` は同ファイルで既に kernel から re-export 済みのため追加 import は不要。
- [x] `parseRequestReviewReportInput` の `ok=true` ブロック（findings の任意チェックの直後）に evidence 必須化を追加する。既存の `parseEvidence` を呼び、失敗時は `{ ok: false, missingFields: ["evidence"], rawInput: raw }` を返し、成功時は `result.evidence = parsedEvidence.value` を設定する。
- [x] findings は request-review では**従来どおり任意**のまま保つ（findings 欠落で parse 失敗にしない）。evidence 必須化は findings 任意性と独立に適用する。
- [x] `ok=false` のとき evidence を要求しないこと（`ok=true` ブロック内でのみチェック）を保証する。
- [x] `parseEvidence` / `evidenceSchema` / `Evidence` 型は**変更しない**（再利用のみ）。

**Acceptance Criteria**:
- `parseRequestReviewReportInput({ ok: true, findings: [] })`（evidence なし）→ `{ ok: false }`、`missingFields` に `"evidence"` を含む。
- `parseRequestReviewReportInput({ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } })` → `{ ok: true }`、`value.evidence` が一致。
- `parseRequestReviewReportInput({ ok: true, evidence: { checked: -1, skipped: 0, unverified: 0 } })` → `{ ok: false }`（負値拒否、`missingFields` に `"evidence"`）。
- `parseRequestReviewReportInput({ ok: true, evidence: { checked: 1.5, skipped: 0, unverified: 0 } })` → `{ ok: false }`（非整数拒否）。
- `parseRequestReviewReportInput({ ok: false, reason: "x" })` → `{ ok: true }`（ok=false は evidence 不要）。
- `bun run typecheck` が緑。

---

## T-02: REQUEST_REVIEW_REPORT_TOOL の zodSchema と description 更新

request-review tool spec の zodSchema に evidence を追加し、description に必須フィールドとして明記する。既存の `evidenceSchema` を再利用する。

- [x] `src/core/step/report-tool.ts` の `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に `evidence: optional(evidenceSchema)` を追加する（既存 `evidenceSchema` を再利用。zod 上は optional、実強制は parseInput）。
- [x] `REQUEST_REVIEW_REPORT_TOOL.description` を更新し、`ok=true` で `evidence: { checked, skipped, unverified }`（すべて非負整数）が REQUIRED であること、`checked` は実際に検証した項目数であり `checked === 0` は判定不能として扱われることを明記する（judge tool の description と同趣旨の文言）。
- [x] `evidenceSchema` の定義は**変更しない**（再利用のみ）。他の 3 judge tool / producer tool は**変更しない**。

**Acceptance Criteria**:
- `REQUEST_REVIEW_REPORT_TOOL.zodSchema` に `evidence` キーが存在する。
- `REQUEST_REVIEW_REPORT_TOOL.description` に `evidence` / `checked` / `skipped` / `unverified` の記述がある。
- `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` / `PRODUCER_REPORT_TOOL` の zodSchema・description が本タスクで変わらない。
- `toCustomToolSpec(REQUEST_REVIEW_REPORT_TOOL)` の JSON schema 生成が型エラーなく通る（`bun run typecheck` 緑）。

---

## T-03: deriveRequestReviewVerdict の vacuous ルール追加

`deriveRequestReviewVerdict` に evidence 引数と `checked === 0 → needs-discussion` を追加する。

- [x] `src/core/step/judge-verdict.ts` の `deriveRequestReviewVerdict` のシグネチャを `(findings: Finding[], ok: boolean, evidence?: Evidence)` に拡張する（`Evidence` は同ファイルで既に import 済み）。ロジック順序:
  1. `!ok` → `"needs-discussion"`（既存、最優先）
  2. `evidence !== undefined && evidence.checked === 0` → `"needs-discussion"`（**新規 vacuous check**、`!ok` 直後・blocking 判定の前）
  3. blocking（critical | high | decision-needed）≥ 1 → `"needs-discussion"`（既存）
  4. else → `"approve"`（既存）
- [x] 戻り値型は `"approve" | "needs-discussion"` のまま（新値を足さない）。
- [x] `evidence === undefined`（legacy 経路）のとき vacuous check を飛ばし従来導出になることを保証する。
- [x] docstring を更新し、vacuous check（`checked === 0` は検証実績ゼロのため approve にしない）と legacy フォールバックを明記する。
- [x] `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` は**変更しない**。

**Acceptance Criteria**:
- `deriveRequestReviewVerdict([], true, { checked: 0, skipped: 3, unverified: 0 })` → `"needs-discussion"`。
- `deriveRequestReviewVerdict([], true, { checked: 5, skipped: 0, unverified: 0 })` → `"approve"`。
- `deriveRequestReviewVerdict([finding("high","fixable")], true, { checked: 2, skipped: 0, unverified: 0 })` → `"needs-discussion"`（blocking 導出不変）。
- `deriveRequestReviewVerdict([finding("low","decision-needed")], true, { checked: 2, skipped: 0, unverified: 0 })` → `"needs-discussion"`（decision-needed 導出不変）。
- `deriveRequestReviewVerdict([], true)`（evidence なし 2 引数）→ `"approve"`（後方互換）。
- `deriveRequestReviewVerdict([], false)` → `"needs-discussion"`（ok=false 不変）。

---

## T-04: step-completion での evidence 受け渡しと診断出力

`deriveStepCompletion` の request-review 分岐で verdict 導出に evidence を渡し、`checked === 0` を人間に surfacing する。

- [x] `src/core/step/step-completion.ts` の `isRequestReviewStep` 分岐（現状 `deriveRequestReviewVerdict(undecidedFindings, tr.ok)`）を `deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence)` にする（`tr` は `RequestReviewReportResult`、evidence を保持）。
- [x] 同分岐で `tr.evidence?.checked === 0` を検知したら `stderrWrite` で診断を出力する（judge / conformance 分岐と同じ surfacing パターン。例: `[<step.name>] vacuous check: checked=0 — 検証実績ゼロのため needs-discussion として扱われます`）。
- [x] `persistToolResult` / `effectiveToolResult` の型は既に `evidence?: Evidence` を含む（typed-evidence-gate で拡張済み）。request-review の evidence が spread でそのまま永続化されることを確認する（追加ロジック不要の確認）。
- [x] judge / conformance / producer 分岐、null-toolResult フォールバック（request-review → needs-discussion）は**変更しない**。

**Acceptance Criteria**:
- request-review step が `{ ok: true, findings: [], evidence: { checked: 0, skipped: 3, unverified: 0 } }` を報告したとき、`deriveStepCompletion` の返す verdict が `"needs-discussion"`。
- request-review step が `{ ok: true, findings: [], evidence: { checked: 3, skipped: 0, unverified: 0 } }` を報告したとき、verdict が `"approve"`。
- `checked === 0` 検出時に stderr へ診断が出る。
- `persistToolResult` に evidence が保持され、state に永続化される。
- `bun run typecheck` 緑。

---

## T-05: request-review system prompt への evidence 記入指示の注入

`EVIDENCE_COUNTS_DEFINITION`（単一ソース fragment）を request-review prompt の Completion 節に注入する。文言複製をしない。

- [x] `src/prompts/request-review-system.ts` の `judge-rules.js` からの import に `EVIDENCE_COUNTS_DEFINITION` を追加する。
- [x] Completion 節（findings / `${OBSERVATION_DEFINITION}` の近辺、Output 形式の直後）に `${EVIDENCE_COUNTS_DEFINITION}` を埋め込む（judge prompt と同じ import・埋め込みパターン）。文言をインライン複製しない。
- [x] 既存の `## Evidence` 節（`EVIDENCE_DISCIPLINE`）は**残す**（散文の根拠規律。counts 記入指示は Completion 側に追加する二層構成）。
- [x] `EVIDENCE_COUNTS_DEFINITION` の定義（judge-rules.ts）は**変更しない**（provider-neutral のまま再利用）。

**Acceptance Criteria**:
- `REQUEST_REVIEW_SYSTEM_PROMPT` が `EVIDENCE_COUNTS_DEFINITION` の文字列を含む。
- 注入がインライン複製でなく `judge-rules.ts` の単一ソース由来である（import した定数を埋め込んでいる）。
- 既存の request-review prompt 契約（`Code Assertion Fact-Check` / read-only / approve・needs-discussion・reject / findings）が保持される。
- `bun run typecheck` 緑。

---

## T-06: 新規テスト（受け入れ基準の固定）

request の受け入れ基準を新規 unit テストで固定する。

- [x] **verdict 導出テスト**（`src/core/step/__tests__/judge-verdict.test.ts` の `deriveRequestReviewVerdict` describe、または `tests/unit/step/judge-verdict.test.ts`）に vacuous ケースを追加する:
  - `checked: 0` + `findings: []` → `"needs-discussion"`（受け入れ基準 1）。
  - `checked > 0` + `findings: []` → `"approve"`（受け入れ基準 2）。
  - `checked > 0` + blocking（critical/high, decision-needed）→ `"needs-discussion"`（導出不変）。
  - `checked > 0` + medium/low fixable → `"approve"`（導出不変）。
  - evidence 引数なし（2 引数）→ 従来導出（後方互換）。
- [x] **parse テスト**（`src/core/port/__tests__/report-result.test.ts` または対応 test）に追加する:
  - `parseRequestReviewReportInput({ ok: true, findings: [] })`（evidence なし）→ `{ ok: false }`、`missingFields` に `"evidence"`（受け入れ基準 3）。
  - `parseRequestReviewReportInput({ ok: true, findings: [], evidence: {...} })` → `{ ok: true }`、evidence 一致。
  - 負値・非整数 evidence → parse 失敗。
  - `parseRequestReviewReportInput({ ok: false })` → `{ ok: true }`（evidence 不要）。
- [x] **後方互換テスト**（受け入れ基準 4）: 旧形式 record（evidence 無しの request-review `StepRun`）を含む `JobState` の読み取り（`getLatestStepResult` / findings-ledger 消費経路）と resume が例外なく成功し、永続 verdict が再導出されないことを固定する（state/resume 系テストに追加）。
- [x] **prompt 注入テスト**（受け入れ基準 5）: `REQUEST_REVIEW_SYSTEM_PROMPT` が `EVIDENCE_COUNTS_DEFINITION`（`judge-rules.ts` からの import）を含むことを、単一ソース定数と `toContain` で照合して固定する。

**Acceptance Criteria**:
- 上記すべての新規テストが実装後に緑になる。
- verdict テストで `checked:0 + findings:[]` が approve でない（needs-discussion）ことが固定される。
- verdict テストで `checked>0 + findings:[]` が approve であることが固定される。
- parse テストで evidence 欠落の新規報告が受理されない（parse 失敗）ことが固定される。
- prompt テストが単一ソース由来（複製でない）であることを検証する。

---

## T-07: 既存 drift-guard test の反転と fixture 追随

typed-evidence-gate が固定した「request-review 除外」の drift-guard を反転し、evidence 必須化で破れる既存 fixture を新契約へ追随させる。

- [x] **drift-guard 反転（tool schema）**: `src/core/step/__tests__/report-tool-evidence-schema.test.ts` の TC-023（`REQUEST_REVIEW_REPORT_TOOL.zodSchema` に evidence 無しを固定）を、evidence キーが**存在する**アサートに反転する。
- [x] **drift-guard 反転（parse）**: `src/core/port/__tests__/evidence-enforcement.test.ts` の TC-006（request-review は evidence 不要を固定: `{ ok: true }` / `{ ok: true, findings: [] }` → ok:true）を、evidence 必須（evidence なし ok=true → `{ ok: false }`、`missingFields` に `"evidence"`）に反転する。
- [x] **drift-guard 反転（prompt）**: `src/prompts/__tests__/evidence-fragment-coverage.test.ts` の TC-018（`REQUEST_REVIEW_SYSTEM_PROMPT` が `EVIDENCE_COUNTS_DEFINITION` を含まない）を、`toContain` に反転する。
- [x] **findings-optional テスト追随**: `src/core/port/__tests__/report-result.test.ts` の `parseRequestReviewReportInput` findings-optional 系テスト（`{ ok: true }` / `{ ok: true, verdict: "approve" }` / `{ ok: true, findings: [] }` / T-02 symptom 2 の routing テスト等、`ok: true` で evidence なし）に `evidence: { checked: N>0, skipped: 0, unverified: 0 }` を追加して parse を成立させる（テストの主眼は findings 任意性であり、evidence を加えて維持する）。`{ ok: false }` 系は変更不要。
- [x] **e2e / integration fixture 追随**: 以下の request-review mock 入力（`{ ok: true, verdict: "approve", findings: [] }`）に `evidence: { checked: N>0, skipped: 0, unverified: 0 }` を追加する:
  - `tests/helpers/pipeline-mock-client.ts:266`（pipeline-integration / multi-layer-defense / error-path-integration が共有）
  - `tests/reviewer-activation-e2e.test.ts:155`
  - `tests/custom-reviewers-e2e.test.ts:301`
- [x] **追随の監査**: 上記以外に request-review の `report_result` `ok=true` 入力を組み立てる箇所（`tests/` / `src/**/__tests__/`）を走査し、evidence 欠落で parse 失敗するものに evidence を追加する（判定規則の期待は変えず入力形のみ追随）（`tests/unit/core/port/` の 2 ファイルも追随済み）。

**Acceptance Criteria**:
- TC-023 / TC-006 / TC-018 が反転後の内容で緑になる。
- findings-optional 系テストが evidence 追加後も findings 任意性を検証したまま緑。
- pipeline-integration / custom-reviewers-e2e / reviewer-activation-e2e / multi-layer-defense / error-path-integration が request-review 経由で退行なく緑（request-review が approve のまま design へ進む）。
- 反転・追随で判定規則そのものの期待が変わっていない（evidence を加えた入力の verdict は従来と同一）。

---

## T-08: 破壊確認と検証ゲート

修正前の挙動（evidence なしで approve）に戻すと該当テストが fail することを記録し、パイプライン全体の後退がないことを確認する。

- [x] **破壊確認**（受け入れ基準）: T-03 の vacuous check（`checked === 0 → needs-discussion`）を一時的に外す（または T-01 の evidence 必須化を外す）と、T-06 で追加した `checked:0 + findings:[]` テストが fail することを確認済み。TC-005 は vacuous check なしだと "approve" が返るため fail する。確認後修正を戻した。
- [x] `bun run build` が成功する（型エラーゼロ）。
- [x] `bun run typecheck` が成功する。
- [x] `bun run lint` が成功する（該当する場合）。
- [x] `bun run test` が緑（新規テスト + 反転 drift-guard + 追随 fixture を含む全テスト）。
- [x] integration / e2e（pipeline-integration / custom-reviewers-e2e / reviewer-activation-e2e / multi-layer-defense / error-path-integration）が後退なし。

**Acceptance Criteria**:
- `typecheck && test` が green。
- build / lint がすべて成功する。
- 破壊確認（evidence なしで approve に戻すと該当テストが fail）が記録されている。
- 新規追加した T-06 / 反転した T-07 のテストがすべて緑。
