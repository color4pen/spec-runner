## Phase 1: Config Schema 拡張

### Task 1: VerificationConfig 型定義の追加

- [x] `src/config/schema.ts`: `VerificationCommand` 型を定義（`string | { name?: string; run: string }`）
- [x] `src/config/schema.ts`: `VerificationConfig` interface を定義（`commands?: VerificationCommand[]`）
- [x] `src/config/schema.ts`: `SpecRunnerConfig` に `verification?: VerificationConfig` を追加
- [x] `src/config/schema.ts`: `RawConfig` にも `verification?: unknown` を追加

**Dep**: なし

### Task 2: validateConfig の verification section 対応

- [x] `src/config/schema.ts`: `validateConfig()` に `verification` section の validation を追加:
  - `verification` が object でなければ CONFIG_INVALID
  - `verification.commands` が存在する場合、array でなければ CONFIG_INVALID
  - 各 element: string (non-empty) または object (`run` が non-empty string、`name` は optional string)
  - 空配列は valid（= 全 command skip → VERIFICATION_NO_RUNNABLE_PHASES と同等）
- [x] error message に key path を含める（例: `CONFIG_INVALID: verification.commands[2].run must be a non-empty string`）

**Dep**: Task 1

## Phase 2: Verification Runner の commands 経路追加

### Task 3: command normalize 関数の実装

- [x] `src/core/verification/commands.ts` を新規作成
- [x] `normalizeCommands(raw: VerificationCommand[]): { name: string | undefined; run: string }[]` を実装
  - string → `{ name: undefined, run: string }`
  - `{ run }` → `{ name: undefined, run }`
  - `{ name, run }` → `{ name, run }`
- [x] export して runner.ts と tests から参照可能にする

**Dep**: Task 1

### Task 4: command 実行関数の実装

- [x] `src/core/verification/commands.ts`: `spawnCommand(command: string, cwd: string)` を実装
  - `sh -c <command>` で spawn（`node:child_process.spawn`）
  - stdout / stderr を collect、exit code を返す
  - 既存の `spawnScript()` と同じ signature pattern だが `sh -c` 経由
- [x] 既存の `spawnScript()` は fallback 経路で引き続き使用するため削除しない

**Dep**: なし

### Task 5: runVerification の分岐ロジック

- [x] `src/core/verification/runner.ts`: `runVerification()` の signature に config parameter を追加（optional、未指定時は fallback 経路）
  - config の読み込み: project local config から `verification.commands` を取得
  - `commands` が定義されていれば commands 経路、未定義なら既存 phase 経路
- [x] commands 経路の実装:
  - `normalizeCommands()` で正規化
  - 配列順に sequential 実行、exit code 0 → passed、non-zero → failed
  - fail-fast: 1 件失敗で残り skip
  - `PhaseResult` の `phase` field には `name` があればそれを、無ければ command 文字列を使用
- [x] verdict 判定: 既存ロジックと同じ（all skipped → failed + VERIFICATION_NO_RUNNABLE_PHASES、any failed → failed、else → passed）
- [x] verification-result.md の出力: commands 経路でも同じ format（Phase Results 表 + Phase 詳細）

**Dep**: Task 3, Task 4

### Task 6: runVerification 呼び出し元の config 伝搬

- [x] `runVerification()` の呼び出し元を特定し、project local config を渡すように修正
  - `src/core/step/verification.ts` の `VerificationStep.run()` から呼ばれている箇所
  - config は step 実行時の deps 経由で取得可能か、または cwd から project local config を直接読むか設計確認
- [x] config 取得方法の実装（project local config の `verification.commands` を `runVerification` に渡す）

**Dep**: Task 5

## Phase 3: eslint 導入 + dead code 修正

### Task 7: eslint 依存追加

- [x] `package.json` の `devDependencies` に追加:
  - `eslint@^9`
  - `typescript-eslint@^8`
  - `@typescript-eslint/parser@^8`
- [x] `bun install` で lockfile 更新

**Dep**: なし

### Task 8: eslint.config.js 作成

- [x] `eslint.config.js` を repo root に新規作成（flat config 形式）
  - base: `typescript-eslint.configs.recommended`
  - 追加 rule:
    - `@typescript-eslint/no-unused-vars`: warn（`^_` prefix で intentional ignore）
    - `@typescript-eslint/no-explicit-any`: warn
    - `@typescript-eslint/no-unused-expressions`: warn
    - `prefer-const`: warn
    - `no-unreachable`: warn
    - `no-empty`: warn
    - `no-constant-condition`: warn
  - ignores: `dist/**`, `node_modules/**`, `tests/**`, `**/*.test.ts`, `**/__tests__/**`
