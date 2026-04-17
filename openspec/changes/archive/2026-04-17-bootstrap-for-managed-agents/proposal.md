## Why

SpecRunner は現在、ユーザーの GitHub リポジトリを API 経由で無差別に一覧表示しており、openspec-workflow に対応済みかどうかの区別がない。ワークフロー実行の前提条件（openspec init、ディレクトリ構造、review-standards 等）が整っているかを判定し、未整備なら自動で整備する仕組みが必要。また、CLI 向け bootstrap は `.claude/hooks/` 等に依存しており、マネージドエージェント環境では利用できない。

## What Changes

- **リポジトリ登録モデルの変更**: GitHub API からの全リポ一覧表示を廃止し、ユーザーが明示的にリポジトリを登録する方式に変更。サイドバー（リポジトリ一覧）から GitHub リポを検索・登録する UI を提供
- **repositories テーブルへの bootstrap 状態カラム追加**: `bootstrap_status`（`uninitialized` / `bootstrapping` / `pr_pending` / `ready`）と `bootstrap_pr_url` を追加
- **bootstrap 判定ロジック**: リポジトリの `openspec/` ディレクトリ有無を GitHub API で確認し、bootstrap 済みかどうかを判定
- **bootstrap 自動実行**: マネージドエージェントセッションを自走モードで起動し、openspec init + ディレクトリ構造作成 + 技術スタック偵察 + review-standards 配置 + PR 作成までを自動実行（hooks 関連は省略）
- **リポジトリ状態遷移管理**: `uninitialized` -> `bootstrapping` -> `pr_pending` -> `ready` の状態マシンと遷移ルールの実装
- **PR 状態追跡**: bootstrap PR の URL を DB に保存し、リポページアクセス時に GitHub API でポーリングして merge/close を検知、状態を自動更新
- **ワークフロー実行制御**: `ready` 状態でないリポジトリではワークフロー実行（リクエスト作成等）を無効化

## Capabilities

### New Capabilities
- `repository-registration`: ユーザーがサイドバーから GitHub リポジトリを検索・明示的に登録する機能。GitHub API 全リポ一覧表示の廃止と登録済みリポのみの管理
- `bootstrap-execution`: マネージドエージェントセッションによる openspec-workflow bootstrap の自動実行。Environment 作成、自走セッション起動、PR 作成まで
- `bootstrap-status-tracking`: リポジトリの bootstrap 状態管理（状態遷移）と PR merge/close のポーリング検知

### Modified Capabilities
- `database`: repositories テーブルに `bootstrap_status` と `bootstrap_pr_url` カラムを追加
- `repository-binding`: 自動登録（ワークスペースアクセス時）から明示的登録（サイドバーから検索・追加）に変更。bootstrap 状態に基づくワークフロー実行制御を追加

## Impact

- **DB スキーマ**: `repositories` テーブルに 2 カラム追加（`bootstrap_status`, `bootstrap_pr_url`）。マイグレーション必要
- **UI**: `/repos` ページをリポジトリ一覧 + 登録 UI に刷新。各リポにバッジで bootstrap 状態を表示。bootstrap ボタン + 確認ダイアログの追加
- **Server Actions**: リポジトリ登録、bootstrap 起動、PR 状態ポーリングの新規アクション追加
- **既存コード**: `listUserRepos()`（GitHub API 全リポ取得）は登録済みリポ一覧に置き換え。`/repos/[owner]/[repo]/page.tsx` の自動登録ロジックへの影響
- **外部依存**: GitHub API（リポ検索、Contents API で openspec/ 確認、PR 状態取得）、Managed Agents API（Environment 作成、Session 作成）
