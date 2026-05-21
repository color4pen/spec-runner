# Tasks: managed-command-extraction

## Phase 1: Config schema 変更（土台）

### Task 1.1: `AnthropicConfig` 削除と型更新

**Files**: `src/config/schema.ts`

1. `AnthropicConfig` interface（L47-49）を削除する
2. `SpecRunnerConfig` から `anthropic: AnthropicConfig`（L102）を削除する
3. `RawConfig` から `anthropic?: Partial<AnthropicConfig>`（L142）を削除する
4. D7 コメント（L95）を `D7 (design.md): runtime field added to config. Default "local".` に書き換える
5. L92 のドキュメントコメント `(default)` を managed → local に修正する

**検証**: `bun run typecheck` で型エラーの箇所を洗い出す（後続タスクで修正するため、このタスク単体では型エラーが残る想定）

- [x] 完了

### Task 1.2: `validateConfig` から anthropic 必須チェックを削除

**Files**: `src/config/schema.ts`

1. L192-203（`isLocalRuntime` 判定と `anthropic.apiKey` 必須チェック）を削除する
2. L336 の `isManagedRuntime` 判定を変更: `const isManagedRuntime = runtime === "managed";`（`runtime === undefined` を managed 扱いしない）

- [x] 完了

### Task 1.3: `checkConfigComplete` から managed 専用チェックを削除

**Files**: `src/config/schema.ts`

1. L360 の `isLocal` 判定と L362-373 の managed 専用ブロック（apiKey / agents.design.agentId / environment.id チェック）を全て削除する
2. `github.accessToken` チェック（L376-378）のみ残す
3. 関数のドキュメントコメントを更新: managed 専用チェックは `checkRuntimePrereqs` に移譲した旨を記載する

- [x] 完了

### Task 1.4: runtime デフォルト反転（migrate.ts）

**Files**: `src/config/migrate.ts`

1. L112-113 を変更: `rawConfig.runtime === "local" ? "local" : "managed"` → `rawConfig.runtime === "managed" ? "managed" : "local"`
2. L100 のコメント `TC-032: If runtime field is absent, default to "managed"` → `default to "local"` に更新
3. L110 のコメント `normalize missing runtime field to "managed"` → `to "local"` に更新
4. L117-118 の `anthropic` フィールド構築を削除する（`const anthropic: ...` 行と `?? { apiKey: "" }` 行）
5. L125 の `anthropic,` を canonical object から削除する

- [x] 完了

### Task 1.5: `configIncompleteError` の更新

**Files**: `src/errors.ts`

1. `RUNTIME_PREREQ_MISSING` を `ERROR_CODES` に追加する（L52 付近）
2. `configIncompleteError` のヒント文字列を `"Run 'specrunner login' first."` に特化する（managed 専用の `"Run 'specrunner init' first."` は不要になったため）
3. `configMissingError` のヒント `"Run 'specrunner init' first."` は維持する

- [x] 完了

## Phase 2: `init` 責務縮小

### Task 2.1: `init` を config 雛形生成のみに書き換え

**Files**: `src/cli/init.ts`

1. `runInit` 関数を書き換える:
   - `options` パラメータから `apiKey` を削除する
   - `options.runtime` が渡された場合はエラーで停止する:
     - `--runtime managed` → `"init no longer sets up managed runtime. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'."`
     - `--runtime local` → `"--runtime flag is no longer needed. 'init' generates a local-default config scaffold."`
   - managed パスの処理（L42-168）を全て削除する
   - `runInitLocal` の内容を `runInit` 本体に統合する（runtime フラグなしで常に local-default の雛形を生成）
   - config に `runtime` を明示的に書き込まない（未指定 = local default）
   - `anthropic` フィールドを一切書き込まない
2. `runInitLocal` private 関数を削除する
3. `createNewEnvironment` private 関数を削除する（`managed.ts` に移管）
4. 不要な import を削除する: `createAnthropicClient`, `createEnvironment`, `retrieveEnvironment`, `AgentRegistry`, `AgentSyncer`, `AnthropicClientAdapter`, 各 Step クラス

- [x] 完了

### Task 2.2: `command-registry.ts` の init フラグ更新

