# ADR-20260416: リクエスト中心の3層スキーマへの再設計

**Date**: 2026-04-16
**Status**: accepted
**Supersedes**: [ADR-20260416-session-binding-design](ADR-20260416-session-binding-design.md)

## Context

Phase 2 では `user_sessions` テーブルでユーザーとセッションの1対1紐付けを実装した。しかしワークフロー自動化（1リクエストに対して設計・実装・レビュー・修正の複数セッション）に対応するには、リクエストをデータモデルの中心に据える必要がある。既存の `users → user_sessions` の2テーブル構造では、リポジトリ設定の管理場所やセッションの役割（role/step）表現に限界があった。

## Decision

`user_sessions` テーブルを廃止し、`users → repositories → requests → sessions` の4テーブル・3層モデルに再設計する。所有権検証は FK チェーン（sessions -> requests -> repositories -> users）を辿る JOIN で実現し、各テーブルに `user_id` を冗長に持たせない。

## Alternatives Considered

### Alternative 1: requests に repo カラムを直接持たせる（repositories テーブルなし）
- **Pros**: テーブル数が少なくシンプル
- **Cons**: リポジトリ設定（将来の agent_id, environment_id デフォルト値等）の置き場がない。同一リポジトリの情報が requests ごとに重複する
- **Why not**: 正規化が不十分で、リポジトリ単位の操作（一覧、設定変更）に対応できない

### Alternative 2: 既存 user_sessions に request_id カラムを追加する
- **Pros**: 既存テーブルを活かせるのでマイグレーションコストが小さい
- **Cons**: `user_sessions` の命名と責務が曖昧になる。セッションの role/step 管理が煩雑。テーブル設計が歴史的経緯に引きずられる
- **Why not**: あるべき姿からの設計ではなく、技術的負債を温存する延命策

### Alternative 3: 各テーブルに user_id を冗長に持たせて直接検証する
- **Pros**: 所有権検証が単一テーブルの WHERE で済み JOIN 不要
- **Cons**: データ不整合のリスクがある（user_id の更新漏れ）。外部キー制約による整合性担保ができない
- **Why not**: SQLite ローカル DB では JOIN コストは無視できる。データ整合性を犠牲にするメリットがない

## Consequences

### Positive
- 1リクエストに対して複数セッション（implementer/reviewer/fixer/explorer）をぶら下げられ、ワークフロー自動化の土台が完成する
- FK チェーンによる所有権検証で IDOR を構造的に防止。冗長な user_id がないためデータ不整合が起きない
- CASCADE DELETE により、リポジトリ削除時に配下のリクエスト・セッションが自動削除される
- ワークフローの状態（requests.status）とセッションの役割（sessions.role/step）を DB で管理でき、ポーリングベースの自動化に備えられる

### Negative
- Server Actions のインターフェースが破壊的に変更される（全関数シグネチャ変更）
- ワークスペース UI のサイドバーがセッション一覧からリクエスト一覧に変わり、既存のフローが一時的に使えなくなる
- マイグレーションの手動作成が必要だった（drizzle-kit generate が TTY を要求しインタラクティブモードで動かないため）

### Risks
- **マイグレーション時のデータ損失**: INSERT OR IGNORE + IF NOT EXISTS で冪等性を確保。2回実行テスト（TC-009）で検証済み
- **step カラムの自由テキスト**: enum にしないことで柔軟性を確保するが、typo リスクがある。アプリケーション層の定数定義 + バリデーションで対処
- **DB と API のステータス乖離**: 初回表示は DB 値を使い、明示的リフレッシュ時のみ API から再取得。バックグラウンド同期は将来の課題

### Known Design Debt
- `SessionSummary` インターフェースが `request-actions.ts` と `session-actions.ts` で重複定義されている（構造は同一）。共通の型定義ファイルへの集約が必要（review-feedback-002 Finding #1, MEDIUM/maintainability）
- `verifyRepositoryOwnership` が `request-actions.ts` のプライベートヘルパーとして閉じている。`repository-actions.ts` との共有を将来のリファクタリングで検討（review-feedback-002 Finding #2, LOW/maintainability）
