# Tasks: conformance needs-fix の戻り先 step 導出

実装順は「型/純関数（findings・verdict 導出）→ report tool + prompt → conformance step 差し替え → executor 配線 → 遷移表 → pipeline 予算リセット → 戻り先 step 注入 → E2E/後方互換 → 仕上げ」。
interface（fixTarget / 導出関数 / verdict 文字列）を確定させてから widget テストを書く（scenario 先・code 後）。
各タスクは原則 `bun run typecheck && bun run test` を green に保ったまま進める。

## T-01: fixTarget 型と Finding 拡張

- [ ] `src/kernel/report-result.ts` に `export type FixTarget = "implementer" | "code-fixer" | "spec-fixer"` を追加する（design D1）。
- [ ] `Finding` interface に optional `fixTarget?: FixTarget` を追加する（optional ゆえ既存 step は無影響）。

**Acceptance Criteria**:
- `Finding` に `fixTarget?` が存在し、未指定でも既存生成箇所が型エラーにならない（typecheck green）。
- 既存の report-result 型テストが無変更 green。

## T-02: parseFindings の fixTarget capture と conformance parse 入口

- [ ] `src/core/port/report-result.ts` の `parseFindings`（`:145-168`）を拡張し、要素に `fixTarget` が存在し `"implementer" | "code-fixer" | "spec-fixer"` のいずれかなら capture する。不在・不正値は undefined（missingFields に入れない）。
- [ ] `ConformanceReportResult extends JudgeReportResult`（追加フィールドなし、identity 用）と `parseConformanceReportInput`（`parseJudgeReportInput` を委譲呼び出しし、型を `ConformanceReportResult` にして返す）を追加する。

**Acceptance Criteria**:
- `fixTarget: "spec-fixer"` を含む findings 入力が parse され finding に `fixTarget` が保持される（受け入れ：spec「conformance report tool が fixTarget を受理する」、unit test）。
- 不正な `fixTarget` 値は無視され undefined のまま（unit test）。
- `fixTarget` 不在の findings は従来どおり parse される（既存 parseFindings テスト無変更 green）。

## T-03: deriveConformanceVerdict 純関数

- [ ] `src/core/step/judge-verdict.ts` に `deriveConformanceVerdict(findings, ok): "approved" | "escalation" | "needs-fix:implementer" | "needs-fix:code-fixer" | "needs-fix:spec-fixer"` を追加する（design D2）。
  - `deriveJudgeVerdict(findings, ok)` を再利用。`approved` / `escalation` はそのまま返す。
  - `needs-fix` のとき、`severity === "critical" || severity === "high"` の findings の `fixTarget`（省略時 `"implementer"`）を集約し、優先則 `spec-fixer > implementer > code-fixer` で 1 つ選び `needs-fix:<target>` を返す。
- [ ] 集約ヘルパ（例 `aggregateFixTarget(findings): FixTarget`）を同ファイル内純関数として実装する。

**Acceptance Criteria**:
- 単一 `fixTarget` で `needs-fix:<target>` を返す（3 方向、unit test、受け入れ #1 の導出部）。
- 全省略で `needs-fix:implementer`（unit test、受け入れ #2）。
- 混在で優先則どおり `spec-fixer > implementer > code-fixer`（unit test、受け入れ #3）。
- ok=false → `escalation`、decision-needed ≥ 1 → `escalation`、critical/high 無し → `approved`（`deriveJudgeVerdict` と一致、unit test）。
- `deriveJudgeVerdict` / spec-review・code-review の挙動は無変更（既存 judge-verdict テスト green）。

## T-04: CONFORMANCE_REPORT_TOOL と conformance prompt の fixTarget 指示

