# OAuth login 直後の scope 即時検証

## Meta

- **type**: spec-change
- **slug**: login-scope-verification
- **base-branch**: main
- **adr**: false
- **issue**: #430

## 背景

`specrunner login` で GitHub Device Flow によるトークン取得後、scope の検証を行わずに credentials.json に保存している。scope 不足は後続の API 呼び出しで不明なエラーとなる。`specrunner doctor` の `githubTokenValidCheck` で検証する仕組みはあるが、login 直後に即時フィードバックすべき。

## 対象ファイル

- `src/cli/login.ts` — `runDeviceFlow()` 成功後、`saveCredentials` の前に `result.scopes`（Device Flow の戻り値に含まれる）を直接チェックする。`verifyTokenScopes()` は追加 API 呼び出しが冗長なので使わない。scope に `repo` が含まれない場合は警告を表示するが、token は保存する（scope 不足でも token 自体は有効なため、後から scope を拡張できる）

## 設計判断

- scope 不足を error ではなく warning にする。理由: token は有効であり、ユーザーが意図的に scope を絞っている可能性がある。`doctor` コマンドで再検証可能
- scope チェックは `result.scopes` を直接使うためネットワーク呼び出しが不要。Device Flow 自体が成功していれば scopes は常に取得済み

## スコープ外

- `runDeviceFlow()` 内の scope fallback ロジック (`github-device.ts:96`) の変更
- `doctor` チェックの変更

## 受け入れ基準

- login 成功後に `repo` scope の有無が検証されること
- scope 不足時に warning メッセージが表示されること
- Device Flow の scope fallback（GitHub が scope を返さない場合）でも warning なしで token が保存されること
- 既存の login フロー（正常ケース）の動作が変わらないこと
