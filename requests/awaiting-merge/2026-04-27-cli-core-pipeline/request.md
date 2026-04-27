# CLI Core Pipeline — specrunner run の最小実装

## Meta

- **type**: new-feature
- **date**: 2026-04-27
- **author**: color4pen
- **depends-on**: なし

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect
  - security-reviewer

## 背景

SpecRunner は AI CI/CD ランナーとして CLI ファーストに転換した（ADR-20260427-cli-first-architecture.md）。Next.js プロトタイプでの Managed Agents 接合部検証は完了し、リポジトリを CLI 用に再構成済み。

Managed Agents のセッションは Anthropic クラウドで自律実行され、`sessions.retrieve()` でステータスをポーリングして完了検知できる。propose セッションのみ Custom Tool（`register_branch`）を使うため SSE 接続が必要だが、CLI プロセスがそれを消費するためブラウザ依存はない。

## 目的

`specrunner run request.md` コマンドで propose セッションを起動し、ポーリングで完了を検知し、結果を stdout と状態ファイルに出力する。これが CLI パイプラインの最初のステップであり、後続の spec-review → implement → code-review 接続の基盤になる。

## 要件

### CLI コマンド

1. `specrunner run <request.md>` — request.md をパースし、propose セッションを起動してパイプラインを開始する
2. `specrunner init` — Anthropic Agent + Environment を作成し `~/.config/specrunner/config.json` に保存する
3. `specrunner login` — GitHub Device Flow OAuth でトークンを取得・保存する
4. `specrunner ps` — 実行中ジョブの一覧を状態ファイルから表示する

### Core パイプライン（propose ステップのみ）

5. request.md をパースして type, title, content, enabled を取得する
6. cwd の `git remote get-url origin` からリポジトリ情報（owner/name）を取得する
7. Managed Agents セッションを作成する（Agent ID + Environment ID + GitHub リポジトリマウント）
8. propose 用の system prompt テンプレートに基づいて初回メッセージを送信する
9. SSE stream を接続し、`register_branch` Custom Tool に応答する
10. セッション完了（status: idle, stop_reason: end_turn）を検知する
11. ブランチ上に change folder が生成されたことを確認する（GitHub API）

### 状態管理

12. ジョブ状態ファイルを `~/.local/share/specrunner/jobs/<id>.json` に書き込む
13. ステップ完了時に状態ファイルを更新する
14. `specrunner ps` で状態ファイルを読んで表示する

### 設定管理

15. `~/.config/specrunner/config.json` に API key, agent_id, environment_id, github_token を保存する
16. `specrunner init` で Agent と Environment を Anthropic API 経由で作成する
17. Agent 定義（system prompt, custom tools, model）は CLI のコードに持ち、init 時にリモートに同期する

### 出力

18. パイプライン進捗を stdout にリアルタイム表示する（ステップ名、経過時間、結果）
19. エラー時は明確なメッセージと推奨アクションを表示する

## 受け入れ基準

- [ ] `specrunner init` で Agent + Environment が作成され config に保存される
- [ ] `specrunner login` で GitHub トークンが取得・保存される
- [ ] `specrunner run request.md` で propose セッションが起動される
- [ ] SSE 経由で `register_branch` Custom Tool が正しく処理される
- [ ] ポーリングまたは SSE でセッション完了が検知される
- [ ] 状態ファイルにジョブ状態が記録される
- [ ] `specrunner ps` でジョブ一覧が表示される
- [ ] ブランチ上に change folder の存在が確認できる

## 補足

### 技術スタック

- Node.js + TypeScript（`bun:*` / `Bun.*` は使わない）
- @anthropic-ai/sdk ^0.91.0
- 開発時は bun で実行、本番は node 互換

### 参照

- ADR-20260427-cli-first-architecture.md — CLI ファースト決定の経緯と設計方針
- ADR-20260424-session-pipeline-design.md — 4セッション直列モデル
- docs/managed-agents/ — Managed Agents API リファレンス
- 旧 src/lib/anthropic.ts, custom-tool-handler.ts, register-branch-tool.ts — SDK パターンの参照（git log で参照可能）

### スコープ外

- spec-review / implement / code-review セッションの接続（後続 request）
- `specrunner fixup` / `specrunner merge` / `specrunner cancel`（後続 request）
- `specrunner logs -f`（SSE によるリアルタイムログ追跡）
- `specrunner stop` / `specrunner resume`
- Web ダッシュボード
- `specrunner/` ディレクトリの対象リポジトリ内設計
