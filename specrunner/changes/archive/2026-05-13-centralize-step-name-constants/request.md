# ステップ名の文字列リテラルを定数に集約する

## Meta

- **slug**: centralize-step-name-constants
- **type**: refactoring
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

ステップ名（"design", "spec-review", "implementer" 等）が文字列リテラルとして src/ 内 26 ファイル 153 箇所に散在している。propose → design のリネームで 78 ファイルに影響が出た。

GitHub Issue #219。

## 目的

ステップ名を1箇所で定義し、全ファイルが定数を参照するようにする。振る舞いは変更しない。

## 要件

1. **定数定義ファイルの作成**: `src/core/step/step-names.ts` にステップ名定数を定義する。各ステップの `name` プロパティと一致する値を持つ

   ```typescript
   export const STEP_NAMES = {
     DESIGN: "design",
     SPEC_REVIEW: "spec-review",
     SPEC_FIXER: "spec-fixer",
     TEST_CASE_GEN: "test-case-gen",
     IMPLEMENTER: "implementer",
     VERIFICATION: "verification",
     BUILD_FIXER: "build-fixer",
     CODE_REVIEW: "code-review",
     CODE_FIXER: "code-fixer",
     PR_CREATE: "pr-create",
   } as const;
   ```

2. **StepName 型の導出**: `src/state/schema.ts` の `StepName` 型を `STEP_NAMES` の値から導出する。手動の union 定義を廃止する

3. **各 step 定義の更新**: `src/core/step/*.ts` の各 step で `name: "design"` を `name: STEP_NAMES.DESIGN` に置き換える

4. **遷移テーブルの更新**: `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` で文字列リテラルを定数に置き換える

5. **全参照の更新**: 以下 26 ファイルの文字列リテラルを定数参照に置き換える:
   - src/adapter/managed-agent/agent-runner.ts
   - src/config/migrate.ts
   - src/config/schema.ts
   - src/config/step-config.ts
   - src/core/command/pipeline-run.ts
   - src/core/command/runner.ts
   - src/core/doctor/checks/agents/agents-registered.ts
   - src/core/doctor/checks/agents/definition-drift.ts
   - src/core/pipeline/pipeline.ts
   - src/core/pipeline/run.ts
   - src/core/pipeline/types.ts
   - src/core/pr-create/body-template.ts
   - src/core/resume/resolve-step.ts
   - src/core/step/executor.ts
   - src/core/step/types.ts
   - src/state/schema.ts
   - 各 step 定義ファイル（10ファイル）

6. **grep 検証**: 置き換え後、`src/` 内にステップ名の文字列リテラル（step 定義の `name:` プロパティと `step-names.ts` 自体を除く）が残っていないことを確認する

## 受け入れ基準

- [ ] `src/core/step/step-names.ts` が存在し全ステップ名を定義している
- [ ] `StepName` 型が `STEP_NAMES` から導出されている
- [ ] 各 step 定義が `STEP_NAMES.*` を参照している
- [ ] 遷移テーブルが定数を参照している
- [ ] `grep -rn '"design"\|"spec-review"\|"implementer"' src/ --include='*.ts'` で step-names.ts と step 定義の name プロパティ以外にヒットしない
- [ ] 振る舞いが変わらない
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- 本 issue は定数化のみ。pipeline が step 名で特殊分岐する設計問題（#218）は別途対応
- テストファイル内の文字列リテラルは本リクエストのスコープ外（テストは定数を import してもいいし、文字列のままでも機能する）
- `state/schema.ts` の `validateJobState` にある後方互換リマップ（`"propose"` → `"design"`）の文字列は残す（歴史的な値のため定数化不適）
