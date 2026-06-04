# Tasks: 各 step が入出力を宣言し、実行前に入力の存在を検証する

## T-01: I/O 契約の型と iteration 解決 helper を定義する

- [x] `src/core/port/step-types.ts` に `IoRef`（`{ path: string; required?: boolean; artifact?: "file" | "gitState" }`）を追加し export する。
- [x] `src/core/port/runtime-strategy.ts` に port DTO `RequiredInput`（`{ path: string; artifact: "file" | "gitState" }`）を追加し export する。
- [x] iteration 解決の pure helper を新規モジュール（例: `src/core/step/io-iteration.ts`）に追加する:
  - `nextIteration(state, stepName)` = `(state.steps?.[stepName]?.length ?? 0) + 1`（自 step writes 用）
  - `latestIteration(state, stepName)` = `state.steps?.[stepName]?.length ?? 0`（他 step reads 用）
- [x] `util/paths.ts` は変更しない（参照のみ）。

**Acceptance Criteria**:
- `IoRef` / `RequiredInput` が型として参照可能で、`bun run typecheck` が通る。
- `nextIteration` / `latestIteration` が既存 inline 算出（`getOutputTemplates` 等）と同値を返す（unit テストで確認）。
- `src/util/paths.ts` に diff が無い。

## T-02: Step 契約に reads / writes メソッドを追加する

- [x] `src/core/port/step-types.ts` の `AgentStep` / `CliStep` 共通契約に optional メソッド `reads?(state, deps): IoRef[]` と `writes?(state, deps): IoRef[]` を追加する。
- [x] 両メソッドは pure（I/O 禁止＝不変条件 B-5）であることを doc comment に明記する。
- [x] `architecture/components.md` の Step 契約記述（AgentStep / CliStep）に `reads` / `writes` を追記する（契約記述の精緻化のみ。層・DSM・不変条件は変えない）。

**Acceptance Criteria**:
- `reads` / `writes` を実装しない既存のテスト用 Step ダブルがコンパイルエラーにならない（optional）。
- `components.md` の Step セクションに `reads` / `writes` が pure メソッドとして記載される。
- `bun run typecheck` が通る。

## T-03: 全 12 step に reads / writes（正典リスト）を実装する

- [x] 各 step（design / spec-review / spec-fixer / test-case-gen / implementer / verification / build-fixer / code-review / code-fixer / conformance / adr-gen / pr-create）に `reads` / `writes` を実装する。path は `util/paths` を呼び、`{n}` は T-01 helper で解決する（design.md D5 の表に従う）。
- [x] `required` は「標準 pipeline で当該 step に到達する全経路で producer が先行実行される入力」のみ true（既定）。欠落し得る入力（adr-gen の `review-feedback-*.md` 等）は `required: false`。
- [x] source code / diff / branch への依存は `artifact: "gitState"` で宣言する。
- [x] adr-gen の `writes`（ADR 成果物）の path は **adr-gen 内の宣言にのみ**置く。design.md / tasks.md / 他 step に ADR の具体 path を書かない（プロジェクト規律）。

**Acceptance Criteria**:
- 12 step すべてが `reads` / `writes` を実装している（grep / 一覧テストで確認）。
- 各 step の宣言 path が `util/paths` 由来であり、ハードコード path 文字列を新規に増やしていない。
- `bun run typecheck` が通る。

## T-04: RuntimeStrategy に validateStepInputs seam を追加する

- [x] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に `validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>` を追加する。
- [x] `src/core/runtime/local.ts`（LocalRuntime）に実装する: `file` は `fs.access(path.join(cwd, relPath))`、`gitState` は worktree の git 有効性の最小チェック。欠落時は `SpecRunnerError("STEP_INPUT_MISSING", hint, message)` を throw（hint / message に欠落 path と producer を含める）。
- [x] `src/core/runtime/managed.ts`（ManagedRuntime）に実装する: `git fetch origin <branch>` 後に `git cat-file -e <branch-ref>:<relPath>` で git state 上の存在を検証する。欠落時は同じく `STEP_INPUT_MISSING` を throw。fetch / cat-file は stdout に出力しない。
- [x] `errors.ts` の `ERROR_CODES` に `STEP_INPUT_MISSING` を追加する。

