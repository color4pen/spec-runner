# Bootstrap for Managed Agents

**Date**: 2026-04-16
**Status**: accepted

## Context

SpecRunner は Phase 2 で GitHub OAuth 認証、マネージドエージェントセッション管理、リクエスト中心モデル（repositories -> requests -> sessions）を実装済み。一方、openspec-workflow の bootstrap スキルは CLI 環境前提（`.claude/hooks/`, `.claude/settings.json`）であり、マネージドエージェント環境では hooks パイプラインが使えない。また `/repos` ページは GitHub API から全リポジトリを無差別取得しており、openspec-workflow 対応済みかの区別がなく、ワークフロー実行の前提条件（openspec 初期化、ディレクトリ構造、review-standards 等）を判定・自動整備する仕組みが必要だった。

## Decision

リポジトリ登録機能と bootstrap 自動実行機能を新設し、マネージドエージェントの自走セッションで openspec-workflow の初期セットアップから PR 作成までを自動化する。以下の 6 つの設計判断で構成される。

1. **検索ベース登録** (D1): GitHub Search API でリポジトリを検索・選択して登録する。全リポ一覧の無差別表示を廃止
2. **DB 状態カラム** (D2): `repositories` テーブルに `bootstrap_status` / `bootstrap_pr_url` を追加し、`uninitialized -> bootstrapping -> pr_pending -> ready` の状態マシンで管理
3. **自走セッション** (D3): `startBootstrap` Server Action が bootstrap 用 request を自動作成し、`createBoundSession` + `sendMessage` で自走セッションを起動。Agent/Environment はユーザーが確認ダイアログで選択
4. **オンデマンド PR ポーリング** (D4): リポページアクセス時に GitHub API で bootstrap PR の merge/close を検知し DB を更新。Webhook 不要
5. **多層防御ゲーティング** (D5): `ready` 状態でないリポは UI 無効化 + Server Action でも `createRequest` を拒否
6. **PR URL ストリーム抽出** (D6): SSE イベントストリームのテキストから `https://github.com/{owner}/{repo}/pull/\d+` を正規表現マッチングで検出し、`pr_pending` に遷移

## Alternatives Considered

### Alternative 1: 全リポ一覧からチェックボックス選択（D1 の代替）
- **Pros**: 一覧性がある
- **Cons**: 数百リポのユーザーには非実用的。API コール数が多く、ページネーション UX が複雑
- **Why not**: 検索ベースなら必要なリポだけを素早く登録でき、スケーラビリティが高い

### Alternative 2: GitHub Webhooks で PR 状態を受信（D4 の代替）
- **Pros**: リアルタイム通知。ポーリング不要
- **Cons**: 外部から SpecRunner への受信経路が必要。ローカル開発環境では ngrok 等のトンネルが必要
- **Why not**: SQLite ローカルファーストの方針と相性が悪く、開発体験を損なう。アクセス時ポーリングで UX 上十分

### Alternative 3: Custom Tool でコールバック（D6 の代替）
- **Pros**: エージェントから明示的に完了通知を送れる
- **Cons**: Custom Tool はエージェントが自発的に呼ぶ仕組みで、呼ぶ保証がない（調査済み）
- **Why not**: ストリーム抽出のほうが確実。失敗時のフォールバック（手動 PR URL 入力）も用意

### Alternative 4: 定期バックグラウンドポーリング（D4 の代替）
- **Pros**: ユーザーアクセスに依存しない
- **Cons**: SQLite の単一接続制約と並行性問題。不要な API コール
- **Why not**: ユーザーが見ているときだけ更新される自然な UX で十分

## Consequences

### Positive
- リポジトリ登録が明示的になり、管理対象のリポのみが一覧表示される
- bootstrap の状態遷移が DB で追跡可能になり、失敗時のロールバック・再実行が確実
- マネージドエージェントの自走セッションにより、ユーザーはボタン1つで bootstrap を完了できる
- `ready` ゲーティングにより、未準備リポでのワークフロー実行を構造的に防止

### Negative
- 既存の全リポ一覧表示と自動登録（ワークスペースアクセス時の `getOrCreate`）が廃止される破壊的変更
- PR URL のストリーム抽出は正規表現ベースであり、エージェント出力フォーマットの変更に弱い
- Agent/Environment の選択を確認ダイアログに含めるため、事前に手動で作成しておく必要がある（自動作成は Non-Goal）

### Risks
- **bootstrap セッション失敗時の stuck**: セッション completed 時に PR URL 未検出なら `uninitialized` にロールバック。`handleBootstrapSessionCompletedWithoutPr` で対処
- **PR URL 抽出失敗**: 抽出失敗時はユーザーに手動 PR URL 入力 UI を提供するフォールバックを用意
- **GitHub API レートリミット**: オンデマンドポーリングのため頻度は低い。エラー時は前回状態を維持し次回アクセスで再試行
- **bootstrap_status と request/session の不整合**: `startBootstrap` をトランザクション的に実行し、部分失敗時にロールバック

### Known Design Debt
- `RepositoryWithBootstrap` への変換コードが `bootstrap-actions.ts` 内で 5 箇所以上で重複。`toRepositoryWithBootstrap()` ヘルパーへの集約が必要（review-feedback-002 Finding #3, MEDIUM/maintainability）
- `connectStream` の useCallback 依存配列に `bootstrapStatus` と `bootstrapRequestId` が含まれ、bootstrap 開始後の再レンダリングで SSE 再接続リスクがある。`useRef` での保持が推奨（review-feedback-002 Finding #2, MEDIUM/correctness）
- `archiveSessionsByRequest` が内部ヘルパー化後もデッドコードとして残存。削除または呼び出し追加が必要（review-feedback-002 Finding #1, MEDIUM/maintainability）
