# Design: sdk-baseurl-explicit

## 問題

`src/adapter/managed-agent/client.ts` の `createAnthropicClient()` と `src/adapter/managed-agent/anthropic-client.ts` の `createAnthropicClientAdapter()` で Anthropic SDK を初期化する際に `baseURL` を省略している。SDK は `ANTHROPIC_BASE_URL` env が設定されていると内部でそちらに切り替えるため、API key を任意エンドポイントに送出する経路が存在する。

## 方針

`new Anthropic({...})` の呼び出し 2 箇所に `baseURL: "https://api.anthropic.com"` を明示し、env override を構造的に無効化する。

## 変更対象

### 1. `src/adapter/managed-agent/client.ts`

L9 の `new Anthropic({...})` に `baseURL: "https://api.anthropic.com"` を追加する。

```diff
 return new Anthropic({
   apiKey,
+  baseURL: "https://api.anthropic.com",
   defaultHeaders: {
     "anthropic-beta": "managed-agents-2026-04-01",
   },
 });
```

### 2. `src/adapter/managed-agent/anthropic-client.ts`

L72 の `new Anthropic({ apiKey })` に `baseURL: "https://api.anthropic.com"` を追加する。

```diff
-const sdk = new Anthropic({ apiKey });
+const sdk = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });
```

## 設計判断

| 判断 | 理由 |
|------|------|
| ハードコードで `baseURL` を固定 | env override を構造的に無効化する目的のため、設定可能にする必要がない |
| `ANTHROPIC_BASE_URL` の存在検知・警告はしない | スコープ外。別 request (#422 agent-env-allowlist) で対応 |
| delta spec は不要 | 既存 spec の要件に影響しない。SDK 呼び出しの引数追加のみ |

## テスト影響

- 既存テストは SDK client のモックまたは統合テスト経由で動作するため、`baseURL` 追加で破壊されない
- `bun run typecheck && bun run test` の green を確認するのみ
