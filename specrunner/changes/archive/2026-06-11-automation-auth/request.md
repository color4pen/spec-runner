# 自動化文脈の GitHub トークン経路を対話ログインと分離する

## Meta

- **type**: spec-change
- **slug**: automation-auth
- **base-branch**: main
- **adr**: true

## 背景

GitHub 認証は対話ユーザー向けの device flow (`specrunner login`) を前提にしている。一方、無人で回る文脈（cron / CI / 常駐スケジューラ）は device flow を実行できず、対話セッションの keychain 上のトークンにも到達できない。自動化文脈が自前のトークンを持って動くための first-class な経路を、対話ログインとは別ドアとして定義・文書化する。

## 現状コードの前提

- `resolveGitHubToken` は github.com に対し `GH_TOKEN` env → `GITHUB_TOKEN` env → `gh auth token` subprocess → `credentials.json` の順でトークンを解決する（src/core/credentials/github.ts:42-127）。env が最優先。
- `login` は device flow の access token を `credentials.json` の `github.token` に無条件で上書き保存し、refresh token は保持しない（src/cli/login.ts:51-53）。
- `inbox run` が用いる `searchOpenIssuesByLabel` は `/repos/{owner}/{repo}/issues?labels=...` を叩き、対象 repo の issues 読み取り権限を要する（src/adapter/github/github-client.ts:582-594）。

## 外部制約（GitHub）

- GitHub App の user-to-server token (`ghu_`) は数時間で失効し、refresh なしには無人継続できない。
- classic PAT は repo 単位の粒度を持たず権限が広い。fine-grained PAT は repo + 権限単位に絞れるが最長1年で失効する。
- GitHub Actions は実行ごとに installation token (`GITHUB_TOKEN`) を注入し、スコープ付与とローテーションを自動で行う。

## 要件

1. 自動化文脈の推奨認証経路を「env var (`GH_TOKEN`) で fine-grained PAT を渡す」と定義し、対話 `login` とは別ドアとして README の Usage に文書化する。少なくとも次の3経路を提示する: 自分で叩く（`login`）/ GitHub Actions（注入される `GITHUB_TOKEN`）/ 自前サーバ・cron（`GH_TOKEN` + fine-grained PAT）。
2. `login` が、env もしくは `credentials.json` に既に置かれたトークンを黙って上書きしないようにする（上書き前に検知して確認 or 警告する）。
3. `doctor` で「現在解決されるトークンの source（env / gh / credentials）」を可視化し、対話と無人で経路が分かれている状況を診断できるようにする。

## スコープ外

- App private key を保持し installation token を specrunner 自身が発行する機構。

## 受け入れ基準

- [ ] README に対話 / GitHub Actions / 自前サーバの3経路が記載され、各々の token 種別と設定方法が示される
- [ ] env にトークンがある状態で `login` を実行しても既存トークンが無断で失われない
- [ ] `doctor` が解決トークンの source を表示する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

TBD
