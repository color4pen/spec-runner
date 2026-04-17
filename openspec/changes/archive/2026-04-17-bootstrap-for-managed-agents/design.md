## Context

SpecRunner は Phase 2 で GitHub OAuth 認証、マネージドエージェントセッション管理、リクエスト中心モデル（repositories -> requests -> sessions）を実装済み。現在 `/repos` ページは GitHub API から全リポジトリを取得して一覧表示し、ワークスペースアクセス時に自動登録する方式。

openspec-workflow の bootstrap は CLI 環境前提（`.claude/hooks/` 等）であり、マネージドエージェント環境では hooks パイプラインが使えない。Custom Tools もエージェントが自発的に呼ぶ仕組みで hooks の代替にはならない（調査済み）。

リポジトリが openspec-workflow に対応済みかどうかを区別し、未整備なら自動セットアップする仕組みが必要。

## Goals / Non-Goals

**Goals:**
- ユーザーが明示的にリポジトリを登録し、登録済みリポのみを管理対象とする
- リポジトリの bootstrap 状態を追跡し、UI に可視化する
- マネージドエージェントの自走セッションで bootstrap を完全自動実行する
- bootstrap PR の merge/close を検知し、リポ状態を自動更新する
- `ready` 状態でないリポのワークフロー実行を制御する

**Non-Goals:**
- CLI 向け bootstrap の Step 5（hooks 設定）/ Step 6（.gitignore に observations.jsonl 追加）のマネージドエージェント移植
- 観察ログの代替（イベントストリーム記録等）— 将来フェーズ
- 既存の `listUserRepos()`（GitHub API 全リポ取得）の完全削除 — 検索 UI のバックエンドとして GitHub Search API を使うため残存可能
- リポジトリの削除（登録解除）機能 — この変更のスコープ外
- Agent / Environment の自動作成 — 既存の手動作成フローを前提とする

## Decisions

### D1: リポジトリ登録フロー

**決定**: GitHub Search API (`GET /search/repositories`) でリポジトリを検索し、選択して登録する方式。

**理由**: 全リポ一覧表示は数百リポのユーザーには非実用的。検索ベースなら必要なリポだけを素早く登録できる。既存の `getOrCreate` パターン（ワークスペースアクセス時の自動登録）は廃止し、明示的な登録アクションに統一する。

**代替案**:
- 全リポ一覧からチェックボックス選択 → API コール数が多く、ページネーション UX が複雑
- URL 直接入力 → タイプミスのリスク、owner/name の正規化が必要

### D2: bootstrap 状態の DB 管理

**決定**: `repositories` テーブルに `bootstrap_status TEXT NOT NULL DEFAULT 'uninitialized'` と `bootstrap_pr_url TEXT` カラムを追加。

**理由**: リポジトリ固有の状態であり、repositories テーブルに属するのが自然。別テーブルにするほどの複雑さはない。

**状態遷移**:
```
uninitialized --[bootstrap開始]--> bootstrapping --[PR作成完了]--> pr_pending
pr_pending --[PR merged]--> ready
pr_pending --[PR closed]--> uninitialized (再実行可能)
```

CHECK 制約: `bootstrap_status IN ('uninitialized', 'bootstrapping', 'pr_pending', 'ready')`

**遷移ルール**:
- `uninitialized -> bootstrapping`: bootstrap 開始時のみ
- `bootstrapping -> pr_pending`: セッション完了 + PR URL 保存時
- `bootstrapping -> uninitialized`: セッション失敗時（ロールバック）
- `pr_pending -> ready`: GitHub API で PR merge 検知時
- `pr_pending -> uninitialized`: GitHub API で PR close（非 merge）検知時。`bootstrap_pr_url` をクリア
- `ready`: terminal ではない（将来の re-bootstrap に備える）が、このフェーズでは ready からの遷移なし

### D3: bootstrap 自動実行アーキテクチャ

**決定**: 専用の Server Action `startBootstrap(repositoryId, agentId, environmentId)` を新設。既存の `createBoundSession` を内部的に利用するが、bootstrap 用の request レコード（type: `new-feature`, title: `Bootstrap openspec-workflow`）を自動作成し、セッション作成時に自走用の初回メッセージを `sendMessage` で送信する。`agentId` と `environmentId` はユーザーが確認ダイアログで選択する。

**フロー**:
1. ユーザーが bootstrap ボタンを押す + 確認ダイアログ OK（Agent と Environment を選択）
2. `startBootstrap(repositoryId, agentId, environmentId)` が呼ばれる
3. repositories.bootstrap_status を `bootstrapping` に更新
4. bootstrap 用の request レコードを作成（type: `new-feature`, status: `draft`）
5. request status を `draft -> in-progress` に遷移（標準の状態マシンに従う）
6. `createBoundSession` でセッション作成（role: `implementer`）
7. `sendMessage` で bootstrap 指示を送信（openspec init、ディレクトリ構造、偵察、review-standards 配置、PR 作成の指示）
8. セッション完了監視は既存の SSE ストリームで実施

