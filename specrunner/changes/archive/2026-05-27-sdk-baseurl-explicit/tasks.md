# Tasks: sdk-baseurl-explicit

## T-01: createAnthropicClient に baseURL を明示する

- [x] `src/adapter/managed-agent/client.ts` の `new Anthropic({...})` に `baseURL: "https://api.anthropic.com"` を追加する

**受け入れ基準**: `createAnthropicClient()` が返す client の初期化に `baseURL: "https://api.anthropic.com"` が含まれている

## T-02: createAnthropicClientAdapter に baseURL を明示する

- [x] `src/adapter/managed-agent/anthropic-client.ts` L72 の `new Anthropic({ apiKey })` を `new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" })` に変更する

**受け入れ基準**: `createAnthropicClientAdapter()` 内の SDK 初期化に `baseURL: "https://api.anthropic.com"` が含まれている

## T-03: typecheck & test green を確認する

- [x] `bun run typecheck` が pass する
- [x] `bun run test` が pass する

**受け入れ基準**: 両コマンドの exit code が 0
