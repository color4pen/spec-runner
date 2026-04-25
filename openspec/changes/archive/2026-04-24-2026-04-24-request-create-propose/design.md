## Context

spec-runner は openspec-workflow の request-execute パイプラインを Managed Agents 上で自動化する Next.js Web アプリケーション。bootstrap フロー（リポジトリ初期化）は実装済みで、次のステップとして4セッション直列モデルの最初のパイプライン「request-create + propose」を実装する。

既存の実装パターン:
- Server Actions (`'use server'`) でバックエンド操作
- `createBoundSession()` + `sendMessage()` パターンでセッション起動
- `session-completion-handler.ts` で SSE 完了検知後のロジック分岐
- `github-api.ts` で GitHub REST API の pure wrapper 関数
- Drizzle ORM + SQLite でデータ永続化
- workspace-client.tsx で3ペイン構成の UI

Constraints:
- ADR-20260424 の4セッション直列モデルに準拠
- Custom Tools は Phase 1 不要。標準ツール（agent_toolset_20260401）のみ
- セッション完了検知は既存の SSE 基盤を再利用
- propose セッション完了後は PR 作成しない（bootstrap とは異なるフロー）

## Goals / Non-Goals

**Goals:**
- ユーザーが Web UI から request を作成し、propose セッションで change folder を自動生成できる
- セッション完了後にブランチ上の change folder を UI で閲覧できる
- bootstrap フローと同じ startBootstrap() パターンを流用して実装量を最小化する
- enabled フィールドで将来のワークフローオプション拡張に対応する

**Non-Goals:**
- セッション2以降（spec-review, implement, code-review）の実装
- Custom Tools（submit_artifacts 等）のサポート
- change folder の編集機能
- マルチブランチの同時管理
- ファイル差分表示やコードレビュー UI

## Decisions

### 1. startPropose() は startBootstrap() と同構造

**Decision**: `startBootstrap()` のパターン（status transition → Vault setup → request/session作成 → message送信）を `startPropose()` にも適用する。

**Rationale**:
- 実績のあるパターンで信頼性が高い
- ロールバック処理（失敗時の状態巻き戻し）が既に検証済み
- `createBoundSession()` + `sendMessage()` は汎用的に使える
- bootstrap は repository レベルの状態遷移だが、propose は request レベルの状態遷移（draft -> in-progress）で管理する

**Alternatives considered**:
- 新しいセッション起動パターンを設計: 複雑さが増すだけでメリットなし

### 2. propose セッションのブランチ命名は request 側で制御

**Decision**: ブランチ名 `{prefix}/{slug}` を Server Action 側で生成し、propose セッションへの指示メッセージに含める。

**Rationale**:
- ブランチ命名の一貫性を保証する
- セッション完了ハンドラでブランチ名の特定が容易
- prefix マッピング: `new-feature` -> `feat/`, `spec-change` -> `change/`, `refactoring` -> `refactor/`, `bugfix` -> `fix/`

### 3. enabled フィールドは TEXT（JSON 配列文字列）で保存

**Decision**: `enabled` カラムを TEXT 型で追加し、`["test-case-generator","adr"]` のような JSON 配列文字列として保存する。

**Rationale**:
- SQLite には配列型がない
- JSON 文字列なら既存の Drizzle パターンに馴染む
- enabled 値のバリデーションは Server Action 層で行う
- 検索クエリで enabled の中身を参照する必要がない（request 単位で読む）

**Alternatives considered**:
- 正規化テーブル（request_enabled_options）: 現時点でオーバーエンジニアリング
- カンマ区切り文字列: パースが面倒で型安全性が低い

### 4. propose 完了ハンドラは PR を作成しない

**Decision**: propose セッション完了時はブランチの存在確認のみ行い、PR は作成しない。request のステータスを `reviewing` には遷移せず `in-progress` のまま維持する。

