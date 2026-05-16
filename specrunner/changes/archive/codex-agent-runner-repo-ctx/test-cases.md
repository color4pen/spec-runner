# Test Cases: StepContext.repo フィールド廃止

## Overview

`StepContext.repo` フィールドを廃止し、spec-review プロンプトの `Repository:` 行を削除する変更の検証シナリオ。  
型定義・ランタイム・テスト fixture の3層で削除が整合していることを確認する。

---

## TC-01: spec-review プロンプトに Repository 行が含まれない

- **Category**: Unit / Prompt
- **Priority**: must
- **Source**: Task 1 / Req 1 / 受け入れ基準

**GIVEN** `buildSpecReviewInitialMessage()` が呼び出される  
**WHEN** 任意の有効な入力オブジェクト（`repository` フィールドを持たない）を渡す  
**THEN** 返却された文字列に `"Repository:"` が含まれない

---

## TC-02: SpecReviewPromptInput 型に repository フィールドが存在しない

- **Category**: Static / Type
- **Priority**: must
- **Source**: Task 1 / Req 1

**GIVEN** `SpecReviewPromptInput` 型の定義  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** `repository` フィールドが型定義に存在しないためコンパイルエラーなしで通過する  
（逆に、`repository` を渡すと型エラーになる）

---

## TC-03: buildSpecReviewInitialMessage の {{REPOSITORY}} replace が削除されている

- **Category**: Unit / Prompt
- **Priority**: must
- **Source**: Task 1 / Req 1

**GIVEN** `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` の文字列  
**WHEN** テンプレート内を検索する  
**THEN** `{{REPOSITORY}}` プレースホルダーが存在しない

---

## TC-04: spec-review step が repository 引数なしで buildSpecReviewInitialMessage を呼び出せる

- **Category**: Unit / Step
- **Priority**: must
- **Source**: Task 2 / Req 2

**GIVEN** `spec-review.ts` の `buildMessage()` が呼ばれる  
**WHEN** `deps` に `repo` フィールドが存在しない状態で実行する  
**THEN** `buildSpecReviewInitialMessage()` が正常に呼ばれ、エラーが発生しない

---

## TC-05: StepContext 型に repo フィールドが存在しない

- **Category**: Static / Type
- **Priority**: must
- **Source**: Task 3 / Req 3 / 受け入れ基準

**GIVEN** `src/core/types.ts` の `StepContext` 型定義  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** `repo` プロパティが型に存在しない  
（`repo:` を含むオブジェクトリテラルを渡すと型エラーになる）

---

## TC-06: PipelineDeps 型に repo フィールドが存在しない

- **Category**: Static / Type
- **Priority**: must
- **Source**: Design D1

**GIVEN** `PipelineDeps extends StepContext` の継承関係  
**WHEN** TypeScript コンパイラが `PipelineDeps` を型チェックする  
**THEN** `repo` プロパティが `PipelineDeps` にも存在しない

---

## TC-07: claude-code runner が repo なしで stepCtx を組み立てられる

- **Category**: Unit / Runner
- **Priority**: must
- **Source**: Task 8 / Req 4

**GIVEN** `ClaudeCodeAgentRunner` が `stepCtx` オブジェクトを組み立てる処理  
**WHEN** ステップ実行が呼ばれる  
**THEN** `stepCtx` に `repo` プロパティが含まれず、型エラー・実行エラーが発生しない

---

## TC-08: codex runner が repo なしで stepCtx を組み立てられる

- **Category**: Unit / Runner
- **Priority**: must
- **Source**: Task 8 / Req 4

**GIVEN** `CodexAgentRunner` が `stepCtx` オブジェクトを組み立てる処理  
**WHEN** ステップ実行が呼ばれる  
**THEN** `stepCtx` に `repo` プロパティが含まれず、型エラー・実行エラーが発生しない

---

## TC-09: managed-agent runner が repo なしで stepCtx を組み立てられる

- **Category**: Unit / Runner
- **Priority**: must
- **Source**: Task 8 / Req 4

**GIVEN** `ManagedAgentRunner` が `stepCtx` オブジェクトを組み立てる処理  
**WHEN** ステップ実行が呼ばれる  
**THEN** `stepCtx` に `repo` プロパティが含まれず、型エラー・実行エラーが発生しない

