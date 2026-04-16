# Phase 2: GitHub OAuth 認証とアプリケーション基盤

## Meta

- **type**: new-feature
- **date**: 2026-04-16
- **author**: color4pen
- **depends-on**: requests/active/2026-04-16-phase1-managed-agents-poc

## 影響チェック

- **spec**: yes — Phase 1 のチャットUIから画面構成が変わる。認証なしでアクセスできなくなる
- **security**: yes — GitHub OAuth 認証基盤の新規導入
- **data-model**: yes — SQLite + Drizzle ORM によるデータベースの新規導入（users, user_sessions テーブル）
- **public-api**: yes — 認証が必要になることで既存の Server Actions・SSE エンドポイントのアクセス制御が変わる

## 背景

Phase 1 PoC で Managed Agents SDK の技術的実現可能性を確認した。しかし現状は認証なし・DB なし・単一ユーザー前提のため、デプロイや他者利用ができない。

SpecRunner の最終形は「request.md を投げたら PR が出てくる」Web アプリだが、その土台となる認証・データ管理・画面構成が未整備。GitHub OAuth を導入すれば、ログインとリポアクセストークンの取得を一石二鳥で実現できる。

データベースは SQLite + Drizzle ORM でローカル開発を開始し、将来の PostgreSQL 移行はドライバ差し替えで対応する（ADR-20260416-sqlite-local-first）。

## 目的

SpecRunner を「認証されたユーザーが、自分の GitHub リポジトリに対してワークフローを実行できる」アプリの形にする。Phase 1 のデバッグ用ダッシュボードから、ユーザー向けの画面構成に移行する。

## 要件

1. **GitHub OAuth 認証**
   - Auth.js（NextAuth.js）で GitHub プロバイダを使用したログイン/ログアウト
   - 未認証ユーザーはログイン画面にリダイレクト
   - OAuth で取得したトークンを保持し、GitHub API（リポ一覧取得等）に利用

2. **SQLite + Drizzle ORM 導入**
   - `users` テーブル: GitHub ID、login、avatar URL
   - `user_sessions` テーブル: User ↔ Managed Agents Session の紐付け、リポ情報、ステータスキャッシュ
   - Drizzle Kit によるマイグレーション管理

3. **画面構成の再設計**
   - ログイン画面
   - リポジトリ一覧画面（GitHub API から取得、カード or リスト表示）
   - リポ選択後のワークスペース画面（サイドバー + メインエリア）
     - サイドバー: リクエスト一覧、履歴、設定
     - メインエリア: リクエスト詳細 / 対話チャット

4. **Session 紐付け管理**
   - Session 作成時に user_sessions に記録（session_id, repo, title）
   - ユーザーごとの Session 一覧表示（DB からフィルタ、API を全走査しない）
   - Session のステータスキャッシュ更新

## 受け入れ基準

- [ ] GitHub アカウントでログイン/ログアウトができる
- [ ] 未認証状態で保護ページにアクセスするとログイン画面にリダイレクトされる
- [ ] ログイン後、自分の GitHub リポジトリ一覧が表示される
- [ ] リポジトリを選択すると、そのリポに対するワークスペース画面に遷移する
- [ ] ワークスペースから新しい Session を作成でき、user_sessions に記録される
- [ ] 自分の Session 一覧がワークスペースに表示される
- [ ] SQLite に users, user_sessions テーブルが作成され、Drizzle のマイグレーションで管理されている

## 補足

- Phase 1 のデバッグUI（Agent/Environment/Session/Chat の4タブ）は開発用として残すが、認証の背後に配置する
- Google 等の他プロバイダは導入しない。GitHub アカウントを持たないユーザーは SpecRunner の対象外
- デプロイ先は本 request のスコープ外。ローカル開発（`bun dev`）で動作すればよい
- 対話チャットは Phase 1 の SSE ストリーミングを流用する。ワークフロー自動化は後続の request で対応
