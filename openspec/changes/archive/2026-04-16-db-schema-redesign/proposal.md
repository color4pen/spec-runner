## Why

現在の `user_sessions` テーブルはユーザーとセッションの直接紐付けしか表現できず、ワークフロー自動化（1リクエストに対して複数セッション：設計・実装・レビュー・修正）に対応できない。リクエスト中心モデル（`users → repositories → requests → sessions`）に再設計し、ワークフロー管理の土台を作る。

## What Changes

- **BREAKING**: `user_sessions` テーブルを廃止し、`repositories` + `requests` + `sessions` テーブルに分離
- **BREAKING**: Server Actions のインターフェースをリクエスト中心に変更（`session-actions.ts` の全関数シグネチャ変更）
- **BREAKING**: ワークスペース画面のサイドバーをセッション一覧からリクエスト一覧に変更
- `repositories` テーブル新設: ユーザーが接続したリポジトリの管理
- `requests` テーブル新設: ワークフローの単位（type, status, content, 影響チェック結果）
- `sessions` テーブル新設: リクエストに紐づく Managed Agents セッション（role: implementer/reviewer/fixer, step, status）
- 所有権検証を `user_sessions` 単位から `requests` 単位に変更（セッションアクセスはリクエスト経由で検証）
- Drizzle マイグレーションによる既存データの移行

## Capabilities

### New Capabilities
- `request-management`: リクエストの CRUD（作成・一覧・詳細・ステータス更新）と所有権検証
- `repository-binding`: ユーザーとリポジトリの紐付け管理（repositories テーブル）

### Modified Capabilities
- `database`: スキーマ再設計（user_sessions 廃止、repositories/requests/sessions 新設）、マイグレーション戦略
- `session-binding`: セッションがリクエスト経由で紐付けられる構造に変更。所有権検証の経路変更
- `session-management`: セッション作成がリクエストコンテキスト内で行われるように変更。role/step カラム追加
- `app-layout`: ワークスペースのサイドバーをセッション一覧からリクエスト一覧に変更、リクエスト詳細画面の追加

## Impact

- **データモデル**: `user_sessions` → `repositories` + `requests` + `sessions` への完全移行。外部キー構造の変更
- **Server Actions**: `session-actions.ts` の全関数を `request-actions.ts` + `session-actions.ts` に再編。引数・戻り値の型が変わる
- **UI コンポーネント**: ワークスペースのサイドバー、メインエリアのレイアウト変更。リクエスト作成フロー追加
- **認可チェック**: IDOR 対策のパスが `userSession.userId` から `request.userId`（repositories 経由）に変更
- **SSE エンドポイント**: セッション ID の取得経路がリクエスト経由に変更
- **マイグレーション**: 既存 `user_sessions` データの `requests` + `sessions` への変換が必要