---

## TC-10: RuntimeStrategy.buildDeps() が repo パラメータを持たない

- **Category**: Static / Type
- **Priority**: must
- **Source**: Task 4 / Design D2

**GIVEN** `RuntimeStrategy` インターフェースの `buildDeps()` シグネチャ  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** `repo` パラメータが存在しない

---

## TC-11: LocalRuntime.buildDeps() が repo なしで正常動作する

- **Category**: Unit / Runtime
- **Priority**: must
- **Source**: Task 5 / Design D2

**GIVEN** `LocalRuntime` の `buildDeps()` が呼ばれる  
**WHEN** `repo` 引数を渡さずに呼び出す  
**THEN** `PipelineDeps` オブジェクトが `repo` を含まずに返される

---

## TC-12: ManagedRuntime.buildDeps() が repo なしで正常動作する

- **Category**: Unit / Runtime
- **Priority**: must
- **Source**: Task 6 / Design D2

**GIVEN** `ManagedRuntime` の `buildDeps()` が呼ばれる  
**WHEN** `repo` 引数を渡さずに呼び出す  
**THEN** `PipelineDeps` オブジェクトが `repo` を含まずに返される

---

## TC-13: PrepareResult 型に repo フィールドが存在しない

- **Category**: Static / Type
- **Priority**: must
- **Source**: Task 7 / Design D4

**GIVEN** `CommandRunner` の `PrepareResult` interface  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** `repo` フィールドが存在しない

---

## TC-14: CommandRunner.execute() が repo なしで buildDeps を呼び出せる

- **Category**: Unit / Command
- **Priority**: must
- **Source**: Task 7 / Design D2

**GIVEN** `CommandRunner.execute()` が `buildDeps()` を呼び出す処理  
**WHEN** `prepare()` から返る `PrepareResult` に `repo` が含まれない  
**THEN** `buildDeps()` が引数なしで呼ばれ、正常に `PipelineDeps` が返される

---

## TC-15: `grep -rn "stepCtx\.repo" src/` が 0 件

- **Category**: Regression / Grep
- **Priority**: must
- **Source**: Req 7 / 受け入れ基準

**GIVEN** 変更後の `src/` ディレクトリ  
**WHEN** `grep -rn "stepCtx\.repo" src/` を実行する  
**THEN** マッチ件数が 0 件

---

## TC-16: ManagedAgentRunner の this.repo が維持されている

- **Category**: Regression / Runtime
- **Priority**: must
- **Source**: Req 5 / Design D3 / 受け入れ基準

**GIVEN** `ManagedAgentRunner` クラスの実装  
**WHEN** `this.repo` の参照箇所を確認する  
**THEN** GitHub API 呼び出し（branch verification / session creation / result fetch）で `this.repo` が引き続き使用されている

---

## TC-17: state.repository が変更後も維持されている

- **Category**: Regression / State
- **Priority**: must
- **Source**: Req 6 / Design D4 / 受け入れ基準

**GIVEN** `preflight()` が実行される  
**WHEN** `getOriginInfo()` の戻り値を `state.repository` に記録する処理が走る  
**THEN** `state.repository` に正しく `owner/name` が記録される（resume / identity 用途が維持される）

---

## TC-18: OriginInfo 型が維持されている

- **Category**: Regression / Type
- **Priority**: must
- **Source**: Req 6 / Design D7 / 受け入れ基準

**GIVEN** `src/git/remote.ts` の `OriginInfo` 型定義  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** `OriginInfo` 型が削除されておらず、`preflight` / `state` / `ManagedRuntime` から引き続き参照できる

---

## TC-19: bun run typecheck が全体で pass する

- **Category**: Build / Type
- **Priority**: must
- **Source**: Req 8 / 受け入れ基準

**GIVEN** 全ソースファイルの変更が適用された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-20: bun run test が全体で pass する

- **Category**: Build / Test
- **Priority**: must
- **Source**: Req 8 / 受け入れ基準

**GIVEN** 全テストファイルの fixture 更新が適用された状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し失敗が 0 件

---

## TC-21: spec-review の既存 unit test が pass する

- **Category**: Unit / Step
- **Priority**: must
- **Source**: Req 8

