# git transport（fetch / push）を解決済みトークンで自己認証する

## Meta

- **type**: spec-change
- **slug**: git-transport-auth
- **base-branch**: main
- **adr**: true

## 背景

specrunner は GitHub API 用にトークンを `resolveGitHubToken` で解決するが、git transport（fetch / push）は ambient な git 認証（credential helper / keychain）に依存している。無人実行環境（cron / launchd）では keychain に到達できないため、API トークンが正しく解決できていても workspace setup の git fetch が `fatal: could not read Username for 'https://github.com'` で失敗する。git transport も解決済みトークンで自己認証させ、ambient な git 認証設定から独立させる。

## 現状コードの前提

- workspace setup の fetch は `git fetch origin` を ambient 認証で実行し、失敗時に `git fetch origin failed` を throw する（src/core/runtime/local.ts:423-426）。
- feature branch / main の push、branch 削除 push、managed runtime の fetch も素の git で実行している（src/core/archive/orchestrator.ts:240, :293、src/core/cancel/runner.ts:184、src/core/runtime/managed.ts:357）。
- `resolveGitHubToken` はトークンを解決するが（src/core/credentials/github.ts:42-127）、git transport の呼び出しにそのトークンを注入する箇所は存在しない（extraheader / GIT_ASKPASS / 認証付き remote URL いずれも無し）。

## 外部制約（GitHub / git）

- GitHub Actions は `http.extraheader` に `AUTHORIZATION: bearer <token>` を渡す方式で git transport を認証する（credential を永続化せず、ユーザーの git config も変更しない）。
- fine-grained PAT / installation token はいずれも HTTPS で `x-access-token` の basic 認証として使える。
- `git -c key=value` での per-invocation 注入はプロセス引数に一時的に現れる（永続化はされない）。

## 要件

1. specrunner が行う git transport 操作（workspace setup の fetch、feature branch の push、archive の main push、branch 削除 push、managed runtime の fetch）を、解決済み GitHub トークンで認証する。ambient な credential helper / keychain に依存しない。
2. ユーザーのグローバル git 設定（`credential.helper` 等）を変更しない。トークンを永続化しない（per-invocation の注入）。
3. トークンが remote URL や git config ファイルに平文で残らないようにする。
4. トークンが解決できない場合は従来どおり明確なエラーにする。

## スコープ外

- ユーザーの git config / credential helper の変更。
- host ↔ token のバインディング方針（既存の `resolveGitHubToken` に従う）。

## 受け入れ基準

- [ ] ambient な git 認証が無い環境（keychain 非アクセス・`credential.helper` 未設定）でも、job の fetch と push が解決済みトークンで成功する
- [ ] ユーザーの `~/.gitconfig` / `credential.helper` を変更しない
- [ ] トークンが remote URL・永続 git config・ログに平文で残らない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

TBD
