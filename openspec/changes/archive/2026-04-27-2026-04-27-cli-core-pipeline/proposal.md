# CLI Core Pipeline — `specrunner run` propose ステップの最小実装

## Why

SpecRunner は AI CI/CD ランナーとして CLI ファーストへ転換した（ADR-20260427-cli-first-architecture）。Next.js プロトタイプで Managed Agents 接合部の検証は完了し、リポジトリは CLI 用に再構成されている。次の必須ステップは「`specrunner run request.md` で propose セッションが起動し、完了が検知され、状態が永続化される」最小パイプラインの確立である。これが成立しないと、後続の spec-review → implement → code-review の自動接続が組み立てられない。

ランナーの設計原則は「request.md を書いた時点で人間の意思決定は完了。パイプラインは全自動で走り切る」。本変更はこの原則を CLI レベルで満たす最初のリリースである。

## What Changes

- **NEW**: `specrunner` CLI バイナリと 4 コマンド（`init` / `login` / `run` / `ps`）を実装する
- **NEW**: `specrunner run <request.md>` が request.md をパースし、cwd の git remote から repo を識別し、propose セッションを起動する
- **NEW**: ポーリング（`status: idle` + `stop_reason: end_turn`）でセッション完了を検知する。propose セッションのみ Custom Tool 用に SSE stream を併用する
- **NEW**: `register_branch` Custom Tool（冪等・last-write-wins）を Agent に静的登録し、SSE 経由で受信・応答する
- **NEW**: `~/.config/specrunner/config.json`（パーミッション 0600）に API key / agent_id / environment_id / github_token を保存する
- **NEW**: `~/.local/share/specrunner/jobs/<id>.json` に atomic 書き込みでジョブ状態（uuid v4 ID + append-only history）を保存する
- **NEW**: `specrunner init` が Agent + Environment を Anthropic API で作成・更新（冪等）し config に永続化する
- **NEW**: `specrunner login` が GitHub Device Flow OAuth でトークンを取得し config に保存する
- **NEW**: `specrunner ps` が状態ファイルを走査して実行中ジョブを表示する
- **NEW**: 多段リソース作成（Agent → Environment → Session）は失敗時に逆順 cleanup する rollback 戦略を採用する
- **NEW**: 進捗を stdout にリアルタイム表示し、エラー時は推奨アクション付きメッセージを返す

スコープ外（後続 request で扱う）: spec-review/implement/code-review セッションの接続、`fixup` / `merge` / `cancel` / `logs -f` / `stop` / `resume` コマンド、Web ダッシュボード、対象リポジトリ内 `specrunner/` 設計。

## Capabilities

### New Capabilities

- `cli-commands`: `specrunner` のサブコマンド体系（init / login / run / ps）、引数仕様、終了コード、stderr メッセージ規約
- `propose-pipeline`: `specrunner run` 内部の propose セッション起動・完了検知・状態反映ロジック
- `register-branch-tool`: Custom Tool `register_branch` のスキーマ・冪等性契約・ハンドラ結線規約
- `session-completion-detection`: ポーリングと SSE 併用での完了検知戦略、break 条件、レート/バックオフ
- `job-state-store`: `~/.local/share/specrunner/jobs/<id>.json` の schema・atomic 書き込み・履歴ログ・並列読み取り保証
- `cli-config-store`: `~/.config/specrunner/config.json` の schema・パーミッション 0600・冪等更新規約
- `agent-environment-bootstrap`: `specrunner init` が Agent + Environment を作成/同期する手続き、Custom Tool 登録、冗長作成防止
- `github-device-flow-auth`: GitHub Device Flow OAuth による token 取得、期限切れ検出、リカバリ手順
- `request-md-parser`: request.md の YAML/Markdown ハイブリッド構造から type, title, content, enabled を抽出する仕様
- `repository-identification`: cwd の `git remote get-url origin` から owner/name を解決する仕様

### Modified Capabilities

なし（既存 specs は Next.js プロトタイプのもので、CLI ファースト再構築により別レイヤーとして再定義される。既存仕様は archive 対象だが本 request では archive を行わない）。

## Impact

- **新規パッケージ構成**: `bin/specrunner.ts` と `src/{cli,core,config,state,sdk,git,parser}/` を新設する
- **依存関係**: `@anthropic-ai/sdk@^0.91.0`（既存）、Node.js 標準 API のみ（`crypto.randomUUID`, `node:fs/promises`, `node:path`, `node:os`, `node:net`, `node:https`）。`bun:*` / `Bun.*` は import しない
- **環境変数**: 既定で `XDG_CONFIG_HOME` / `XDG_DATA_HOME` を尊重。未設定時は `~/.config` / `~/.local/share` にフォールバック
- **外部 API**:
  - Anthropic Managed Agents（`client.beta.agents`, `client.beta.environments`, `client.beta.sessions`, `client.beta.sessions.events`）
  - GitHub OAuth Device Flow（`https://github.com/login/device/code`, `/login/oauth/access_token`）
  - GitHub API（リポジトリ存在確認・change folder の検証）
- **副作用ファイル**: `~/.config/specrunner/config.json`、`~/.local/share/specrunner/jobs/<id>.json` を作成する。両ディレクトリは初回起動時に mkdir -p
- **後方互換性**: 旧 Next.js 由来の specs は本変更で archive されない。CLI 動作には影響しない（並走させない設計）
- **テスト容易性**: ファイル I/O・SDK 呼び出し・OAuth フローは抽象化レイヤーを通すことでユニットテスト可能にする
- **セキュリティ**: API key / GitHub token は config の 0600 パーミッションで保護。プロセス stdout / log には出力しない
