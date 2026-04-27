# マネージドエージェント向け Bootstrap 機能

## Meta

- **type**: new-feature
- **date**: 2026-04-17
- **author**: color4pen
- **depends-on**: requests/active/2026-04-16-phase1-managed-agents-poc

## 影響チェック

- **spec**: yes — 既存 CLI 向け bootstrap とは別に、マネージドエージェント向け bootstrap を新設。リポジトリの登録・状態管理という新しい概念を導入
- **security**: no
- **data-model**: yes — repositories テーブルに bootstrap 状態（status）、PR URL 等のカラムを追加
- **public-api**: no

## 背景

openspec-workflow の bootstrap スキルは Claude Code CLI 環境を前提としており、`.claude/hooks/` や `.claude/settings.json` など CLI 固有の仕組みに依存している。SpecRunner はマネージドエージェント経由でワークフローを実行するため、CLI の hooks パイプラインは利用できない。

現状の SpecRunner はユーザーの GitHub リポジトリを無差別に一覧表示しており、openspec-workflow に対応済みかどうかの区別がない。ワークフロー実行の前提条件（openspec 初期化、ディレクトリ構造、review-standards 等）が整っているかを判定し、未整備なら自動で整備する仕組みが必要。

## 目的

SpecRunner にリポジトリ登録機能と bootstrap 自動実行機能を追加し、ワークフロー実行可能な状態まで自動でセットアップする。

## 要件

1. **リポジトリ登録機能**: サイドバーからリポジトリを明示的に登録する UI を提供する。GitHub 全リポの無差別表示から、登録済みリポのみの管理に変更する
2. **bootstrap 判定**: 登録されたリポジトリが openspec-workflow の bootstrap 済みかどうかを判定する（例: `openspec/` ディレクトリの有無）
3. **bootstrap 自動実行**: 未済リポに対し、ユーザーが bootstrap ボタンを押して確認ダイアログで OK すると、マネージドエージェントのセッションを自走で起動する
   - Environment 作成（OpenSpec CLI プリインストール）
   - Session 起動（事前情報のみで自走、チャット不要）
   - bootstrap 実行: openspec init、ディレクトリ構造作成、技術スタック偵察、検証コマンド検出、review-standards 配置（hooks 関連は省略）
   - PR 作成まで自動で完了
4. **リポジトリ状態管理**: 以下の状態遷移を追跡する
   - `uninitialized` → `bootstrapping` → `pr_pending`
   - `pr_pending` → merged → `ready`
   - `pr_pending` → closed → `uninitialized`（再実行可能）
5. **PR 状態追跡**: bootstrap PR の URL を DB に保存し、リポページアクセス時に GitHub API でポーリングして状態を更新する
6. **ワークフロー実行制御**: `ready` 状態でないリポジトリはワークフロー実行不可とする

## 受け入れ基準

- [ ] サイドバーからリポジトリを登録できる
- [ ] 登録済みリポの bootstrap 状態が UI に表示される
- [ ] 未 bootstrap リポで bootstrap ボタン → 確認ダイアログ → セッション自走 → PR 作成が完了する
- [ ] マネージドエージェントセッションがチャットなしで自走し、openspec init + ディレクトリ構造 + 偵察 + review-standards 配置を実行する
- [ ] bootstrap PR の merge/close が次回アクセス時に検知され、リポ状態が更新される
- [ ] `ready` でないリポではワークフロー実行ボタンが無効化される

## 補足

- CLI 向け bootstrap の 8 ステップのうち、Step 5（hooks 設定）と Step 6（.gitignore に observations.jsonl 追加）はマネージドエージェント環境では不要のため省略する
- 観察ログの代替（イベントストリーム記録等）は将来のフェーズで対応する
- review-standards の配置先は、エージェントがリポ内の既知パスから読み取れる場所とする
- Custom Tools はエージェントが自発的に呼ぶ仕組みであり、hooks の代替にはならない（調査済み）