**GIVEN** `tests/core/steps/spec-review.test.ts` および `tests/spec-review-step.test.ts`  
**WHEN** fixture の `repo:` を削除した状態でテストを実行する  
**THEN** 全テストが pass する（`Repository:` 行の有無に依存するアサーションが存在しない）

---

## TC-22: spec-review-system プロンプトテストが pass する

- **Category**: Unit / Prompt
- **Priority**: must
- **Source**: Task 11

**GIVEN** `tests/prompts/spec-review-system.test.ts`  
**WHEN** `buildSpecReviewInitialMessage()` 呼び出しから `repository:` 引数を削除して実行する  
**THEN** 全テストが pass する  
かつ出力文字列に `"Repository:"` が含まれないことを確認できる

---

## TC-23: pipeline-integration test が pass する

- **Category**: Integration
- **Priority**: must
- **Source**: Req 8

**GIVEN** `tests/pipeline-integration.test.ts` の全 deps fixture から `repo: buildRepo()` を削除した状態  
**WHEN** `bun run test tests/pipeline-integration.test.ts` を実行する  
**THEN** 全テストが pass する

---

## TC-24: step unit test 群（executor / code-review 等）が pass する

- **Category**: Unit / Step
- **Priority**: must
- **Source**: Task 10

**GIVEN** `tests/unit/step/` 配下の全テストファイルから `repo:` を削除した状態  
**WHEN** `bun run test tests/unit/step/` を実行する  
**THEN** 全テストが pass する

---

## TC-25: spec-review プロンプトが Change folder / Request type 等の他要素を維持している

- **Category**: Regression / Prompt
- **Priority**: should
- **Source**: スコープ外（他要素の見直しは本 request のスコープ外）

**GIVEN** `buildSpecReviewInitialMessage()` が呼ばれる  
**WHEN** 任意の有効な入力を渡す  
**THEN** 返却された文字列に `"Change folder:"` / `"Request type:"` / `"Enabled options:"` が引き続き含まれる

---

## TC-26: ManagedRuntime の constructor が repo パラメータを維持している

- **Category**: Regression / Runtime
- **Priority**: should
- **Source**: Design D3

**GIVEN** `ManagedRuntime` の constructor シグネチャ  
**WHEN** TypeScript コンパイラが型チェックを行う  
**THEN** constructor の `repo` パラメータが削除されていない  
（`createAgentRunner()` に渡す用途で維持されている）

---

## TC-27: `deps.repo` grep が ManagedAgentRunnerDeps 系統のみにヒットする

- **Category**: Regression / Grep
- **Priority**: should
- **Source**: Req 7 / 受け入れ基準

**GIVEN** 変更後の `src/` ディレクトリ  
**WHEN** `grep -rn "deps\.repo" src/` を実行する  
**THEN** ヒットする全行が `ManagedAgentRunnerDeps.repo`（constructor 引数）系統のみであり、`StepContext.repo` への参照が含まれない

---

## TC-28: error-codes / cli-stdout-snapshot / test-case-gen-step テストが pass する

- **Category**: Unit / Regression
- **Priority**: should
- **Source**: Task 10

**GIVEN** `tests/error-codes.test.ts` / `tests/cli-stdout-snapshot.test.ts` / `tests/test-case-gen-step.test.ts` の fixture から `repo:` を削除した状態  
**WHEN** 対象テストを実行する  
**THEN** 全テストが pass する

---

## TC-29: step-execution-architecture spec.md から repo 参照が削除されている

- **Category**: Documentation / Spec
- **Priority**: should
- **Source**: Req 9

**GIVEN** `specrunner/specs/step-execution-architecture/spec.md`  
**WHEN** ファイルを参照する  
**THEN** `StepContext` 定義内の `repo: OriginInfo` 行（L319）が削除されており、L336 / L354 の `repo` 参照シナリオも更新されている

---

## TC-30: OriginInfo import が不要になったファイルから削除されている

- **Category**: Cleanup / Type
- **Priority**: could
- **Source**: Task 3 / Task 4 / Task 7 / Design D7

**GIVEN** `src/core/types.ts` / `src/core/runtime/strategy.ts` / `src/core/command/runner.ts`  
**WHEN** 各ファイルの import 文を確認する  
**THEN** `OriginInfo` への import が残存しない（不要 import が削除されている）