- [x] `package.json` の `scripts` に `"lint": "eslint ./src --max-warnings 0"` を追加

**Dep**: Task 7

### Task 9: 既存 11 件 dead code 修正

- [x] `bunx eslint ./src --fix` で auto fix 可能な範囲を一括修正
- [x] redundant eslint-disable directive を手動削除
- [x] 対象ファイル一覧（empirical 検証で確認済み）:
  - `src/cli/job-show.ts`: SpecRunnerError + ERROR_CODES 未使用 import
  - `src/cli/ps.ts`: JobStatus 未使用 import
  - `src/core/command/pipeline-run.ts`: path 未使用 import
  - `src/core/command/runner.ts`: verbose 変数未使用
  - `src/core/event/event-bus.ts`: redundant eslint-disable
  - `src/core/finish/derive-usage.ts`: readUsageFile 未使用 import
  - `src/core/finish/orchestrator.ts`: fetchPrViewWithRetry 未使用 import
  - `src/core/finish/spec-merge.ts`: reqs を const に
  - `src/prompts/design-system.ts`: changeFolderPath 未使用 import
  - `src/store/job-state-store.ts`: StepOutcome 未使用 import
- [x] `bun run lint` で 0 warnings / 0 errors を確認
- [x] `bun run typecheck && bun run test` で regression なし確認

**Dep**: Task 8

## Phase 4: Dogfood 統合

### Task 10: project local config に lint command 追加

- [x] `<repo-root>/.specrunner/config.json` に `verification` section を追加:
  ```json
  {
    "verification": {
      "commands": [
        "bun run build",
        "bun run typecheck",
        "bun run test",
        "bun run lint"
      ]
    }
  }
  ```
  - 既存 config に deep merge で追記（他の設定を壊さない）
  - `.specrunner/config.json` が存在しない場合は新規作成

**Dep**: Task 5, Task 8

## Phase 5: Tests

### Task 11: normalizeCommands の unit test

- [x] `tests/unit/verification/commands.test.ts` を新規作成
- [x] test cases:
  - string → `{ name: undefined, run: "..." }`
  - `{ run: "..." }` → `{ name: undefined, run: "..." }`
  - `{ name: "label", run: "..." }` → `{ name: "label", run: "..." }`
  - 混在配列の正規化

**Dep**: Task 3

### Task 12: commands 経路の verification runner unit test

- [x] `tests/unit/verification/runner-commands.test.ts` を新規作成（既存の verification.test.ts と分離）
- [x] test cases:
  - commands 経路で全 command passed → verdict passed
  - commands 経路で 2 番目 failed → 3 番目以降 skipped、verdict failed
  - commands 経路で name あり failure → `Step '<name>' failed` の表示
  - commands 経路で name なし failure → `Step '<command>' failed` の表示
  - commands 未定義 → 既存 phase 検出 fallback が発動する

**Dep**: Task 5

### Task 13: config validation の unit test

- [x] `tests/unit/config/schema.test.ts` に verification section の test cases を追加:
  - valid: commands 配列に string / object / mixed
  - valid: verification section なし（undefined）
  - valid: commands が空配列
  - invalid: commands が array でない
  - invalid: commands element が空文字列
  - invalid: commands element の run が空文字列
  - invalid: commands element が string でも object でもない

**Dep**: Task 2

## Phase 6: Doc 更新

### Task 14: project.md 更新

- [x] `specrunner/project.md`: verification セクションを追記
  - `verification.commands` schema の説明（string / object union 型、`sh -c` 経由実行、fail-fast）
  - 未定義時の fallback 挙動
  - config 例

**Dep**: なし

### Task 15: README.md 更新

- [x] `README.md`: troubleshooting に「lint failure が出たら `bun run lint --fix` で auto fix、残り手動修正」の 1 段落追記

**Dep**: なし

## Phase 7: Delta Spec

### Task 16: delta spec — verification-runner

- [x] `specrunner/changes/lint-mechanical-verification/specs/verification-runner/spec.md` が design と整合していることを確認

**Dep**: なし

### Task 17: delta spec — cli-config-store

- [x] `specrunner/changes/lint-mechanical-verification/specs/cli-config-store/spec.md` が design と整合していることを確認

**Dep**: なし

## Phase 8: 最終検証

### Task 18: 全体検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green (pre-existing managed.test.ts failures in worktree excluded)
- [x] `bun run lint` が 0 warnings / 0 errors
- [x] `.specrunner/config.json` の `verification.commands` で verify pipeline が正常動作することを手動確認
