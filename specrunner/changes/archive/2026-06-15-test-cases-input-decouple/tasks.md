# Tasks: test-cases.md input decoupling と descriptor input-completeness preflight

## T-01: code-review の test-cases.md read を soft 化し prompt を条件化

- [x] `src/core/step/code-review.ts` の `reads()` の `{ path: ".../test-cases.md" }` エントリに `required: false` を付ける（`design.md` / `tasks.md` / gitState は不変）
- [x] `buildCodeReviewInitialMessage` の must-scenario 行（現「Check test coverage against .../test-cases.md (must scenarios)」）を条件化する: `test-cases.md` が**在れば** must-scenario 照合に使い、無ければ code ＋ tests を通常レビューする旨に書き換える
- [x] `CODE_REVIEW_SYSTEM_PROMPT`（`src/prompts/code-review-system.ts`）が `test-cases.md` を必須前提として書いている箇所があれば「在れば使う」に整合させる（無ければ変更不要）

**Acceptance Criteria**:
- `CodeReviewStep.reads()` の `test-cases.md` エントリが `required: false` を返す
- `design.md` / `tasks.md` の read は `required` 既定（必須）のまま、gitState read も不変
- user message が `test-cases.md` の存在有無に応じた条件付きレビュー指示になっている

## T-02: custom reviewer の test-cases.md read を soft 化

- [x] `src/core/step/custom-reviewer.ts` の `createCustomReviewerStep` 内 `reads()` の `{ path: ".../test-cases.md" }` エントリに `required: false` を付ける（`design.md` / `tasks.md` / gitState は不変）
- [x] custom reviewer の user message（`buildCustomReviewerMessage`）は `test-cases.md` を参照していないため prompt 変更は行わない（read の soft 化のみ）

**Acceptance Criteria**:
- `createCustomReviewerStep(...).reads()` の `test-cases.md` エントリが `required: false` を返す
- `design.md` / `tasks.md` / gitState の read 契約は不変

## T-03: producer 保証を回帰テストで固定し stale コメントを是正する

- [x] `src/core/step/test-case-gen.ts` の `writes()` は現状維持（`test-cases.md` を `verify` 無効化せず宣言）であることを確認する。新たな機構は足さない
- [x] `test-case-gen.ts` の stale コメントを是正する: `:44` 付近の「requiresCommit omitted — test-cases.md absence は downstream の code-review が検出」、`:87` 付近の「pipeline detects completion via session idle」の説明を、「`test-cases.md` の未生成・空・未改変テンプレは汎用 output gate（`writes()` → `producedContractsFromWrites` → `validateStepOutputs`、policy `halt`）が `STEP_OUTPUT_MISSING` で検出する」という実態に合わせて書き換える

**Acceptance Criteria**:
- `TestCaseGenStep.writes()` が `test-cases.md` を verify 有効（`verify: false` 無し）で宣言している
- コメントが「producer 保証は output gate が担保する」ことを正しく説明している（"downstream の code-review が検出" の記述が残っていない）
- 回帰テストは T-07 で追加する

## T-04: validateDescriptorInputCompleteness 純関数を追加

- [x] `src/core/pipeline/` に新規モジュール（例 `descriptor-input-completeness.ts`）を追加する
- [x] 型 `DescriptorInputViolation { step: string; path: string }` を定義する
- [x] `validateDescriptorInputCompleteness(descriptor, ambientInputs, probe): DescriptorInputViolation[]` を実装する。`probe = { state, deps }` は代表 state（`steps: {}` 相当の最小 `JobState`）と固定 slug ＋ 最小 `request`（`adr` 含む）の最小 `StepContext`
- [x] アルゴリズム: `available = Set(ambientInputs)` を起点に `descriptor.steps` を上から走査。各 step の `reads()` のうち `required !== false` かつ `artifact !== "gitState"` の file read が `available` に無ければ violation。続いて `writes()` の `artifact !== "gitState"` の write path（`verify` フラグに依らず）を `available` に追加
- [x] path 比較時に iteration suffix を正規化する（末尾 `-\d+` ＋ 任意の `.md` のみを固定トークン化）。`test-cases.md` 等 suffix 無しの構造ファイルは不変に保つ
- [x] `fs` / `child_process` を import しない（B-5）。`step.reads`/`step.writes` 等の純関数のみ呼ぶ

**Acceptance Criteria**:
- 関数が純粋で `fs` / `child_process` を import しない
- 必須 read が上流 writes / ambient で満たされない descriptor に対し、該当 step と path を含む violation 配列を返す
- 満たされる descriptor に対し空配列を返す
- iteration 付き loop-back read（fixer が reviewer の result を読む）は正規化により violation にならない

## T-05: prepare に validator を配線（合成後・bootstrapJob 前）