- [ ] `src/core/step/report-tool.ts` に conformance 専用 findings schema（既存 `findingSchema` に `fixTarget: optional(union(literal("implementer"), literal("code-fixer"), literal("spec-fixer")))` を加えたもの）と `CONFORMANCE_REPORT_TOOL: ReportToolSpec<ConformanceReportResult>` を追加する。`parseInput = parseConformanceReportInput`。description に「問題の性質と戻り先の対応（spec/design の誤り → spec-fixer、実装の欠落・design 未反映 → implementer、局所的なコード不適合 → code-fixer、省略時 implementer）」を明記する。
- [ ] `src/prompts/conformance-system.ts` の `CONFORMANCE_BASE` に「Fix routing（fixTarget）」節を追加し、4 judgment item の不適合をどの `fixTarget` に対応させるかを指示する。判定の最終決定は CLI が findings から導出する旨（自己申告ではない）を明記する。

**Acceptance Criteria**:
- `CONFORMANCE_REPORT_TOOL` の findings JSON schema に `fixTarget` が含まれる（unit test）。
- `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` の schema には `fixTarget` が含まれない（受け入れ：spec「他 judge step は fixTarget を広告しない」、unit test）。
- `CONFORMANCE_SYSTEM_PROMPT` に `fixTarget` と 3 戻り先名が含まれる（unit test）。
- 既存 TC-012（4 judgment item 参照）が無変更 green。

## T-05: ConformanceStep を CONFORMANCE_REPORT_TOOL へ差し替え

- [ ] `src/core/step/conformance.ts` の `reportTool` と agent tools の `toCustomToolSpec(JUDGE_REPORT_TOOL)` を `CONFORMANCE_REPORT_TOOL` に差し替える（design D1）。
- [ ] 既存テスト `tests/unit/core/step/conformance.test.ts` の TC-013（`reportTool is JUDGE_REPORT_TOOL`）を `CONFORMANCE_REPORT_TOOL` に更新する。

**Acceptance Criteria**:
- `ConformanceStep.reportTool === CONFORMANCE_REPORT_TOOL`（identity、unit test）。
- conformance.test の他ケース（TC-009〜017）が無変更 green。

## T-06: executor の conformance verdict 導出分岐

- [ ] `src/core/step/executor.ts:616-664` に conformance 分岐を追加する（design D2）：
  - `isConformanceStep = stepReportTool === CONFORMANCE_REPORT_TOOL` を定義する。
  - `isJudgeStep` の定義に `|| isConformanceStep` を OR で含める（finding 実在検証 `verifyFindingRefs` と no-tool-call escalation fallback を conformance にも適用するため）。
  - toolResult 非 null の導出分岐で、`isRequestReviewStep` の次・`isJudgeStep` より前に `else if (isConformanceStep) { verdict = deriveConformanceVerdict(tr.findings ?? [], tr.ok); }` を置く。
- [ ] `CONFORMANCE_REPORT_TOOL` を executor の import に追加する。

**Acceptance Criteria**:
- conformance の toolResult から `deriveConformanceVerdict` 経由で `needs-fix:<target>` / `approved` / `escalation` が導出される（unit test、executor-verdict 系）。
- conformance findings の実在検証（非実在参照 → escalation）が従来どおり発火する（既存防御の維持、unit test）。
- spec-review / code-review / request-review の導出は無変更（既存 executor-verdict テスト green）。

## T-07: 遷移表に 3 エントリ追加 + 旧 needs-fix 残置

