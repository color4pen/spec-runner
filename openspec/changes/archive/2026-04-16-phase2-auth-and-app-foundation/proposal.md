## Why

Phase 1 PoC で Managed Agents SDK の技術的実現可能性は確認したが、認証なし・DB なし・単一ユーザー前提のため、デプロイや他者利用ができない。SpecRunner を「認証されたユーザーが自分の GitHub リポジトリに対してワークフローを実行できる」アプリの形にするには、認証基盤・データ管理・画面構成の整備が必要。GitHub OAuth を導入すれば、ログインとリポアクセストークンの取得を一石二鳥で実現できる。

## What Changes

- Auth.js（NextAuth.js）による GitHub OAuth 認証の導入（ログイン/ログアウト、未認証リダイレクト）
- SQLite + Drizzle ORM によるデータベース導入（users, user_sessions テーブル、Drizzle Kit マイグレーション管理）
- 画面構成の再設計: デバッグ用ダッシュボード → ユーザー向け画面（ログイン → リポ一覧 → ワークスペース）
- OAuth トークンを利用した GitHub API 連携（リポジトリ一覧取得）
- Session 紐付け管理（user_sessions による User-Session マッピング、ステータスキャッシュ）
- 既存の Server Actions・SSE エンドポイントへのアクセス制御追加

## Capabilities

### New Capabilities
- `github-oauth`: Auth.js による GitHub OAuth 認証フロー（ログイン/ログアウト、セッション管理、未認証リダイレクト）
- `database`: SQLite + Drizzle ORM によるデータベース基盤（スキーマ定義、マイグレーション、接続管理）
- `app-layout`: ユーザー向け画面構成（ログイン画面、リポ一覧画面、ワークスペース画面のレイアウトとナビゲーション）
- `session-binding`: User と Managed Agents Session の紐付け管理（作成記録、一覧取得、ステータスキャッシュ）

### Modified Capabilities
- `session-management`: 認証コンテキストの追加。Session 作成時に user_sessions への記録が必須になり、ユーザーごとのフィルタリングが追加される
- `message-streaming`: 認証チェックの追加。SSE エンドポイントへのアクセスに認証が必要になる

## Impact

- **依存関係の追加**: next-auth（Auth.js）、drizzle-orm、drizzle-kit、better-sqlite3（または bun:sqlite ドライバ）
- **環境変数の追加**: GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、NEXTAUTH_SECRET、NEXTAUTH_URL
- **ファイル構造の変更**: src/app/ 配下にルートグループ（認証・未認証）、src/lib/db/ 配下にスキーマ・マイグレーション
- **既存 API への影響**: 全 Server Actions と SSE エンドポイントに認証ガードを追加。GITHUB_TOKEN 環境変数はユーザーの OAuth トークンに置き換わる
- **Phase 1 デバッグ UI**: 認証の背後に配置して残す（削除しない）
- **データファイル**: SQLite DB ファイル（.gitignore に追加）
