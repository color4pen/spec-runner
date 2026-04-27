# Bootstrap セッションライフサイクル統合

**Date**: 2026-04-18
**Status**: accepted
**Supersedes**: [ADR-0010-bootstrap-for-managed-agents](ADR-0010-bootstrap-for-managed-agents.md) の D6（PR URL ストリーム抽出）を構造的に置換

## Context

PR #3 で bootstrap 機能を実装し、PR #4 で SSE route handler にセッション完了検知・archive・PR 作成を応急処置として埋め込んだ。この構造は複数の問題を抱えていた。SSE route が「イベントストリーミング」以外の責務（完了検知、PR 作成、DB 更新）を持ち、bootstrap が `type: 'new-feature'` / `role: 'implementer'` として動作し固有の型を持たず、セッション完了時の処理が title 文字列のハードコード判定（`'Bootstrap openspec-workflow'`）に依存していた。さらにマネージドエージェント環境に gh CLI がなく、エージェント内から PR を作成できないことが判明し、GitHub REST API 呼び出しが bootstrap-actions.ts にインラインで散在していた。

根本原因は bootstrap を request type / session role として既存のライフサイクルに統合していないこと。

## Decision

bootstrap を `request.type = 'bootstrap'` / `session.role = 'bootstrap'` として型安全にモデル化し、4 つのモジュールにレイヤー分離することで SSE route の責務をイベントストリーミングのみに限定する。

1. **`github-api.ts`** — GitHub REST API 操作の純粋ラッパー（PR 作成・クローズ・ブランチ削除・存在確認）。`'use server'` なし。呼び出し元の Server Action が認証・認可を担保する
2. **`vault-actions.ts`** — Anthropic Vault API のライフサイクル管理。ユーザーごとに Vault を作成し GitHub OAuth トークンを MCP 認証情報として登録。409 Conflict 時は既存を削除して再登録
3. **`session-completion-handler.ts`** — セッション完了時の role ベース分岐ハンドラ。SSE route はストリーム終了検知後にこのハンドラに委譲するだけ。role ごとに完了処理を dispatch する汎用設計（bootstrap は最初のケース、将来 implementer / reviewer を追加）
4. **`bootstrap-actions.ts`** — bootstrap 固有ロジックの再設計。`startBootstrap` は Vault セットアップ → request 作成（`type: 'bootstrap'`）→ session 作成（`role: 'bootstrap'`）→ 指示メッセージ送信。エージェントは commit + push まで、PR 作成はアプリ側で GitHub REST API 経由

## Alternatives Considered

### Alternative 1: SSE route に bootstrap 固有ロジックを維持（PR #4 の方式）
- **Pros**: 追加モジュール不要。即座に動作する
- **Cons**: SSE route がイベントストリーミング以外の責務を持つ。title 文字列判定は脆弱。execute-request の将来拡張（設計・実装・レビューの別 role）に対応できない
- **Why not**: 構造的負債が蓄積し、role が増えるたびに SSE route が肥大化する

### Alternative 2: 全ロジックを bootstrap-actions.ts に集約
- **Pros**: 単一モジュールで完結。依存関係が少ない
- **Cons**: GitHub API 操作や Vault 管理が bootstrap 以外のユースケース（execute-request）で再利用できない。モジュールが肥大化する
- **Why not**: 責務分離により execute-request への拡張が容易になる。github-api.ts と vault-actions.ts は bootstrap に限定されない汎用基盤

### Alternative 3: Custom Tool でエージェントからコールバック通知
- **Pros**: エージェントから明示的に完了を通知できる
- **Cons**: Custom Tool はエージェントが自発的に呼ぶ仕組みで、呼ぶ保証がない（ADR-0010 で調査済み）
- **Why not**: session_updated イベントの status_idle + end_turn 検知のほうが確実

### Alternative 4: セッションごとに Vault を作成
- **Pros**: セッション間の認証情報汚染がない
- **Cons**: Vault 作成は API 呼び出しコストがある。MCP URL ごとに 1 認証情報の制約があるため、同一ユーザーの並行セッションで衝突する可能性がある
- **Why not**: ユーザーあたり 1 Vault で十分。現時点では GitHub MCP のみ

## Consequences

### Positive
- SSE route はイベントストリーミングのみに集中し、role 追加時に変更不要
- session-completion-handler の role ベース dispatch により、execute-request のマルチセッション対応（implementer / reviewer / fixer）への自然な拡張パスが確保された
- GitHub API 操作が lib に集約され、bootstrap 以外のワークフローからも再利用可能
- title 文字列判定が廃止され、型安全な `session.role` による分岐に置換
- PR 作成がアプリ側に移ったことで、マネージドエージェント環境の制約（gh CLI 不在）を構造的に解消
- Vault の再利用（users.vault_id 保存）により、毎回の Vault 作成コストを回避

### Negative
- 4 モジュールへの分離により、bootstrap フロー全体を追うには複数ファイルを横断する必要がある
- Vault API は beta ステータスであり、仕様変更リスクがある（vault-actions.ts に局所化して緩和）
- ポーリングベースのクライアント通知（3 秒間隔）は、将来的に WebSocket/SSE 通知への移行が望ましい

### Risks
- **Vault API の beta ステータス**: `client.beta.vaults` は beta API。vault-actions.ts に集約しているため、変更時の影響範囲は限定的
- **PR 作成の冪等性**: セッション完了ハンドラの二重実行で PR 重複の可能性。`findOpenPrByHead` による既存 PR 検索で冪等性を担保
- **外部 API + DB のロールバック**: PR 作成成功後に DB 更新が失敗した場合の孤立 PR。PR クローズ処理をロールバックステップに含める（ベストエフォート）
- **SQLite CHECK 制約の変更**: ALTER TABLE で直接変更不可。Drizzle push でテーブル再作成対応（ローカル DB のみなので許容）

### Known Design Debt
- テストケースの多くが source-text analysis（`toContain` on file text）に依存し、behavioral testing になっていない。外部依存（GitHub API, Anthropic SDK）のモックによる振る舞いテストへの移行が必要（review-feedback-002 Finding #1, MEDIUM/testing）
- `isConflictError` が `error.message.includes('409')` のフォールバックを使用しており脆弱。Anthropic SDK の型チェック（`instanceof`）への移行が推奨（review-feedback-002 Finding #4, LOW/maintainability）
- `startStatusPolling` の useCallback クロージャが `bootstrapStatus` のstale reference を保持する可能性。`useRef` での保持が推奨（review-feedback-002 Finding #5, LOW/correctness）
- session-completion-handler の JOIN クエリが全カラムを取得しており over-fetching。明示的なフィールド指定が望ましい（review-feedback-002 Finding #3, LOW/performance）