**Rationale**:
- propose は4セッション直列モデルの最初のステップであり、PR 作成は最後のセッション完了後に行う
- bootstrap と異なり、propose 完了はワークフロー全体の完了ではない
- セッションの完了（session status: completed）と change folder の閲覧可能は区別する

### 5. change folder 閲覧は GitHub Contents API を使用

**Decision**: ブランチ上のファイルを GitHub REST API（Contents API）で取得して表示する。

**Rationale**:
- `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` で特定ブランチのファイル取得が可能
- markdown ファイルの raw content を取得して UI で表示
- ファイル一覧は `openspec/changes/{slug}/` ディレクトリの contents で取得
- 既存の `github-api.ts` パターンに沿って追加

**Alternatives considered**:
- Git Trees API: オーバースペック。単純なファイル取得で十分
- clone してローカルで読む: サーバーサイドにファイルシステムが必要で不適切

### 6. propose セッション用 Agent は専用作成

**Decision**: propose 専用の Agent を作成する。system prompt に openspec-propose スキルの指示を含める。

**Rationale**:
- propose セッションの Agent は change folder 生成に特化した system prompt が必要
- bootstrap 用 Agent とは異なる指示内容
- Agent 作成は `client.beta.agents.create()` で動的に行う（または事前作成済みの Agent ID を使用）
- system prompt には: slug の指示、openspec CLI の使い方、ブランチ操作の手順を含む

### 7. request 作成と propose 起動は分離

**Decision**: request 作成（DB 保存）と propose セッション起動は別のアクションとして分離する。UI からは「作成 + 起動」をワンクリックで実行できるが、内部的には `createRequest()` → `startPropose()` の2ステップ。

**Rationale**:
- 単一責任原則: request 作成と session 起動は別の関心事
- request 作成だけして propose を後から手動起動するユースケースにも対応できる
- エラー時のロールバック粒度が細かくなる（request は残して session だけ巻き戻す）
- テスタビリティの向上

## Risks / Trade-offs

### Risk: propose セッションが change folder を生成せずに終了する
**Mitigation**: session-completion-handler でブランチ上の change folder の存在を確認する。存在しない場合は request のステータスを変更しない（再試行可能な状態を維持）。

### Risk: GitHub Contents API の rate limit
**Mitigation**: change folder 閲覧は都度取得だが、ページロード時のみ。頻繁なポーリングは行わない。ユーザー操作起点の取得のため rate limit に達する可能性は低い。

### Trade-off: enabled フィールドの JSON 文字列はスキーマ検証が弱い
**Impact**: DB レベルでの制約がなく、不正な JSON が入る可能性がある。Server Action 層でのバリデーションで担保する。

### Trade-off: propose 完了時に PR を作らないため、手動でブランチを確認する必要がある
**Impact**: 4セッションモデルの後続パイプライン未実装のため一時的な制約。change folder viewer で閲覧は可能。

## Migration Plan

1. DB マイグレーション: `requests` テーブルに `enabled` カラム追加（既存レコードは null 許容）
2. `sessions.role` enum に `'propose'` を追加
3. 既存の request 作成フォームに enabled マルチセレクトを追加
4. propose-actions.ts を新規作成
5. session-completion-handler に propose case を追加
6. github-api.ts にファイル取得関数を追加
7. change folder viewer ページを新規作成

ロールバック: propose 関連の新規コードは既存機能に影響しないため、コードの revert で十分。DB マイグレーションは null 許容カラムの追加のみで後方互換。

## Open Questions

- propose セッション用 Agent は事前作成（固定 Agent ID）か、request ごとに動的作成か？ → 初回は動的作成し、Agent ID を DB に保存して再利用するパターンを採用する。
- slug の生成ルール（タイトルからの変換）の詳細は？ → `YYYY-MM-DD-{title-to-kebab-case}` 形式。日本語タイトルの場合は transliteration が必要になるため、英語入力を前提とする。
