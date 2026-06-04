# Tasks: 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する

## T-01: リテラル移設・signature 変更で破綻するテストを全列挙する（最初に実施）

リテラルを `Pipeline` 本体・`resolve-step` から記述子へ移すこと、`resolveResumeStep` の引数変更、`Pipeline` constructor への `summaryStep` 追加で破綻する既存テストを着手前に全列挙し、書き換え方針を確定する。

- [x] **signature 依存**: `resolveResumeStep(` を直接呼ぶテスト = `tests/unit/core/resume/resolve-step.test.ts`（52 箇所）。全呼び出しに記述子を第 1 引数で渡す方針を確定する。
- [x] **constructor 依存（summary）**: `Pipeline` を直接構築し summary 出力を assert するテスト = `tests/core/pipeline/pipeline.test.ts`（TC-068、`Pipeline finished: spec-review iterations=1`、`buildMockPipeline` 経由）。`summaryStep:"spec-review"` を渡す方針を確定する。
- [x] **constructor 依存（descriptor 経由は自動）**: `runPipeline` / `buildPipeline` 経由で summary を assert するテスト = `tests/pipeline-integration.test.ts`（line 714）は記述子から `summaryStep` が流れるため **テスト編集不要**であることを確認する。
- [x] **loopName omit の確認**: `new Pipeline(` を構築する全テスト（`tests/unit/pipeline/transition-when.test.ts` / `tests/error-codes.test.ts` / `tests/unit/core/pipeline/{pipeline.transitions,pipeline.storeFactory,pipeline.loop-iter-stdout,pipeline.crash-state,pipeline.cli-step-output}.test.ts` / `tests/core/pipeline/pipeline.test.ts` / `tests/cli-stdout-snapshot.test.ts` / `tests/pipeline-integration.test.ts`）で `loopName` を渡しているか確認し、omit している構築箇所があれば列挙する。
- [x] **ソース文字列読み取りテストの影響なし確認**: `tests/grep-no-step-name-hardcode.test.ts`（executor.ts / executor-helpers.ts のみ scan）と `tests/unit/architecture/core-invariants.test.ts`（import edge / pipeline 内 I/O）は本変更の対象ファイルを scan しない／新たな禁止 import・I/O を増やさないことを確認し、書き換え不要と判断する。
- [x] **STANDARD 記述子構造 assert**: `tests/unit/core/pipeline/run.test.ts`（TC-025 steps length）が `roles` / `summaryStep` 追加で壊れないことを確認する。

**Acceptance Criteria**:
- 書き換え対象テストの一覧（ファイル + 理由 + 書き換え方針）が確定している。
- 「編集不要」と判断したテスト（grep 系・architecture・integration の summary）について根拠が明記されている。

## T-02: 役割 / phase 型を定義し記述子へ一級フィールドとして追加する

- [x] `src/core/pipeline/types.ts` に `StepRole = "creator" | "reviewer" | "fixer" | "gate"`、`StepPhase = "spec" | "impl"`、`StepRoleEntry = { role: StepRole; phase: StepPhase }` を追加する。
- [x] `PipelineDescriptor` に `roles: Readonly<Record<string, StepRoleEntry>>` と `summaryStep?: string` を追加する。
- [x] `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR` に design.md D1 の表どおり 12 step 全ての `roles` を宣言し、`summaryStep = STEP_NAMES.SPEC_REVIEW` を設定する。
- [x] `DESIGN_ONLY_DESCRIPTOR` に `roles = { design: creator/spec }` を宣言し、`summaryStep` は未設定にする。
- [x] `AgentStep.phase` フィールド（`src/core/port/step-types.ts`）と `design.ts` / `spec-review.ts` / `spec-fixer.ts` の `phase:` 宣言を削除する。削除前に `.phase` の読み手が resolve-step のみであることを grep で再確認する。

**Acceptance Criteria**:
- `STANDARD_DESCRIPTOR.roles` の各 phase に role=creator と role=reviewer がそれぞれちょうど 1 つ存在する。
- `AgentStep` 型に `phase` が無く、いずれの step 定義にも `phase:` 宣言が残っていない。
- `bun run typecheck` が green。

## T-03: resolve-step を記述子駆動にし standard 決め打ち / import を除去する

- [x] `resolveResumeStep` の第 1 引数に `descriptor: PipelineDescriptor` を追加する。分岐の優先順位（priority 1 / 2a / 2b / 2c / 3）と各分岐のロジックは現行と完全に一致させる。
- [x] 記述子から導出する純粋ヘルパを実装する：`isSpecPhase(step) = (roles[step]?.phase ?? "impl") === "spec"`、`REVIEWER_STEPS = {role==="reviewer"}`、`FIXER_TO_LOOP = reverse(loopFixerPairs)`、`STEP_MAPPING[phase] = { critic: reviewerOf(phase), creator: creatorOf(phase), fixer: loopFixerPairs[reviewerOf(phase)] }`。
- [x] `(phase, role)` に対応工程が記述子に無い alias 再開要求では、対象 phase / role を明示した Error を投げる（D4）。
- [x] `resolve-step` から `DesignStep` 等の具体 Step import、`STANDARD_LOOP_FIXER_PAIRS` import、役割導出のための `STEP_NAMES.*` リテラルを除去する。`AGENT_STEP_NAMES` / `CLI_STEP_NAMES`（`--from` 有効値チェック）は残す。
- [x] `src/core/command/resume.ts` で `getPipelineDescriptor(getPipelineId(state))` を解決し `resolveResumeStep` に渡す。

