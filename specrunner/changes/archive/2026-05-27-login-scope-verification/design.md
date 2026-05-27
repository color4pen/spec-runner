# Design: login-scope-verification

## Summary

`specrunner login` で Device Flow トークン取得後、`saveCredentials` の前に `result.scopes` を使って `repo` scope の有無を即時チェックし、不足時に warning を表示する。

## Background

現状 `runDeviceFlow()` は `{ accessToken, scopes }` を返すが、`runLogin()` は `scopes` を無視して token だけ保存している。scope 不足は後続の `specrunner run` で不明な GitHub API エラーとなり、原因特定が困難。`specrunner doctor` の `githubTokenValidCheck` が scope 検証を持つが、login 直後に即時フィードバックすべき。

## Architecture Decision

### D1: warning であり error ではない

scope 不足時は `logWarn()` で warning を表示するが、token は保存する。理由:

- token 自体は有効であり、後から GitHub 側で scope を拡張できる
- ユーザーが意図的に scope を絞っている可能性がある
- `doctor` コマンドで再検証可能

### D2: `result.scopes` の直接チェック（追加 API 呼び出しなし）

`verifyTokenScopes()` は `/user` API を叩いてレスポンスヘッダーの `X-OAuth-Scopes` を検証するが、Device Flow のレスポンスに既に `scope` フィールドが含まれている。`runDeviceFlow()` は `token.scope.split(",")` で scopes を配列化して返すため、ネットワーク呼び出し不要で検証できる。

### D3: scope fallback（GitHub が scope を返さない場合）の扱い

`github-device.ts:96` で `data.scope ?? GITHUB_SCOPE` の fallback がある。GitHub が scope を返さなかった場合、fallback により `scopes` は `["repo"]` になる。この場合 `repo` を含むため warning は出ない。これは意図した挙動:

- scope が不明な状態で warning を出すと false positive になる
- fallback ロジック自体はスコープ外（`github-device.ts` の変更禁止）

### D4: 変更箇所は `src/cli/login.ts` の `runLogin()` のみ

scope チェックロジックは `runLogin()` に直接記述する。理由:

- ロジックが `scopes.includes("repo")` の 1 行で済み、専用関数やモジュールの抽出は over-engineering
- `logWarn()` は既存の logger import で利用可能

## Affected Capabilities (delta spec)

| Capability | 変更内容 |
|---|---|
| cli-commands | `specrunner login` の通常成功フローに scope 検証 + warning 表示を追加 |

## Scope

### In scope

- `runLogin()` に scope チェック + warning 表示を追加
- `logWarn` の import 追加

### Out of scope

- `runDeviceFlow()` 内の scope fallback ロジック (`github-device.ts:96`) の変更
- `doctor` チェックの変更
- scope 不足を error にする変更
- `verifyTokenScopes()` の利用