**bootstrap 指示メッセージの内容**:
- `openspec init` の実行
- ディレクトリ構造の作成（openspec/specs/, openspec/changes/ 等）
- 技術スタック偵察（package.json, tsconfig.json 等の読み取り）
- 検証コマンドの検出（build, test, lint）
- review-standards.md の配置（`.claude/rules/review-standards.md`）
- hooks 関連（Step 5, 6）は省略
- 変更の commit + PR 作成（`gh pr create`）

**代替案**:
- 専用の Agent を bootstrap 用に作成 → 管理コスト増。汎用 Agent + 詳細なシステムプロンプトで十分
- WebSocket で完了通知 → SSE ストリームが既にあるため不要

### D4: PR 状態追跡の方式

**決定**: リポページアクセス時（Server Component レンダリング時）に GitHub API で PR 状態をチェックし、DB を更新するオンデマンドポーリング方式。

**理由**: Webhook は外部から SpecRunner への受信経路が必要で、ローカル開発環境では動作しない。バックグラウンドポーリングは SQLite の単一接続制約と相性が悪い。リポページアクセスがトリガーなら、ユーザーが見ているときだけ更新される自然な UX。

**実装**:
- `syncBootstrapPrStatus(repositoryId)`: GitHub API (`GET /repos/{owner}/{repo}/pulls/{number}`) で PR 状態を取得
- PR URL から PR 番号を抽出（`https://github.com/{owner}/{repo}/pull/{number}`）
- `merged_at` があれば → `ready`、`state === 'closed'` かつ `merged_at` なしなら → `uninitialized`（PR URL クリア）、`state === 'open'` なら変更なし
- リポページの Server Component で `bootstrap_status === 'pr_pending'` のとき自動呼び出し

**代替案**:
- GitHub Webhooks → ローカル開発環境で動かない。ngrok 等のトンネルが必要
- 定期ポーリング（cron） → SQLite の並行性問題、不要な API コール

### D5: ワークフロー実行制御

**決定**: `ready` 状態でないリポジトリでは、リクエスト作成ボタンとセッション作成ボタンを UI で無効化。Server Action 側でも `bootstrap_status !== 'ready'` のリポジトリへの `createRequest` を拒否する多層防御。

**理由**: UI のみの制御ではバイパス可能。Server Action でのガードが必須。

### D6: bootstrap セッション完了の検知と状態遷移

**決定**: bootstrap セッションの完了（PR 作成）は、エージェントの最終メッセージから PR URL を抽出する方式。セッションの SSE ストリームを監視し、`gh pr create` の出力から PR URL を検出したら `pr_pending` に遷移。

**実装**: ストリームイベントのテキスト内容から `https://github.com/{owner}/{repo}/pull/\d+` パターンをマッチングする。検出できなかった場合（セッション completed だが PR URL 未検出）は `uninitialized` にロールバック。

**代替案**:
- Custom Tool でコールバック → エージェント側の実装が必要で、自発的に呼ぶ保証がない
- GitHub API で最新 PR を検索 → タイミング問題、他の PR との混同リスク

## Risks / Trade-offs

### [R1] bootstrap セッションの失敗ハンドリング
**リスク**: マネージドエージェントが bootstrap 途中で失敗（タイムアウト、エラー等）した場合、`bootstrapping` 状態で stuck する可能性。
**緩和策**: セッション状態が `completed` または `archived` になったとき、PR URL 未検出なら `uninitialized` にロールバック。UI に「bootstrap 失敗。再試行してください」を表示。

### [R2] PR URL 抽出の信頼性
**リスク**: エージェントの出力テキストから PR URL を正規表現で抽出するため、出力フォーマットが変わると検出失敗する。
**緩和策**: 抽出失敗時は `bootstrapping` のまま留め、ユーザーに手動で PR URL を入力する UI を提供（フォールバック）。

### [R3] GitHub API レートリミット
**リスク**: PR 状態ポーリングが頻繁だと GitHub API のレートリミットに到達する。
**緩和策**: オンデマンドポーリング（ページアクセス時のみ）なので頻度は低い。エラー時は前回の状態を維持し、次回アクセスで再試行。

### [R4] bootstrap_status と request/session の不整合
**リスク**: bootstrap 用に作成した request/session と repositories.bootstrap_status の間で状態が不整合になる可能性。
**緩和策**: `startBootstrap` をトランザクション的に実行（bootstrap_status 更新 + request 作成 + session 作成）。部分失敗時のロールバックを実装。

### [R5] マイグレーション
**リスク**: 既存の repositories レコードに `bootstrap_status` カラムを追加する際、デフォルト値 `uninitialized` で問題ないか。
**緩和策**: 既存リポは全て未 bootstrap なので `uninitialized` がデフォルトで正しい。ALTER TABLE ADD COLUMN で対応可能。