- [x] `src/core/command/pipeline-run.ts` の `prepare()` で、reviewer snapshot 解決と `getPipelineDescriptor` の後・`bootstrapJob` の前に `composeReviewerDescriptor(descriptor, reviewers)` で合成 descriptor を作る
- [x] 合成 descriptor に対し `validateDescriptorInputCompleteness` を実行する。`ambientInputs` に `requestMdPath(slug)`（必要なら change folder の他の常在ファイル）を渡す
- [x] violation があれば step ＋ path 一覧を含むメッセージで throw する（`bootstrapJob` を呼ばない）。エラー表現は `validateReviewerDefinitions` の流儀（専用 error class）または `SpecRunnerError` ＋ 新 error code のいずれでもよい
- [x] 既存の `validateReviewerDefinitions` / `assertRuntimeSupportsScope` の着手前検査と同じスロットに置き、順序が `compose → input-completeness 検算 → bootstrapJob` になるようにする

**Acceptance Criteria**:
- `prepare()` が `composeReviewerDescriptor` 後・`bootstrapJob` 前に validator を実行する
- violation 時に throw し、`bootstrapJob` が呼ばれず job state が作られない
- violation が無いとき従来どおり `bootstrapJob` まで進む（standard 既定経路の回帰なし）

## T-06: validator の単体テスト

- [x] `validateDescriptorInputCompleteness` の純関数テストを追加する
- [x] producer を外した fixture descriptor（`test-cases.md` を必須 read する step を持ち、上流 producer 無し）が当該 step ＋ `test-cases.md` を violation として返すことを確認する
- [x] D1 適用後の `PIPELINE_REGISTRY` の base descriptor 全件（standard / design-only / fast）が input-complete（violation 0）であることを確認する静的テストを追加する
- [x] fast descriptor が D1 適用後に input-complete になることを明示的に確認する
- [x] loop-back read（spec-fixer / code-fixer）が iteration 正規化により violation にならないことを確認する

**Acceptance Criteria**:
- producer 不在 fixture が violation を返すケースが green
- 全 base descriptor が input-complete である静的テストが green
- fast の input-completeness 確認ケースが green

## T-07: consumer soft / producer 保証の挙動テスト

- [x] `code-review` / custom reviewer の `test-cases.md` read が soft（`required: false`）であり、欠落時に `STEP_INPUT_MISSING` を出さないことを確認するテストを追加する
- [x] `test-cases.md` が在るとき `code-review` の user message が must-scenario 照合に `test-cases.md` を参照する（standard 挙動不変）ことを確認する
- [x] `test-case-gen` が `test-cases.md` 未生成（または空・未改変テンプレ）時に `STEP_OUTPUT_MISSING`（相当）で落ちることを確認する producer 回帰テストを追加する（既存の output-gate テストパターンを流用）
- [x] `tests/unit/step/step-io-contracts.test.ts` の `CodeReviewStep reads/writes` ケースに、`test-cases.md` read が `required: false` であることのアサーションを追加する

**Acceptance Criteria**:
- soft read により欠落時 `STEP_INPUT_MISSING` が出ないことが test で確認される
- `test-cases.md` 在時に must-scenario 照合に使われることが test で確認される
- producer の `STEP_OUTPUT_MISSING` 保証が test で確認される
- step-io-contracts テストが `test-cases.md` read の soft 性を assert する

## T-08: prepare 配線の結合テスト

- [x] `tests/unit/core/command/` 配下に、`prepare()` が `composeReviewerDescriptor` 後・`bootstrapJob` 前に validator を実行し、violation 時に throw して `bootstrapJob` を呼ばないことを確認する結合テストを追加する（`pipeline-run-gate.test.ts` のパターン流用、`loadReviewerDefinitions` を mock）
- [x] violation が無いとき従来どおり `bootstrapJob` が呼ばれ pipelineId が記録される回帰ケースを含める

**Acceptance Criteria**:
- violation 注入時に `bootstrapJob` 未呼び出しで throw することが test で確認される
- 正常 descriptor で `bootstrapJob` まで進む回帰ケースが green

## T-09: 全体回帰と不変条件の確認

- [x] `standard` / `design-only` の挙動・reviewer activation・transitions・registry の step 構成が無改変であること（既存テスト green）を確認する
- [x] `FindingResolution` union が `fixable | decision-needed` のままであることを確認する
- [x] `bun run typecheck && bun run test` が green
- [x] arch 不変条件（B-1〜B-11 ＋ DSM）が green。特に新 validator が `src/core/pipeline/` で `fs`/`child_process` を import していない（B-5）こと

**Acceptance Criteria**:
- `standard` / `design-only` の既存テストが全て green
- `FindingResolution` union が不変
- `bun run typecheck && bun run test` と arch 検証が green