**Acceptance Criteria**:
- `resolve-step` のソースに具体 Step import・`STANDARD_LOOP_FIXER_PAIRS` import・役割導出のための step 名リテラルが存在しない。
- standard 記述子を渡したときの全分岐の戻り値が本変更前と一致する。
- `bun run typecheck` が green。

## T-04: Pipeline 本体から standard 固有リテラルを除去し収束意味論を記述子駆動にする

- [x] `pipeline.ts` の `loopName` 既定 `?? STEP_NAMES.SPEC_REVIEW` を除去し、omit 時は `loopNames[0]`（なければ空文字）へフォールバックする。standard 固有リテラルを含めない。
- [x] 例外 catch 経路の resumePoint 既定 step `?? STEP_NAMES.DESIGN` を、`run()` が受け取る `startStep` へのフォールバックに変更する。
- [x] constructor params に `summaryStep?: string` を追加し `this.summaryStep` に保持する。
- [x] `printPipelineFinished` を `this.summaryStep` 駆動にする：`summaryStep` 未設定または `!this.steps.has(this.summaryStep)` のとき early return、それ以外は対象工程名 / 反復数 / 最終 verdict を `summaryStep` から取り `pipeline:summary` を emit する。
- [x] `pipeline.ts` から不要になった `STEP_NAMES` import を除去する（他用途が無いことを確認）。
- [x] exhaustion 経路（`handleExhausted` + `LOOP_ERROR_CODES`）と fixer bypass のロジックは変更しない（`loopNames` / `loopFixerPairs` 駆動の一般則のまま）。
- [x] `src/core/pipeline/run.ts` の `buildPipeline` で `descriptor.summaryStep` を `Pipeline` に伝播する。

**Acceptance Criteria**:
- `pipeline.ts` 本体に standard 固有の step 名直書き（`SPEC_REVIEW` / `DESIGN` 等）が存在しない。
- STANDARD_DESCRIPTOR 構築 pipeline の summary 出力が `Pipeline finished: spec-review …` のまま不変。
- `bun run typecheck` が green。

## T-05: 影響テストを記述子駆動 signature へ書き換える

- [x] `tests/unit/core/resume/resolve-step.test.ts` の全 `resolveResumeStep(` 呼び出しに STANDARD_DESCRIPTOR を第 1 引数で渡す。記述子は registry から import し、リテラル assert ではなく記述子値経由の assert（ランタイムチェック）にする。
- [x] `tests/core/pipeline/pipeline.test.ts` の `buildMockPipeline` が `summaryStep: "spec-review"` を `Pipeline` に渡すようにし、TC-068 の `Pipeline finished: spec-review iterations=1` を green に保つ。
- [x] T-01 で列挙した loopName omit 構築箇所があれば `loopName` を明示する。

**Acceptance Criteria**:
- 既存の打ち切り（`*_RETRIES_EXHAUSTED`）・fixer bypass・escalation 関連テストが green。
- 画面出力スナップショット（`tests/cli-stdout-snapshot.test.ts` / iter 進捗）がバイト単位で同一。

## T-06: 役割一致 / design-only 再開 / 既存 state 互換のテストを追加する

- [x] STANDARD_DESCRIPTOR.roles が design.md D1 の表どおりであること、各 phase に creator / reviewer がちょうど 1 つであることを assert するテストを追加する。
- [x] standard 記述子での `resolveResumeStep` の戻り値が、本変更前の固定マッピング（spec/impl × critic/fixer/creator、review 枯渇 → fixer、crash → resumePoint.step、fixer-empty → paired loop）と一致することを網羅 assert するテストを追加する。
- [x] design-only 記述子の再開テストを追加する：crash → design、`--from creator` → design、`--from critic` → reviewer 不在 error。
- [x] 既存 / in-flight state の再開互換テストを追加する：`pipelineId` 欠落（在来）state を standard として解決したとき、本変更前と同一工程に解決すること（state migration 不要）。
- [x] paired fixer を持つ reviewer の fixer bypass（"あと 1 回"）と、paired fixer を持たない loop（conformance 相当）の救済なし打ち切りが保存されることを assert する（既存 TC-069 / TC-C02 等の green 維持で担保）。

**Acceptance Criteria**:
- design-only で再開が正しい工程に解決するテストが green。
- pipelineId 欠落 state の再開ルーティングが不変であるテストが green。
- 役割割り当てが現行ハードコードと一致することがテストで担保されている。

## T-07: 検証ゲート

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。
- [x] `tests/unit/architecture/core-invariants.test.ts` と `tests/grep-no-step-name-hardcode.test.ts` が green（新たな禁止 import / I/O / step 名 hardcode を増やしていない）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 受け入れ基準（request.md）の全項目が満たされている。
