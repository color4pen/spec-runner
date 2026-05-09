## 1. ファイル移動

- [x] 1.1 `src/sdk/client.ts` を `src/adapter/managed-agent/client.ts` に移動（`git mv`）
- [x] 1.2 `src/sdk/environments.ts` を `src/adapter/managed-agent/environments.ts` に移動（`git mv`）

## 2. デッドコード・重複ファイルの削除

- [x] 2.1 `src/sdk/agents.ts` を削除（import 元ゼロ）
- [x] 2.2 `src/sdk/sessions.ts` を削除（`adapter/managed-agent/sdk/sessions.ts` に集約済み）
- [x] 2.3 `src/sdk/` ディレクトリを削除

## 3. factory.ts の DI 化

- [x] 3.1 `src/core/runtime/factory.ts` から `createAnthropicClient` の import を削除
- [x] 3.2 `src/core/runtime/factory.ts` から `createAnthropicSessionClient` の import を削除
- [x] 3.3 `import type { SessionClient } from "../port/session-client.js"` を追加
- [x] 3.4 `createRuntime()` に `sessionClient?: SessionClient` パラメータを追加
- [x] 3.5 managed 分岐で `sessionClient` 未指定時に `throw new Error("sessionClient is required for managed runtime")` を追加
- [x] 3.6 `ManagedRuntime` 生成を注入された `sessionClient` で行うように変更
- [x] 3.7 ファイル冒頭の Design D4 コメントを更新（「config.runtime branching」の責務が cli 層と共有される旨）

## 4. cli 層の呼び出し元を更新

- [x] 4.1 `src/cli/run.ts`: `createAnthropicClient` と `createAnthropicSessionClient` を import し、`config.runtime !== "local"` 時に `sessionClient` を構築、`createRuntime` の第5引数に渡す
- [x] 4.2 `src/cli/bootstrap.ts`: 同様に `sessionClient` を構築して `createRuntime` に渡す

## 5. cli 層の import パス更新

- [x] 5.1 `src/cli/init.ts` L1: `../sdk/client.js` → `../adapter/managed-agent/client.js`
- [x] 5.2 `src/cli/init.ts` L2: `../sdk/environments.js` → `../adapter/managed-agent/environments.js`
- [x] 5.3 `src/cli/rm.ts` L11: `../sdk/client.js` → `../adapter/managed-agent/client.js`

## 6. テストの import パス更新

- [x] 6.1 `tests/completion.test.ts` L14: `../src/sdk/sessions.js` → `../src/adapter/managed-agent/sdk/sessions.js`

## 7. 検証

- [x] 7.1 `bun run typecheck` が green
- [x] 7.2 `bun run test` が green
- [x] 7.3 `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` が 0 件
- [x] 7.4 `src/sdk/` ディレクトリが存在しない
- [x] 7.5 `grep -rE "from ['\"](\.\./)*sdk/" src/` が 0 件（sdk/ への残留 import なし）
