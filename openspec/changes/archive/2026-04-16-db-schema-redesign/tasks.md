## 1. スキーマ定義

- [x] 1.1 `src/lib/db/schema.ts` に `repositories` テーブル定義を追加（id, user_id FK, owner, name, full_name, default_branch, created_at）。`user_id + full_name` のユニーク制約、users への CASCADE DELETE を設定
- [x] 1.2 `src/lib/db/schema.ts` に `requests` テーブル定義を追加（id, repository_id FK, type, status DEFAULT 'draft', title, content, created_at, updated_at）。repositories への CASCADE DELETE を設定。`type` に CHECK 制約 (`new-feature`, `spec-change`, `refactoring`, `bugfix`)、`status` に CHECK 制約 (`draft`, `in-progress`, `reviewing`, `completed`, `cancelled`) を追加
- [x] 1.3 `src/lib/db/schema.ts` に `sessions` テーブル定義を追加（id, request_id FK, managed_session_id, role, step, status DEFAULT 'active', title, created_at, updated_at）。requests への CASCADE DELETE を設定。`role` に CHECK 制約 (`implementer`, `reviewer`, `fixer`, `explorer`)、`status` に CHECK 制約 (`active`, `waiting`, `completed`, `archived`) を追加
- [x] 1.4 `src/lib/db/schema.ts` から `userSessions` テーブル定義と関連する型エクスポート（UserSession, NewUserSession）を削除
- [x] 1.5 新テーブルの TypeScript 型を export する（Repository, NewRepository, Request, NewRequest, Session, NewSession）

## 2. マイグレーション

- [x] 2.1 `bunx drizzle-kit generate` でマイグレーション SQL を生成
- [x] 2.2 生成されたマイグレーション SQL に `user_sessions` → `repositories` + `requests` + `sessions` のデータ移行ロジックを追加（INSERT ... SELECT でユニーク repo ごとに repositories 作成、各 user_session から request + session を作成）。ステータスマッピング: user_sessions.status `idle`/`active` → sessions.status `active` + requests.status `in-progress`、user_sessions.status `archived` → sessions.status `archived` + requests.status `completed`
- [x] 2.3 マイグレーションの冪等性を確認（IF NOT EXISTS / INSERT OR IGNORE を使用）
- [x] 2.4 `bunx drizzle-kit migrate` でマイグレーション適用を確認

## 3. Server Actions — リポジトリ操作

- [x] 3.1 `src/lib/repository-actions.ts` を新設。`getOrCreateRepository(owner, name)` 関数を実装（ワークスペースアクセス時に GitHub API でユーザーのアクセス権を検証してからリポジトリを UPSERT。`getAuthenticatedUser()` で認証ユーザー ID と OAuth トークンを取得。GitHub API が 404/403 を返した場合は "Repository not found or not accessible" エラーで拒否）
- [x] 3.2 `findRepositoryByFullName(userId, fullName)` ルックアップ関数を実装
- [x] 3.3 `listUserRepositories({ limit?: number, offset?: number })` 関数を実装（リクエスト件数の集計を含む、デフォルト limit=50, offset=0）

## 4. Server Actions — リクエスト操作

- [x] 4.1 `src/lib/request-actions.ts` を新設。`verifyRequestOwnership(requestId)` 関数を実装（requests → repositories → users のチェーン検証）
- [x] 4.2 `createRequest(repositoryId, type, title, content)` 関数を実装（type バリデーション、リポジトリ所有権検証を含む）
- [x] 4.3 `listRequests(repositoryId, { limit?: number, offset?: number })` 関数を実装（リポジトリ所有権検証、created_at DESC でソート、デフォルト limit=50, offset=0）
- [x] 4.4 `getRequestDetail(requestId)` 関数を実装（所有権検証、関連セッション一覧を含む）
- [x] 4.5 `updateRequestStatus(requestId, status)` 関数を実装（status バリデーション（許容遷移: draft→in-progress|cancelled, in-progress→reviewing|cancelled, reviewing→completed|in-progress, completed/cancelled は terminal）、所有権検証、`updated_at` を `new Date().toISOString()` で明示更新）

## 5. Server Actions — セッション操作の更新

- [x] 5.1 `src/lib/session-actions.ts` の `verifySessionOwnership` を `verifySessionAccess` にリネームし、sessions → requests → repositories → users のチェーン検証に変更
- [x] 5.2 `createBoundSession` をリクエストコンテキストベースに変更（引数に requestId, role を追加。repo は request の repository から取得。ロールバック処理を維持）
- [x] 5.3 `listUserSessions` を `listSessionsByRequest(requestId, { limit?: number, offset?: number })` に変更（リクエスト所有権検証を含む、デフォルト limit=50, offset=0）
- [x] 5.4 `refreshSessionStatus` を新スキーマ対応に更新（sessions テーブル参照、セッションアクセス検証）
- [x] 5.5 `archiveBoundSession` を新スキーマ対応に更新（sessions テーブル参照、セッションアクセス検証）
- [x] 5.6 `UserSessionSummary` 型を新しい `SessionSummary` 型に置き換え（role, step, managed_session_id を含む）

## 6. 既存コードのスキーマ参照更新

- [x] 6.1 `src/app/api/stream/route.ts` の所有権検証を `verifySessionAccess` に更新
- [x] 6.2 `src/app/actions.ts` の Server Actions でセッション関連の参照を新スキーマに更新
- [x] 6.3 `userSessions` をインポートしている全ファイルを検索し、新テーブル参照に更新

## 7. UI — ワークスペースのリクエスト一覧

- [x] 7.1 ワークスペースページ（`/repos/{owner}/{repo}`）のサイドバーコンポーネントをリクエスト一覧に変更（type バッジ、status インジケーター表示）
- [x] 7.2 「New Request」ボタンとリクエスト作成フォーム（type ドロップダウン、title テキスト、content テキストエリア）を実装
- [x] 7.3 サイドバーのリクエスト選択時にメインエリアにリクエスト詳細を表示（title, type, status, content, 関連セッション一覧）

## 8. UI — リクエスト詳細とセッション操作

- [x] 8.1 リクエスト詳細ビュー内のセッション一覧コンポーネント（role, step, status 表示）を実装
- [x] 8.2 リクエスト詳細からのセッション作成機能（role 選択付き）を実装
- [x] 8.3 セッション選択時のチャットインターフェース表示を維持（SSE ストリーミング接続はリクエストコンテキストを通じて managed_session_id を取得）
- [x] 8.4 未選択状態のデフォルト表示（「リクエストを作成するか、既存のリクエストを選択してください」）を実装

## 9. テストと検証

- [x] 9.1 既存テストを新スキーマに対応させて全件パスを確認
- [x] 9.2 所有権検証のテスト追加（リクエスト所有権、セッションアクセスのチェーン検証）
- [x] 9.3 マイグレーションの冪等性テスト（2回実行しても重複なし）
- [x] 9.4 TypeScript 型チェック、ESLint パス確認（`any` 型、未使用変数なし）

## 10. クリーンアップ

- [x] 10.1 `user_sessions` テーブルの Drizzle スキーマ定義と関連する型を完全に削除（タスク 1.4 の最終確認）
- [x] 10.2 旧 `UserSessionSummary` 型を参照している箇所を全て `SessionSummary` / request 系の型に置き換え
- [x] 10.3 不要になったインポート文・未使用変数を削除し、lint を通す
