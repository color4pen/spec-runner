## Why

spec-runner は bootstrap フロー以降の開発ワークフローの入口が未実装であり、ユーザーが Web UI から request を作成して Managed Agents の propose セッションで change folder を自動生成する導線が存在しない。4セッション直列モデル（propose / spec-review / implement / code-review）の最初のパイプラインを通すことで、設計成果物の自動生成と閲覧を実現する。

## What Changes

- Request 作成フォームに `enabled` フィールド（マルチセレクト）を追加し、ワークフローオプションを選択可能にする
- `requests` テーブルに `enabled` カラム（TEXT、JSON 配列文字列）を追加する
- `sessions` テーブルの `role` enum に `'propose'` を追加する
- `createRequest()` を拡張し、`enabled` フィールドを保存する
- Request 保存後に propose セッション（role: `'propose'`）を自動起動する Server Action `startPropose()` を追加する
- propose セッション用の Agent を作成する仕組み（system prompt に openspec-propose スキル指示を含む）
- propose セッション完了後のハンドリング（session-completion-handler への propose case 追加）
- GitHub API でブランチ上のファイル内容を取得する関数を `github-api.ts` に追加する
- 生成された change folder（proposal.md, design.md, tasks.md, specs/）を markdown 表示する閲覧ページを作成する
- ブランチ命名規則: `{prefix}/{slug}` 形式（prefix は type に基づく）

## Capabilities

### New Capabilities
- `propose-session`: request 保存後に propose セッションを起動し、openspec-propose スキルで change folder を生成してブランチに push するまでの一連のフロー
- `change-folder-viewer`: ブランチ上の change folder（proposal.md, design.md, tasks.md, specs/）を GitHub API で取得し、UI で markdown 表示する閲覧機能

### Modified Capabilities
- `request-management`: `enabled` フィールドの追加。request 作成フォームにマルチセレクトを追加し、DB スキーマと Server Action を拡張する。`createRequest()` の引数をオブジェクト形式に変更する
- `session-management`: `role` enum に `'propose'` を追加。propose セッションの作成・完了ハンドリングに対応する
- `database`: `requests` テーブルに `enabled` カラム追加、`sessions.role` CHECK 制約に `'propose'` 追加
- `session-completion-handling`: propose セッション完了時のブランチ確認・状態遷移ロジックを追加する
- `github-api-lib`: ブランチ上のファイル一覧取得とファイル内容取得の関数を追加する

## Impact

- DB マイグレーション: `requests` テーブルに `enabled` カラム追加、`sessions.role` enum に `'propose'` 追加
- `src/lib/request-actions.ts`: `createRequest()` の引数と DB insert に `enabled` 追加
- `src/lib/db/schema.ts`: スキーマ定義の変更
- `src/lib/session-completion-handler.ts`: propose case の追加
- `src/lib/github-api.ts`: ファイル取得関数の追加
- 新規ファイル: `src/lib/propose-actions.ts`（propose セッション起動ロジック）
- 新規ページ: change folder 閲覧 UI
- 既存の workspace-client.tsx: request 作成フォームに enabled フィールド追加
