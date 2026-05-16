# Design: hardcode-github-client-id

## Summary

`src/auth/constants.ts` の `getGithubClientId()` を spec 準拠に修正する。env 未設定時に throw する現行動作を、hardcode 定数を返す動作に置き換える。

## Approach

変更は局所的で、設計判断は spec に既定済み。追加のアーキテクチャ判断は不要。

### 変更箇所

1. **`src/auth/constants.ts`** — hardcode 定数の追加 + fallback ロジック変更
2. **`src/core/doctor/checks/env/github-client-id.ts`** — warn → pass に変更
3. **`tests/core/doctor/checks/env/github-client-id.test.ts`** — テスト期待値の更新
4. **新規: `tests/auth/constants.test.ts`** — `getGithubClientId()` の 2 scenario テスト

### client_id 定数の配置

`GITHUB_CLIENT_ID` を `src/auth/constants.ts` に `export const` で定義する。関数内部でのみ参照し、外部 export は関数経由に留める（テストでは env override を使う）。

### doctor check の変更方針

env 未設定を「正常」とするため status を `pass` にし、message に「using built-in client_id」を含める。env が設定されている場合の既存 pass 動作は変更しない。

## Out of scope

- `GITHUB_CLIENT_ID_MISSING` error code 定数の削除（参照が消えるだけで残してよい）
- GHES サポート
