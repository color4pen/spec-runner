# Custom Tool 未登録 + Propose 画面遷移 regression 修正

## Meta

- **type**: bug-fix
- **date**: 2026-04-27
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## バグの概要

2つの独立したバグが propose セッションの正常動作を妨げている。

### Bug 1: register_branch Custom Tool が Agent に登録されていない

`register_branch` Custom Tool のハンドラ（custom-tool-handler.ts）、ツール定義（register-branch-tool.ts）、SSE の requires_action 処理（stream route.ts）は全て実装済みだが、Agent 作成時（actions.ts の createAgent）の tools 配列に `REGISTER_BRANCH_TOOL` が含まれていない。エージェントはツールの存在を知らないため呼びようがなく、branch_name が DB に保存されない。

### Bug 2: Propose 起動後にチャット画面へ自動遷移する（regression）

PR #10 で「propose 起動後にリクエスト詳細画面に留まる」修正を入れたが、PR #11 の merge でコンフリクト解消時に `connectStream()` + `setSelectedManagedSessionId()` の呼び出しが復活した（workspace-client.tsx L468-470）。結果として propose 起動後にチャット画面へ遷移してしまう。

## 再現手順

### Bug 1
1. リポジトリの request で Start Propose を実行
2. propose セッションが完了する
3. DB の requests テーブルで branch_name を確認 → null のまま
4. Change Folder ビューアで "No files found" と表示される

### Bug 2
1. リクエスト詳細画面で Start Propose を実行
2. propose ダイアログが閉じた後、チャット画面に自動遷移する
3. リクエスト詳細画面に戻れない（Back ボタンが必要）

## 期待される動作

### Bug 1
- propose セッションが `register_branch` Custom Tool を呼び、spec-runner が branch_name を DB に保存する
- Change Folder ビューアが正しいブランチのファイルを表示する
- GitHub 差分 URL が表示される

### Bug 2
- propose 起動後にリクエスト詳細画面に留まる
- セッションの進行状況はセッション一覧で確認できる

## 実際の動作

### Bug 1
- エージェントは register_branch を呼ばない（ツールの存在を知らない）
- branch_name は null のまま
- Change Folder ビューアは fallback のアプリ側 slug 計算を使うが、日本語タイトルの場合に空になる

### Bug 2
- チャット画面に自動遷移し、リクエスト詳細画面から離脱する

## 影響範囲

- propose セッションのワークフロー全体
- ブランチ追跡機能（差分 URL、Change Folder ビューア）
- UI の導線

## 受け入れ基準

- [ ] Agent 作成時に `REGISTER_BRANCH_TOOL` が tools 配列に含まれる
- [ ] propose セッションでエージェントが `register_branch` を呼び、SSE の requires_action → user.custom_tool_result のフローが動作する
- [ ] branch_name が DB に保存される
- [ ] propose 起動後にリクエスト詳細画面に留まる（チャット画面に遷移しない）
- [ ] 既存テストが通る

## 補足

- Bug 2 の修正は workspace-client.tsx L468-470 の `connectStream()` + `setSelectedManagedSessionId()` を削除するだけ（既に main worktree で修正済みだがコミットされていない）
- Bug 1 の修正は actions.ts の `createAgent` の tools 配列に `REGISTER_BRANCH_TOOL` を追加する
- SSE の requires_action ハンドリング自体は PR #11 で実装済み、テスト済み
