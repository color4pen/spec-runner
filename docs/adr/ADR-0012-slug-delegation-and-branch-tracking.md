# Slug 生成のエージェント委譲と Custom Tool によるブランチ名追跡

**Date**: 2026-04-25
**Status**: proposed

## Context

spec-runner の propose セッションでは、サーバー側の `generateSlug()` がリクエストタイトルから slug を事前計算し、エージェントにブランチ名を指示していた。しかし `generateSlug()` は `[^a-z0-9]` で非 ASCII 文字を全除去するため、日本語タイトルでは空の slug（`2026-04-25-`）が生成されブランチ名が壊れる。さらに、エージェントが実際に使用した slug・ブランチ名をアプリケーションが追跡する手段がなく、slug のずれが change folder 閲覧や差分 URL 生成を破壊するリスクがあった。

Anthropic Managed Agents SDK の Custom Tools 機構（`agent.custom_tool_use` → `session.status_idle(requires_action)` → `user.custom_tool_result`）は SDK 調査で確認済みだったが未実装だった。

## Decision

slug 生成をエージェントに委譲し、エージェントが確定したブランチ名を `register_branch` Custom Tool 経由で DB に永続化する設計を採用した。具体的には以下の 4 つの決定を行った。

1. **Custom Tool ハンドリングを SSE stream route に実装する** — SSE ループが唯一のリアルタイムイベント受信点であり、`requires_action` イベント検知とディスパッチをここで行う。ディスパッチャは `custom-tool-handler.ts` に分離し、stream route の肥大化を防ぐ。
2. **`branch_name` を DB に永続化し、決定的導出を段階的に廃止する** — `requests` テーブルに `branch_name`（TEXT, nullable）と `base_branch`（TEXT, nullable）を追加。DB の値が存在すればそれを使い、なければフォールバックとして従来の導出を維持する。
3. **`buildProposeMessage()` の指示を委譲型に変更する** — 事前計算の slug/branchName パラメータを削除し、エージェントにリポジトリ文脈を踏まえた英語 slug 決定を委ねる。
4. **`requires_action` イベントで SSE ループを break しない** — Custom Tool 呼び出しはセッションの一時停止であり終了ではない。ツール結果返却後にセッションは `running` に復帰するため、ループを維持する。

## Alternatives Considered

### Alternative 1: サーバー側で翻訳 API を使って slug を生成
- **Pros**: エージェントに依存せず決定的な slug 生成が可能
- **Cons**: 外部 API 依存の追加、翻訳品質の保証なし、リポジトリ文脈を考慮できない
- **Why not**: エージェントは LLM であり、タイトルの意味とリポジトリの文脈を踏まえた slug 生成が可能。外部依存を増やす合理性がない

### Alternative 2: slug のみ DB に保存し branch_name を都度導出
- **Pros**: 保存データが小さい
- **Cons**: slug → branch の変換ロジックが分散し、命名規則変更時に全箇所修正が必要
- **Why not**: エージェントが確定した branch_name 全体を保存するほうが情報量が多く堅牢。slug が必要な場面では branch_name からパース可能

### Alternative 3: SSE ループを break して再接続
- **Pros**: ループ制御がシンプル
- **Cons**: 再接続時にイベントの取りこぼしやデュプリケーションのリスク
- **Why not**: SDK の SSE ストリームは接続維持前提で設計されている。Custom Tool は一時停止であり、ループ継続が正しいセマンティクス

## Consequences

### Positive
- 日本語タイトルでも適切な英語 slug が生成され、ブランチ名が壊れない
- DB が single source of truth となり、slug のずれによるレイテントバグが根本解決される
- `requires_action` ハンドリングの共通基盤が構築され、将来の `submit_verdict`, `submit_artifacts` 等の Custom Tool 追加が容易になる
- フォールバック機構により、`register_branch` が呼ばれる前でも既存動作が維持される

### Negative
- エージェントが `register_branch` を呼ばないリスクがある（指示メッセージで明示的に要求 + フォールバックで緩和）
- DB に `branch_name` がない過渡期では導出ソースが 2 つ存在し、一時的に複雑性が増す
- `fetchAndHandleCustomTool` が最新 50 件のイベントから Custom Tool Use イベントを検索する実装は、長時間セッションでは脆弱

### Risks
- Custom Tool 処理中の SSE 接続切断 — サーバーサイドで同期処理するため、クライアント接続が切れても `user.custom_tool_result` 送信は完了する
- SDK の `sessions.create` が `tools` パラメータを受け付けないため、Custom Tool は Agent レベルで登録する必要がある。`createBoundSession()` の `customTools` パラメータは現時点では dead code

### Known Design Debt
- **静的ソース解析テスト**: SSE ループの `requires_action`/`end_turn` 分岐や `resolveSlugAndBranch` のフォールバックが `toContain` ベースの静的解析テストに依存している。mock ベースの統合テストへの移行が必要（review-feedback-001 Findings #2, #3）
- **イベント検索の脆弱性**: `fetchAndHandleCustomTool` が最新 50 件のイベントリストから検索する実装は、長時間セッションで対象イベントを見逃す可能性がある。SSE ストリーム通過時にイベントをキャッシュする方式への改善が望ましい（review-feedback-001 Finding #4）
- **`customTools` パラメータの dead code**: SDK が Session レベルの `tools` 指定をサポートするまで、`createBoundSession()` の `customTools` パラメータは使用されない。明示的な TODO コメントまたは削除が必要（review-feedback-001 Finding #5）