- [ ] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` conformance 区画（`:173-174`）を design D3 のとおり更新する：
  - `approved → ADR_GEN`（不変）
  - `needs-fix:spec-fixer → SPEC_FIXER`（追加）
  - `needs-fix:implementer → IMPLEMENTER`（追加）
  - `needs-fix:code-fixer → CODE_FIXER`（追加）
  - `needs-fix → IMPLEMENTER`（残置）
- [ ] `compose-reviewers.ts` の transition filter（`:62-68`）が conformance 行を除外しないこと（custom reviewer 構成でも 3 エントリが保持されること）を確認する。変更不要なら確認のみ。

**Acceptance Criteria**:
- `STANDARD_TRANSITIONS` に `CONFORMANCE on needs-fix:implementer/code-fixer/spec-fixer` の 3 行と旧 `needs-fix → implementer` 行が存在する（standard-transitions.test に追加、unit test）。
- 既存 standard-transitions / compose-reviewers テストが無変更 green。

## T-08: pipeline の conformance→fixer 予算リセットと進捗イベント整合

- [ ] `src/core/pipeline/pipeline.ts` の「fresh convergence episode reset」ブロック（`:365-380`）の後、exhaustion 判定（`:387-419`）の前に、`nextStep` が fixer（`Object.values(loopFixerPairs).includes(nextStep)`）かつ `currentStep === STEP_NAMES.CONFORMANCE` のとき、`fixerIters.set(nextStep, 0)` と `loopIters.set(resolvePairedReviewForFixer(state, nextStep, loopFixerPairs), 0)` を行う（design D5）。
- [ ] `pipeline.ts:422` の `outcome === "needs-fix"` 判定を `outcome === "needs-fix" || outcome.startsWith("needs-fix:")` に拡張する（design D7、進捗 `pipeline:iteration:verdict` の整合）。
- [ ] conformance 自身の exhaustion 判定（`:387-393`）が `needs-fix:<target>` outcome でも発火することを確認する（条件式は等値でなく `outcome !== "approved" && outcome !== "passed"` のため変更不要、確認のみ）。

**Acceptance Criteria**:
- conformance → code-fixer 入場で `fixerIters["code-fixer"]` と `loopIters["code-review"]` が 0 リセットされる（受け入れ：spec「conformance 起点の fixer 入場で内側予算がリセットされる」、pipeline test）。
- conformance → spec-fixer 入場で `fixerIters["spec-fixer"]` と `loopIters["spec-review"]` が 0 リセットされる（pipeline test）。
- 通常の reviewer → fixer 入場（currentStep ≠ conformance）ではリセットされない（既存 TC-072/074 が無変更 green）。

## T-09: conformance findings 注入ヘルパ

- [ ] `src/core/step/fixer-helpers.ts` に `getConformanceFixContext(state, stepName): Finding[] | null` を追加する（design D4）：
  1. 最新 conformance run（`state.steps?.[STEP_NAMES.CONFORMANCE]` の末尾）を取得。無ければ `null`。
  2. `outcome.verdict` が string でなく、または `needs-fix:` 接頭でなく、または接頭除去後の target が `stepName` と不一致なら `null`。
  3. recency: 前駆 step の最新 run の `endedAt` と比較し、conformance の `endedAt` が新しくなければ `null`。前駆 step は `stepName` で分岐：`code-fixer` → `resolveActiveReviewer(state, deriveImplFixerChain(state))`、`spec-fixer` → `STEP_NAMES.SPEC_REVIEW`、`implementer` → `STEP_NAMES.IMPLEMENTER`（自身の前 run）。
  4. `outcome.toolResult.findings`（無ければ `null`）を返す。
- [ ] 純関数（I/O なし）として実装し、`getLatestJudgeFindings` と同じ state 参照流儀に揃える。

**Acceptance Criteria**:
- verdict `needs-fix:code-fixer` かつ conformance が active reviewer より新しい state で、code-fixer 向けに conformance findings を返す（unit test）。
- `conformance → spec-fixer → spec-review →（needs-fix）→ spec-fixer` の二巡目相当 state（spec-review が conformance より新しい）で spec-fixer 向けに `null` を返す（受け入れ：spec「reviewer 起点入場では注入しない」、unit test）。
- conformance 未実行・verdict が plain `needs-fix`・target 不一致のとき `null`（受け入れ：spec「fixTarget 不在の run では誤注入しない」、unit test）。

## T-10: 戻り先 step の buildMessage / reads への注入配線

- [ ] `src/core/step/code-fixer.ts`：`buildMessage` 冒頭で `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER)` を評価し、非 null なら reviewer findings の代わりに conformance findings を `buildFindingsBlock(findings)` で埋め込み、conformance non-conformity であることを明示する（continuation 経路含む）。`reads()` は conformance 入場時 `conformanceResultPath(slug, latestIteration(state, CONFORMANCE))` を返す（design D4）。
- [ ] `src/core/step/spec-fixer.ts`：同様に `getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER)` を評価し、非 null なら conformance findings を使う。`reads()` を conformance 入場時 conformance 結果ファイルへ切り替える。
- [ ] `src/core/step/implementer.ts`：`buildMessage` で `getConformanceFixContext(state, STEP_NAMES.IMPLEMENTER)` を評価し、非 null なら通常メッセージに「## Conformance non-conformities（must resolve）」セクションを追記する。`reads()` を conformance 入場時 conformance 結果ファイルを含むよう調整する（tasks.md / spec.md は維持）。
- [ ] 3 step とも非 conformance 入場時は現行の reads / message を完全維持する（zero regression）。

**Acceptance Criteria**:
- conformance → code-fixer / spec-fixer / implementer の初期メッセージに conformance findings が含まれる（受け入れ #4、3 step それぞれ unit test）。
- 非 conformance 入場（通常 code-review→code-fixer / spec-review→spec-fixer / test-case-gen→implementer）では従来の findings/message のまま（既存 step テスト green）。
- conformance 入場時の `reads()` が STEP_INPUT_MISSING を起こさない（conformance 結果ファイルは存在保証、test）。

## T-11: routing と打ち切りの E2E（mock pipeline）

- [ ] `tests/unit/core/pipeline/pipeline.episode-reset.test.ts` の harness 型（または新規 test ファイル）で以下を固定する。conformance の verdict は `appendStepResult` で `needs-fix:implementer` / `needs-fix:code-fixer` / `needs-fix:spec-fixer` を直接与える：
  - 3 方向それぞれで導出された戻り先 step へ遷移する（受け入れ #1）。
  - 旧 plain `needs-fix` が implementer に戻る（受け入れ #2 の routing 部、後方互換）。
  - 3 方向いずれの経由でも maxIterations 回の conformance 実行後に `CONFORMANCE_RETRIES_EXHAUSTED` で halt する（受け入れ #5）。`CODE_REVIEW_RETRIES_EXHAUSTED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` にならないこと。
  - conformance → code-fixer 入場で code-fixer の予算が fresh から数え直され、入場直後 exhaust しない（D5 / 受け入れ #5）。

**Acceptance Criteria**:
- 3 方向の routing が固定される（受け入れ #1、green）。
- fixTarget 省略相当（plain needs-fix）→ implementer が固定される（受け入れ #2、green）。
- 3 方向の `CONFORMANCE_RETRIES_EXHAUSTED` 打ち切りが固定される（受け入れ #5、green）。
- 既存 TC-070〜074 が無変更 green。

## T-12: 後方互換 resume テスト

- [ ] 旧形式 state（conformance StepRun の verdict が plain `needs-fix`、toolResult に fixTarget なし、または toolResult 不在）を resume して壊れないことを固定する（design D6、受け入れ #6）。resume が conformance を再実行点として解決し、`getConformanceFixContext` が誤注入しないことを含める。

**Acceptance Criteria**:
- 旧 needs-fix history を持つ state の resume が成功する（受け入れ #6、green）。
- 旧形式 run で `getConformanceFixContext` が `null` を返す（誤注入なし、green）。

## T-13: 仕上げ（typecheck / test）

- [ ] `bun run typecheck && bun run test` が green（受け入れ #7）。
- [ ] conformance の fixTarget 宣言形式を必要に応じ `specrunner/project.md` に追記する（実装者判断。change folder 外編集を伴うため実装段階でのみ実施）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ最終、#7）。
- 受け入れ基準 #1〜#6 に対応するテストがすべて green。
