# Tasks: fixer-helpers-step-name-literal

## Task 1: ローカル定数を削除し参照を置換 [x]

- **file**: `src/core/step/fixer-helpers.ts`
- **action**:
  1. L54 `const STEP_NAMES_BUILD_FIXER = "build-fixer";` を削除する
  2. L55-56 の `opts.stepName === STEP_NAMES_BUILD_FIXER` を `opts.stepName === STEP_NAMES.BUILD_FIXER` に変更する

## Task 2: 検証 [x]

- **action**:
  1. `bun run typecheck` が pass すること
  2. `bun run test` が pass すること（既存テストのみ、新規テスト不要）
  3. `grep -rn "STEP_NAMES_BUILD_FIXER" src/` が 0 件であること
