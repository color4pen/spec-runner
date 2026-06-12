# Tasks: code 変更後の機械検証を pr-create 前に保証する

実装順は「述語純関数（interface 確定）→ 遷移表配線 → compose 互換確認 → 述語 unit test → 遷移存在 test → E2E（mock pipeline）→ 仕上げ」。
interface（述語の署名・遷移行の形）を確定させてから振る舞いテストを書く（scenario 先・code 後）。
各タスクは原則 `bun run typecheck && bun run test` を green に保ったまま進める。change folder（`specrunner/changes/post-fixer-reverification/`）外のソース編集は実装段階でのみ行う。

## T-01: 再検証述語の純関数を追加する

- [x] `src/core/pipeline/reverification.ts` を新規作成し、純関数 2 つと定数 1 つを export する（design D4）:
  - `IMPL_CODE_MUTATOR_STEPS = [STEP_NAMES.IMPLEMENTER, STEP_NAMES.BUILD_FIXER, STEP_NAMES.CODE_FIXER] as const`。
  - `codeChangedSinceLastVerification(state: JobState): boolean` — `IMPL_CODE_MUTATOR_STEPS` の全 run の `endedAt` 最大（`mTime`）と `VERIFICATION` の全 run の `endedAt` 最大（`vTime`）を求め、`mTime > vTime`（ISO 文字列辞書順比較、いずれか不在は `""`）を返す。
  - `conformanceApprovedLatest(state: JobState): boolean` — `state.steps[CONFORMANCE]` 末尾 run の `outcome.verdict === "approved"` を返す。
- [x] I/O を持たない純関数として実装し、`reviewer-chain.ts` 等と同じ state 参照流儀（`state.steps?.[name] ?? []`）に揃える。

**Acceptance Criteria**:
- 2 関数と定数が export され typecheck green。
- 他 module への副作用・循環 import なし（`reverification.ts` は `step-names` / `schema` 型のみに依存）。

## T-02: 遷移表に再検証行を追加する（conformance approved → verification / verification passed → adr-gen）

- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` で verification 区画（`:160-162`）を design D3 のとおり更新する。`when` 付き行を fallback 行より前に置く:
  - `{ VERIFICATION, on: "passed", to: ADR_GEN, when: conformanceApprovedLatest }`（追加）
  - `{ VERIFICATION, on: "passed", to: CODE_REVIEW }`（残置）
  - `{ VERIFICATION, on: "failed", to: BUILD_FIXER }`（不変）
  - `{ VERIFICATION, on: "escalation", to: "escalate" }`（不変）
- [x] conformance 区画（`:173`）を design D2 のとおり更新する。`when` 付き行を skip 行より前に置く:
  - `{ CONFORMANCE, on: "approved", to: VERIFICATION, when: codeChangedSinceLastVerification }`（追加）
  - `{ CONFORMANCE, on: "approved", to: ADR_GEN }`（残置）
  - 既存の `needs-fix:*` / 旧 `needs-fix` 行は不変。
- [x] `reverification.ts` から `codeChangedSinceLastVerification` / `conformanceApprovedLatest` を import する。

**Acceptance Criteria**:
- `STANDARD_TRANSITIONS` に上記 2 つの `when` 付き行が存在する（unit test、T-05）。
- `find`（`pipeline.ts:295-298`）の最初一致順で、再検証行が条件成立時に優先される（`when` 行が fallback 行より前）。
- 既存の `verification passed → code-review`（no `when`）と `conformance approved → adr-gen`（no `when`）が残置されている。

## T-03: compose-reviewers の互換を確認する（変更不要の確認）

- [x] `src/core/pipeline/compose-reviewers.ts` の transition filter（`:62-68`）が verification / conformance 行を除外しないことを確認する（design D6）。除外しないため変更不要。
- [x] custom reviewer snapshot を含む合成済み descriptor の transitions に、T-02 で追加した 2 行が保持されることを確認する（テストで固定、T-05）。

**Acceptance Criteria**:
- `composeReviewerDescriptor` の出力 transitions に `conformance approved → verification`（条件付き）と `verification passed → adr-gen`（条件付き）が存在する（spec「custom reviewer 構成で再検証行が保持される」、unit test）。
- 既存 compose-reviewers テストが無変更 green。

## T-04: 述語の unit test

- [x] `src/core/pipeline/__tests__/reverification.test.ts`（または `tests/unit/core/pipeline/` 配下）を新規作成する。timestamp は異なる値を与える（endedAt 単調性、design D4）:
  - `codeChangedSinceLastVerification`: code-fixer の endedAt > verification の endedAt → true。verification の endedAt > 全 mutator → false。implementer のみ（verification 後）→ false。verification 不在で mutator あり → true。
  - `conformanceApprovedLatest`: conformance 最新 verdict が approved → true。needs-fix:code-fixer → false。conformance 未実行 → false。
- [x] code-mutator 集合に custom reviewer / regression-gate / conformance / adr-gen が含まれないこと（これらの run があっても `codeChangedSinceLastVerification` を true 化しない）を固定する。

**Acceptance Criteria**:
- 上記ケースが green（受け入れ #1 / #3 の述語部）。
- spec phase（spec-fixer 等）の run は `IMPL_CODE_MUTATOR_STEPS` に含まれず述語を動かさないことが固定される。

## T-05: 遷移存在 test と行数テストの更新

- [x] `tests/unit/pipeline/transition-when.test.ts`（または `standard-transitions.test.ts`）に以下を追加する:
  - `conformance approved → verification` 行が存在し `when` が function であること。
  - `verification passed → adr-gen` 行が存在し `when` が function であること。
  - `conformance approved → adr-gen`（no `when`）と `verification passed → code-review`（no `when`）が残置されていること。
- [x] TC-WHEN-02 の `STANDARD_TRANSITIONS.length` 期待値を現行 35 → 37 に更新する（design Risks の既知の更新点。2 行追加）。
- [x] `compose-reviewers.test.ts` に T-03 の保持確認ケースを追加する。

**Acceptance Criteria**:
- 追加した遷移存在ケースが green（受け入れ #1 / #2 の遷移部）。
- 行数テストが新値で green。
- 既存 transition-when / standard-transitions / compose-reviewers テストが（行数更新を除き）無変更 green。

## T-06: routing と収束の E2E（mock pipeline）

- [x] `tests/unit/core/pipeline/` に新規 test を作成し（`pipeline.episode-reset.test.ts` の mock executor / `appendStepResult` harness 流儀を流用）、以下を固定する。executor mock は step 名ごとに StepRun を append し、verification の実行回数・到達順を assert する:
  - **再検証あり経路（受け入れ #1）**: code-fixer がコードを変更（mutator run が verification より後）→ conformance approved → **verification が再実行され（2 回目）、その passed の後に adr-gen → pr-create が実行される**。verification 実行前に pr-create が実行されないことを assert。
  - **再検証 failed（受け入れ #2）**: 再検証 verification が failed → **build-fixer が実行される**（pr-create には到達しない）。build-fixer → verification → passed →（conformanceApproved）adr-gen → pr-create の回復路も固定する。
  - **clean run（受け入れ #3）**: implementer → verification(passed) → code-review(approved) → conformance(approved) で fixer が一度も走らない場合、**verification の実行回数が 1（再検証なし）**で adr-gen → pr-create へ進む。
- [x] conformance → verification 入場で verification の loop 予算が fresh から数え直され（既存 episode-reset、design D5）、入場直後に `VERIFICATION_RETRIES_EXHAUSTED` で打ち切られないことを固定する。

**Acceptance Criteria**:
- 再検証あり経路で「最後のコード変更の後に機械検証を経ずに pr-create へ到達する経路が存在しない」ことが固定される（受け入れ #1、green）。
- 再検証 failed → build-fixer 遷移が固定される（受け入れ #2、green）。
- clean run で再検証が追加実行されないことが固定される（受け入れ #3、green）。
- 既存 TC-070〜074（episode-reset）が無変更 green。

## T-07: 仕上げ（typecheck / test）

- [x] `bun run typecheck && bun run test` が green（受け入れ #4）。
- [x] 必要に応じて再検証 chokepoint の挙動を `specrunner/project.md`（pipeline 概要）に追記する（実装者判断。change folder 外編集を伴うため実装段階でのみ実施）。

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ #4）。
- 受け入れ基準 #1〜#3 に対応するテストがすべて green。
