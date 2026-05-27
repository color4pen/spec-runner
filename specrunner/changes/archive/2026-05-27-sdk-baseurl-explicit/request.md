# Anthropic SDK の baseURL を明示して env override を防止する

## Meta

- **type**: bug-fix
- **slug**: sdk-baseurl-explicit
- **base-branch**: main
- **adr**: false

## 背景

`src/adapter/managed-agent/client.ts` の `createAnthropicClient()` で Anthropic SDK を初期化する際に `baseURL` を省略している。SDK のデフォルトは `https://api.anthropic.com` だが、`ANTHROPIC_BASE_URL` env が設定されていると SDK 内部でそちらに切り替わり、API key を任意エンドポイントに送らせる経路になりうる。

Closes #429

## 要件

1. `src/adapter/managed-agent/client.ts` の `new Anthropic({...})` に `baseURL: "https://api.anthropic.com"` を明示する
2. `src/adapter/managed-agent/anthropic-client.ts:72` の `createAnthropicClientAdapter()` 内 `new Anthropic({ apiKey })` にも同様に `baseURL` を明示する

## スコープ外

- `ANTHROPIC_BASE_URL` env の存在検知や警告
- agent-env-allowlist (#422) の env フィルタ（別 request で対応）

## 受け入れ基準

- [ ] `createAnthropicClient()` が `baseURL: "https://api.anthropic.com"` を明示する
- [ ] `createAnthropicClientAdapter()` も同様に `baseURL` を明示する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

1 行変更。env override を構造的に無効化する。