**Acceptance Criteria**:
- local: 必須 file が worktree に存在すれば resolve、欠落すれば `STEP_INPUT_MISSING`（欠落 path を含む）で reject。
- managed: 必須 file が branch git state に存在すれば resolve、欠落すれば `STEP_INPUT_MISSING` で reject。両 runtime が同一宣言 path を対象にする。
- managed の検証経路が stdout を汚さない（snapshot で確認）。

## T-05: StepExecutor に事前検証を配線する

- [x] `runAgentStep` で `runner.run()` の前（`prepareStepArtifacts` の前後いずれか手前）に、`step.reads?.(state, deps)` を解決し `required !== false` を `RequiredInput[]` に射影して `runtimeStrategy.validateStepInputs(...)` を呼ぶ。
- [x] `runCliStep` でも `step.run()` の前に同様に呼ぶ。
- [x] 検証失敗は既存の halt と同様に記録する: `recordFailedStepResult` + `store.fail` + `attachStateAndRethrow`（state 添付）。これにより既存 fixer halt と挙動が連続する。
- [x] `runtimeStrategy` 未注入時は検証スキップ（既存の `?.` パターンを踏襲）。

**Acceptance Criteria**:
- 必須入力欠落時、agent session / CLI 本体が起動される前に `STEP_INPUT_MISSING` で停止し、failed StepRun が state に記録され、`step:error` が emit される。
- 必須入力が揃っている標準経路では検証が素通りし、step 実行順序が変わらない。
- `bun run typecheck` が通る。

## T-06: fixer 3 箇所の state 逆引き halt を宣言入力へ置換する

- [x] `code-fixer.ts`: `getLatestStepResult(state, "code-review").findingsPath` 逆引きと `CODE_FIXER_NO_REVIEW_RESULT` throw を削除。findings path を `reviewFeedbackPath(slug, latestIteration(state, "code-review"))` で導出（`reads` と同一）。継続 prompt も同 path を使う。`CODE_FIXER_NO_REVIEW_RESULT` の export / 参照を撤去。
- [x] `build-fixer.ts`: `getLatestStepResult(state, "verification")` 逆引きと `BUILD_FIXER_NO_VERIFICATION_RESULT` throw を削除。findings path を `verificationResultPath(slug)` で導出。failure section 用の `fileContent` 取得は state 経由のまま維持してよい（存在は事前検証が保証）。`BUILD_FIXER_NO_VERIFICATION_RESULT` の export / 参照を撤去。
- [x] `spec-fixer.ts`: `?? specReviewResultPath(slug, 1)` fallback を削除し、`specReviewResultPath(slug, latestIteration(state, "spec-review"))` で導出（`reads` と同一）。
- [x] `getLatestStepResult` は他用途（transition の `when` 等）で残す。

**Acceptance Criteria**:
- 3 fixer の `buildMessage` に `findingsPath` の state 逆引きが残っていない。
- 生成される prompt の findings path が、producer の `resultFilePath` と一致する（挙動不変）。
- `CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT` がコードベースから消えている。

## T-07: テスト（契約・検証・回帰）

- [x] unit: T-01 helper の値、各 step の `reads` / `writes` 解決 path が `util/paths` と一致すること（特に fixer の reads = producer の resultFilePath）。
- [x] unit: LocalRuntime / ManagedRuntime の `validateStepInputs` — 存在時 resolve、欠落時 `STEP_INPUT_MISSING`（欠落 path を含む）。
- [x] unit: executor 経由で、必須入力欠落時に agent / CLI 本体起動前に halt し failed StepRun が記録されること。
- [x] 既存テスト更新: `tests/unit/step/code-fixer.test.ts` / `tests/unit/step/build-fixer.test.ts` の旧 error code 参照を `STEP_INPUT_MISSING` 経路へ更新。
- [x] snapshot: `tests/cli-stdout-snapshot.test.ts` 等で標準 pipeline の画面出力が不変であること。

**Acceptance Criteria**:
- 新規テストが上記の振る舞いを網羅し green。
- 旧 error code を参照していたテストが新仕様に更新され green。
- stdout スナップショットに差分が無い。

## T-08: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。
- [x] `src/util/paths.ts` と既存使い手の呼び出し箇所に diff が無いことを最終確認。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 受け入れ基準（reads/writes 宣言・util/paths 不変・事前検証で halt クラス消滅・標準 pipeline 不変・両 runtime 整合）をすべて満たす。