**Files**: `src/cli/command-registry.ts`

1. `init` コマンド定義（L106-117）から `"api-key"` フラグを削除する
2. `runtime` フラグは残す（受け取った場合にエラーを返すため）— ただしハンドラで `runtime` を `runInit` に渡す
3. ハンドラを更新: `await runInit({ runtime })` のみ渡す

- [x] 完了

## Phase 3: `managed` 親コマンド新設

### Task 3.1: `src/cli/managed.ts` を新規作成

**Files**: `src/cli/managed.ts`（新規）

1. `runManagedSetup()` を実装する
2. `runManagedStatus()` を実装する
3. `runManagedReset(opts: { force: boolean })` を実装する
4. `createNewEnvironment` ヘルパを init.ts から移管する

- [x] 完了

### Task 3.2: `command-registry.ts` に managed 親コマンドを登録

**Files**: `src/cli/command-registry.ts`

1. `managed` を `ParentCommandDef` として `COMMANDS` に追加する
2. `import { runManagedSetup, runManagedStatus, runManagedReset } from "./managed.js"` を追加する

- [x] 完了

## Phase 4: API key 参照箇所の移行

### Task 4.1: `src/cli/run.ts` の apiKey 参照を env var に移行

**Files**: `src/cli/run.ts`

- [x] 完了

### Task 4.2: `src/cli/rm.ts` の apiKey 参照を env var に移行

**Files**: `src/cli/rm.ts`

- [x] 完了

### Task 4.3: `src/cli/bootstrap.ts` の apiKey 参照を env var に移行

**Files**: `src/cli/bootstrap.ts`

- [x] 完了

### Task 4.4: 残存する `config.anthropic` 参照の掃除

**Files**: grep 結果に応じて全箇所

- [x] 完了

## Phase 5: preflight の拡張

### Task 5.1: `checkRuntimePrereqs` を `src/core/preflight.ts` に追加

**Files**: `src/core/preflight.ts`

- [x] 完了

### Task 5.2: `checkRuntimePrereqs` のユニットテスト

**Files**: `tests/unit/core/preflight.test.ts`（新規 or 追記）

6 ケースを実装する（全て green）

- [x] 完了

## Phase 6: doctor check の分離

### Task 6.1: check registry を 3 配列に分離

**Files**: `src/core/doctor/checks/index.ts`

- [x] 完了

### Task 6.2: managed doctor check の更新

**Files**: 各 check ファイル

- [x] 完了

### Task 6.3: `doctor.ts` で runtime 別 check 組み立て

**Files**: `src/cli/doctor.ts`

- [x] 完了

## Phase 7: help 表示の更新

### Task 7.1: USAGE 定数の更新

**Files**: `src/cli/command-registry.ts`

- [x] 完了

## Phase 8: テスト修正

### Task 8.1: 既存テストの `config.anthropic` 参照を修正

**Files**: `tests/` 配下の全テストファイル

- [x] 完了

### Task 8.2: `managed` コマンドのテスト

**Files**: `tests/unit/cli/managed.test.ts`（新規）

- [x] 完了

## Phase 9: 型チェック + テスト green

### Task 9.1: `bun run typecheck && bun run test` の green 確認

- [x] `bun run typecheck`: 0 errors
- [x] `bun run test`: 157 files, 1867 tests, all green

## Task 依存関係

```
Phase 1 (1.1 → 1.2 → 1.3 → 1.4 → 1.5)  ← 型の土台
  ↓
Phase 2 (2.1 → 2.2)                       ← init 縮小
  ↓
Phase 3 (3.1 → 3.2)                       ← managed 新設
  ↓
Phase 4 (4.1, 4.2, 4.3 並列 → 4.4)       ← apiKey 移行
  ↓
Phase 5 (5.1 → 5.2)                       ← preflight 拡張
  ↓
Phase 6 (6.1 → 6.2 → 6.3)                ← doctor 分離
  ↓
Phase 7 (7.1)                              ← help 更新
  ↓
Phase 8 (8.1, 8.2 並列)                   ← テスト修正
  ↓
Phase 9 (9.1)                              ← 最終 green 確認
```
