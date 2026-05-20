# src/sdk/ を adapter 層に移動する

## Meta

- **type**: refactoring
- **slug**: move-sdk-to-adapter
- **base-branch**: main

## 背景

`src/sdk/client.ts` と `src/sdk/environments.ts` が `@anthropic-ai/sdk` を直接 import しているが、`src/adapter/` 層の外に配置されている。`createAnthropicClient` は `init.ts`（CLI 層）と `factory.ts`（core 層）の両方から呼ばれており、core が外部 SDK に依存する経路が存在する（architect レビュー Finding #6, MEDIUM）。

## 要件

1. `src/sdk/client.ts` を `src/adapter/managed-agent/client.ts` に移動する

2. `src/sdk/environments.ts` を `src/adapter/managed-agent/environments.ts` に移動する

3. `src/core/runtime/factory.ts` の `createAnthropicClient` 呼び出しを DI 経由に変更する。`createRuntime()` の引数でクライアントを受け取る

4. `src/cli/init.ts` の import パスを更新する

5. `src/sdk/` ディレクトリを削除する

6. 全テストファイルの import パスを更新する

## スコープ外

- factory.ts 以外の core 層コードの変更
- managed runtime の機能変更
- init の責務分離（Issue #156 で対応）

## 受け入れ基準

- [ ] `src/sdk/` ディレクトリが存在しない
- [ ] `src/core/` 配下から `@anthropic-ai/sdk` の直接 import がない
- [ ] `factory.ts` が DI 経由でクライアントを受け取っている
- [ ] 全既存テストが pass する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
