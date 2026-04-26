## Why

現在の `generateSlug()` は日本語タイトルから非 ASCII 文字を全除去するため、日本語タイトルの request では空の slug（`2026-04-25-`）になりブランチ名が壊れる。また、エージェントが実際に使用した slug・ブランチ名をアプリが追跡する手段がなく、change folder の閲覧や差分 URL の生成で slug のずれが発生する。slug 生成をエージェントに委譲し、確定した値を Custom Tool 経由で DB に永続化することで、この問題を根本解決する。

## What Changes

- `register_branch` Custom Tool を新規定義し、エージェントがブランチ作成後に slug・ブランチ名を spec-runner に報告する仕組みを追加
- SSE ストリーミング基盤（`session-completion-handler.ts` / stream route）を拡張し、`requires_action` イベント（Custom Tool 呼び出し）をハンドリング
- `requests` テーブルに `branch_name` カラム（TEXT, nullable）と `base_branch` カラム（TEXT, nullable）を追加
- `buildProposeMessage()` から事前計算の slug・ブランチ名指示を削除し、エージェントに slug 決定を委ねる指示に変更
- propose セッションの Agent 定義に `register_branch` を Custom Tool として登録
- `getChangeFolderFiles()` / `getChangeFolderFileContent()` を DB の `branch_name` 優先で動作するよう修正
- UI に GitHub 差分 URL リンク（`compare/{base}...{branch}`）を表示（`branch_name` が DB にある場合のみ）

## Capabilities

### New Capabilities
- `custom-tool-handling`: SSE ストリーミングにおける Custom Tool（`requires_action` イベント）のハンドリング基盤。`register_branch` を最初の実装とし、将来の `submit_verdict`, `submit_artifacts` 等の共通基盤となる
- `branch-registration`: `register_branch` Custom Tool の定義、入力バリデーション、DB 永続化。エージェントが確定した slug・ブランチ名を spec-runner に報告するインターフェース

### Modified Capabilities
- `propose-session`: slug 生成をエージェントに委譲する指示変更、Custom Tool の Agent 定義への追加
- `session-completion-handling`: `requires_action` イベントのディスパッチ追加、DB の `branch_name` を使ったブランチ検証への切り替え
- `change-folder-viewer`: DB の `branch_name` 優先でファイル取得するよう修正
- `database`: `requests` テーブルに `branch_name`・`base_branch` カラムを追加

## Impact

- **DB スキーマ**: `requests` テーブルにカラム 2 本追加。マイグレーション必要
- **SSE stream route**: `requires_action` イベントのハンドリング追加。既存の `end_turn` 検知ロジックとの共存が必要
- **propose-utils.ts**: `buildProposeMessage()` のシグネチャ変更（`branchName`/`slug` パラメータ削除）。呼び出し元 `propose-actions.ts` の修正が必要
- **propose-actions.ts**: `startPropose()` から事前 slug 計算を削除、change folder 系関数を DB の `branch_name` 優先に修正
- **session-completion-handler.ts**: `handleProposeCompleted()` で DB の `branch_name` を参照するよう変更。決定的導出への依存を除去
- **Anthropic SDK**: Agent 作成時の `tools` 配列に Custom Tool 定義を追加。`type: 'custom'` の `input_schema` 定義が必要
- **UI コンポーネント**: workspace-client に差分 URL リンクを追加
