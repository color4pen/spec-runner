# claude の認証 token を specrunner login で管理し、cron 等 headless 環境で crontab に secrets を書かずに動くようにする

## Meta

- **type**: new-feature
- **slug**: headless-claude-credential
- **base-branch**: main
- **adr**: false

## 背景

inbox run を crontab で運用する場合、claude の認証が macOS では Keychain 保管のため cron（headless、Keychain 不可）から解決できず、ユーザーは `CLAUDE_CODE_OAUTH_TOKEN` を **crontab に平文で貼る**運用を強いられている（2026-06-13、実環境で確認）。`crontab -l` で秘匿情報が露出し、ローテーションの導線もない。

一方、GitHub token は gh CLI store / credentials.json、codex は `~/.codex/auth.json` とファイルベースの正本があり cron から解決できる。claude だけが「使う人の環境次第」になっている。spec-runner には credential の正本（`~/.config/specrunner/credentials.json`、0600、atomic write）と `specrunner login` の導線が既にあり、これを claude token に拡張すれば crontab から secrets を排除できる。

## 現状コードの前提

- `src/core/credentials/credentials-io.ts:6,14,83` — credentials.json（0600）の読み書き・権限警告・atomic write が実装済み
- `src/core/credentials/requirements.ts:7-21` — CredentialKey は `"github.token" | "anthropic.apiKey"` の宣言マトリクス（runtime 別の必要 credential を preflight / doctor / bootstrap が参照）
- `src/core/credentials/github.ts` / `anthropic.ts` — 解決チェーン（env → ... → credentials.json）の先例
- `src/adapter/claude-code/agent-runner.ts:258` — SDK へ渡す env を `stripSecrets(process.env)` で構築している。ここが注入の継ぎ目になる
- `CLAUDE_CODE_OAUTH_TOKEN` は claude-agent-sdk / Claude Code CLI 側が消費する upstream の環境変数名（外部契約。spec-runner 側の credential key 命名とは独立に、注入時はこの名前で渡す必要がある）
- claude の token は `claude setup-token` で発行できる（長期 OAuth token）

## 要件

1. `specrunner login` で claude の認証 token を credentials.json に格納できるようにする（対話入力。credential key の命名は requirements.ts の既存規約に合わせて design で決定）
2. local runtime の agent 実行時、環境変数に upstream の token が無い場合、credentials.json から解決して SDK へ渡す env に注入する（環境変数が既にあればそちらを優先 — 既存チェーンの「env が上書き」原則を維持）
3. requirements.ts の宣言マトリクスに追加し、doctor が「解決出所（env / credentials.json / 未設定）」を表示できるようにする
4. 既存の環境変数運用（crontab に貼っている現行ユーザー）を壊さない（後方互換）

## スコープ外

- codex / GitHub の credential 経路の変更（既にファイルベースで headless 動作する）
- Keychain 連携や OS 別の secret store 統合
- token の自動ローテーション

## 受け入れ基準

- [ ] login で格納した token が、env 未設定の状態で agent 実行の env に注入されることをテストで固定する
- [ ] env 設定済みの場合は env が優先されることをテストで固定する（後方互換）
- [ ] doctor が claude credential の解決出所を表示することをテストで固定する
- [ ] credentials.json の権限・atomic write の既存契約が維持されることを確認する
- [ ] `typecheck && test` が green

## 関連

- 実害: crontab への `CLAUDE_CODE_OAUTH_TOKEN` 平文記載（2026-06-13 確認）。本 request 取り込み後、crontab から env 行を撤去し token を再発行する運用が可能になる
- #672（解決出所の可視化の先例 — config effective と同型の doctor 表示）
