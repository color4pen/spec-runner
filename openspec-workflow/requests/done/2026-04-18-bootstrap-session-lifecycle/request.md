# Bootstrap セッションライフサイクル

## Meta

- **type**: new-feature
- **date**: 2026-04-18
- **author**: color4pen
- **depends-on**: requests/done/2026-04-17-bootstrap-for-managed-agents

## 影響チェック

- **spec**: yes — request type に bootstrap を追加、session role に bootstrap を追加、セッション完了時の処理を role ベースで分岐
- **security**: yes — Vault にユーザーの GitHub OAuth トークンを保存、GitHub API 操作のlib化
- **data-model**: yes — users テーブルに vault_id カラム追加、requests.type に bootstrap を追加
- **public-api**: yes — リポジトリステータス確認 API、セッション完了後のアプリ側 PR 作成

## 背景

PR #3 で bootstrap 機能を実装したが、実運用で以下の問題が判明した:

1. **PR 作成ができない**: マネージドエージェント環境に gh CLI がなく、GitHub REST API 用トークンもエージェント内部からアクセスできない
2. **セッション完了検知が不在**: マネージドエージェントは idle + end_turn で完了するが、検知ロジックがなかった
3. **PR #4 での応急処置が構造的に歪**: SSE route handler に bootstrap 固有のロジック（完了検知、archive、PR 作成）を直接埋め込み、title 文字列でのハードコード判定、場当たり的な break 追加など

根本原因は bootstrap を request/session のライフサイクルに乗せていないこと。bootstrap は request type であり、session role である。既存の request → session の仕組みに自然に統合すべき。

## 目的

bootstrap を request type + session role として既存のライフサイクルに統合し、Vault + GitHub API lib を基盤として整備する。

## 要件

1. **request type に bootstrap を追加**: requests テーブルの type に `bootstrap` を追加。bootstrap 用 request の作成は `startBootstrap` 内で行う
2. **session role に bootstrap を追加**: セッション作成時に `role: 'bootstrap'` を設定。完了時の処理は role で分岐する（title 文字列でのハードコード判定を廃止）
3. **Vault 管理**: ユーザーごとに Vault を作成し GitHub OAuth トークンを認証情報として登録。vault_id を users テーブルに保存して再利用。409 時は既存を削除して再登録
4. **GitHub API lib 化**: `src/lib/github-api.ts` に PR 作成・クローズ・ブランチ削除・ブランチ存在確認を集約。bootstrap-actions からの直書きを解消
5. **セッション完了ハンドラ**: SSE route はイベントを流すだけ。セッション完了（idle + end_turn）の検知後、role に基づいて完了処理を実行する汎用的な仕組み。bootstrap role の場合: セッション archive → GitHub API lib で PR 作成 → repo status 更新
6. **クライアント通知**: セッション完了後、ポーリングで状態変化を検知し、PR URL をチャットに表示。ステータス確認用 API エンドポイント
7. **キャンセル機能**: bootstrapping / pr_pending 状態からキャンセル可能。セッション archive + PR close + ブランチ削除 + status ロールバック
8. **bootstrap 指示メッセージ**: エージェントは commit + push まで。PR 作成指示を含めない。ブランチ名を指定

## 受け入れ基準

- [ ] bootstrap が request type / session role として動作する
- [ ] Vault が自動作成され GitHub MCP 認証情報が登録される
- [ ] GitHub API 操作が lib に集約されている
- [ ] SSE route に bootstrap 固有ロジックがない
- [ ] セッション完了後にアプリ側で PR が自動作成される
- [ ] PR URL がチャットに表示される
- [ ] キャンセルボタンで bootstrap を中止できる
- [ ] PR merge 後にリポ状態が ready に更新される

## 補足

- PR #4 はクローズし、この request で設計からやり直す
- execute-request のマネージドエージェント対応では、設計・実装・レビューをそれぞれ別セッション（別 role）で実行する予定。bootstrap はその最も単純なケース（1 session、1 role）
- Vault は書き込み専用。1 MCP サーバー URL あたり 1 認証情報 / Vault の制限あり
- マネージドエージェント環境に gh CLI は未インストール（検証済み）
- MCP URL は末尾スラッシュなし `https://api.githubcopilot.com/mcp`（API が正規化する）
