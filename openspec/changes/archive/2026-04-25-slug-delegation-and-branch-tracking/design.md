## Context

spec-runner は 4 セッション直列モデル（propose / spec-review / implement / code-review）の入口として、propose セッションで change folder を自動生成するフローを実装済み（PR #6）。しかし `generateSlug()` は `[^a-z0-9]` で非 ASCII 文字を全除去するため、日本語タイトルでは空の slug になる。また、slug をサーバー側で事前計算してエージェントに渡しているが、エージェントが実際に使った値を追跡する手段がなく、slug のずれが change folder 閲覧や差分 URL 生成を破壊するリスクがある。

Anthropic Managed Agents SDK の Custom Tools 機構（`agent.custom_tool_use` → `session.status_idle(requires_action)` → `user.custom_tool_result`）は SDK 調査で確認済みだが未実装。本変更で `requires_action` ハンドリングの共通基盤を構築し、`register_branch` を最初の Custom Tool として実装する。

## Goals / Non-Goals

**Goals:**
- slug 生成をエージェントに委譲し、日本語タイトルでも適切な英語 slug を生成可能にする
- エージェントが確定した slug・ブランチ名を Custom Tool 経由で spec-runner に報告し、DB に永続化する
- `requires_action` イベントハンドリングの共通基盤を構築する（`register_branch` が最初の実装）
- DB の `branch_name` を使って差分 URL と change folder ビューアを信頼性の高いデータで駆動する

**Non-Goals:**
- `base_branch` の動的設定（Phase 1 では null 固定、default branch 使用）
- Tool Permission Policy（`always_ask`）の実装
- `submit_verdict` / `submit_artifacts` 等の後続 Custom Tool の実装
- `user.interrupt` の実装

## Decisions

### Decision 1: Custom Tool ハンドリングを SSE stream route に実装する

**選択**: `src/app/api/sessions/[id]/stream/route.ts` 内の SSE ループで `requires_action` イベントを検知し、Custom Tool ディスパッチャを呼び出す。

**理由**: 既存の SSE ストリーミング基盤（stream route → session-completion-handler）のパターンに沿う。SSE ループが唯一のリアルタイムイベント受信点であり、ここでディスパッチするのが最も直接的。

**代替案**:
- Webhook 受信エンドポイントを新設: SDK に webhook はなく、SSE ストリームが唯一のイベント配信手段のため不可
- ポーリングで `requires_action` を検知: レイテンシ増加とリソース浪費。SSE がリアルタイムに配信する情報を再取得する合理性がない

### Decision 2: Custom Tool ディスパッチャを `custom-tool-handler.ts` に分離する

**選択**: `src/lib/custom-tool-handler.ts` を新設し、ツール名→ハンドラのディスパッチロジックを集約する。stream route は `handleCustomToolUse()` を呼ぶだけ。

**理由**: stream route に個別 Tool のビジネスロジックを書くと、Custom Tool が増えるたびに route ファイルが肥大化する。session-completion-handler.ts が role ベースのディスパッチを集約しているのと同じ設計原則。

**代替案**:
- stream route 内に直接 switch-case を記述: 短期的にはシンプルだが、`submit_verdict` 等の追加時に route が肥大化する
- 動的 import でハンドラをロード: 現時点ではツール数が少なく、静的 import で十分。過剰な抽象化は避ける

### Decision 3: `branch_name` を DB に永続化し、決定的導出を段階的に廃止する

**選択**: `requests` テーブルに `branch_name` (TEXT, nullable) と `base_branch` (TEXT, nullable) を追加。`register_branch` Custom Tool 呼び出し時に `branch_name` を書き込む。change folder ビューアと completion handler は DB の `branch_name` が存在すればそれを使い、なければフォールバックとして従来の決定的導出を維持する。

**理由**: constraints.md に「決定的導出のソースは単一にする」とあり、slug を複数モジュールで再導出する現行設計はレイテントバグのリスクがある。DB を single source of truth にすることで、エージェントが決めた値とアプリが参照する値のずれを根本解決する。フォールバックにより、`register_branch` が呼ばれる前（エージェント実行中）でも既存動作を維持��る。

**代替案**:
- `branch_name` を DB に保存せず、slug のみ保存して都度 `{prefix}/{slug}` に変換: slug→branch の変換ロジックが分散し、将来ブランチ命名規則が変わった場合に全箇所修正が必要。エージェントが決定した値をそのまま保存するほうが堅牢
- `slug` カラムを新設して `branch_name` を導出: slug は branch_name の一部であり、エージェントが確定した branch_name 全体を保存するほうが情報量が多い。slug が必要な場面（change folder パス）では branch_name からパース可能

### Decision 4: `buildProposeMessage()` の指示を委譲型に変更する

**選択**: 事前計算の `branchName` / `slug` パラメータを削除し、「リポジトリの文脈を踏まえて英語 slug を決定し、ブランチを作成した後に `register_branch` ツールを呼んで報告せよ」という指示に変更する。

**理由**: slug 生成をエージェントに委譲する本変更の核心。エージェントは LLM であり、日本語タイトルから文脈を踏まえた英語 slug を生成する能力を持つ。事前計算の slug 指示を残すと、エージェントが異なる slug を使った場合に不整合が生じる。

**代替案**:
- slug ルールを厳密に指示して自由度を制限: エージェントの LLM ��力を活かせず、結局サーバー側で同じことをするのと変わらない
- エージェントの出力を後からパースして slug を抽出: 構造化されていない出力のパースは脆弱。Custom Tool による明示的な報告のほうが信頼性が高い

### Decision 5: `requires_action` イベントの SSE ループ内フロー

**選択**: SSE ループで `session.status_idle` + `stop_reason.type === 'requires_action'` を検知したら、`event_ids` から Custom Tool Use イベントを特定し、`handleCustomToolUse()` でツールを実行し、結果を `user.custom_tool_result` で返す。SSE ループは break しない（セッションが `running` に復帰して続行するため）。

**理由**: Custom Tool 呼び出しはセッションの一時停止であり、終了ではない。`end_turn` と異なり、ツール結果を返した後にセッションは自動的に `running` に復帰し、エージェントが処理を続行する。ループを break すると後続のイベントを受信できなくなる。

**代替案**:
- break して再接続: 再接続時にイベントの取りこぼしやデュプリケーションのリスクが生じる。SDK の SSE ストリームは接続維持前提で設計されている

### Decision 6: Agent 作成時の Custom Tool 定義

**選択**: `createBoundSession()` に `customTools` パ���メータを追加し、Agent の `tools` 配列に含める。`startPropose()` が `register_branch` ツール定義を渡す。

**���由**: Custom Tool は Agent レベルではなく Session レベルで定義される（SDK の `sessions.create` の `tools` ���ラメータ）。ただし現在の `createBoundSession()` は Agent に `tools` を渡していないため、既存の Agent 設定に Custom Tool を追加する形になる。SDK ドキュメ���トを確認し、Session 作成時に `tools` を指定できるか、Agent 更新が必要かを実装時に検証する。

## Risks / Trade-offs

- **[Risk] エージェントが `register_branch` を呼ばない** → Mitigation: 指示メッセージで明示的に呼び出しを要求する。フォールバックとして従来の���定的導出を維持するため、呼ばれなくても既存動作は壊れない
- **[Risk] Custom Tool 処理中の SSE 接続切断** → Mitigation: ツール処理はサーバーサイドで同期的に行い、ネットワーク往復を最小化。クライアントの SSE 接続が切れても、サーバーは Anthropic API への `user.custom_tool_result` 送信を完了する
- **[Risk] `requires_action` と `end_turn` の検知順序** → Mitigation: `stop_reason.type` で明確に分岐するため、順序は問題にならない。`requires_action` はツール結果を返して続行、`end_turn` は break して完了処理
- **[Trade-off] DB マイグレーション** → `branch_name` / `base_branch` は nullable のため、既存レコードへの影響なし。`ALTER TABLE ADD COLUMN` の単純マイグレーション
- **[Trade-off] フォールバックの二重導出** → DB に `branch_name` がない間は従来の決定的導出を使うため、一時的に導出ソースが2つ存在する。`register_branch` が呼ばれた時点で DB が single source of truth になり、フォールバックは使われなくなる
