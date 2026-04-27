# Spec Review Result: 2026-04-18-bootstrap-session-lifecycle — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.7 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 7 | 0.15 | 1.05 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.70** |

### カテゴリの観点

| Category | 評価観点 | 主担当エージェント |
|----------|---------|-----------------|
| completeness | 要件の網羅性、受け入れ基準の充足、仕様の漏れ | spec-reviewer |
| consistency | 既存 spec との整合性、後方互換性、用語統一 | spec-reviewer, architect |
| feasibility | 実現可能性、依存関係、工数見積の妥当性 | architect |
| security | 認証・認可、入力検証、脅威モデル（spec レベル） | security-reviewer |
| maintainability | 仕様の明確性、将来の拡張容易性、アンチパターン回避 | architect, pattern-reviewer |

### スコアリング基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な仕様不備あり。設計やり直し相当 |
| 4-5 | 仕様に欠落や矛盾あり。実装前に修正必須 |
| 6 | 最低限の記述。抜けやあいまいさが残る |
| 7 | 良好。実装に進める水準（**承認閾値**） |
| 8 | 優良。網羅性・整合性ともに安定 |
| 9-10 | 卓越。模範的な仕様記述 |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | specs/bootstrap-cancel/spec.md | `cancelBootstrap` の pr_pending キャンセル時に request status を `cancelled` に遷移すると記載しているが、session-completion-handling spec では PR 作成後に request status を `reviewing` に遷移する。既存の request 状態マシン（request-management spec + request-actions.ts）では `reviewing -> cancelled` は許可されていない（`reviewing` からの遷移は `completed` と `in-progress` のみ）。pr_pending 状態でキャンセルすると状態遷移違反が発生する | 2 つの選択肢: (A) request 状態マシンに `reviewing -> cancelled` 遷移を追加する（request-management delta spec + request-actions.ts の ALLOWED_TRANSITIONS を修正）。(B) bootstrap 完了時の request status を `reviewing` ではなく `in-progress` のまま保持し、PR merge 時に `in-progress -> reviewing -> completed` と遷移する。推奨は (A) — キャンセルは汎用的に必要な遷移 |
| 2 | HIGH | consistency | specs/database/spec.md | database delta spec で requests.type CHECK 制約に `bootstrap` を追加するシナリオがあるが、既存 spec（openspec/specs/database/spec.md）の Request type CHECK constraint は `(new-feature, spec-change, refactoring, bugfix)` のまま。delta spec では MODIFIED として既存 spec を上書きする形で定義すべきだが、session role CHECK constraint の既存 spec（`implementer, reviewer, fixer, explorer`）も同様に MODIFIED 宣言が必要。現在の database delta spec は MODIFIED Requirements として記載しているが、既存 database spec の sessions role CHECK constraint シナリオ（`not in (implementer, reviewer, fixer, explorer)` → reject）と明示的に矛盾する新しい値 `bootstrap` を受け入れると書いている。既存 spec 側の更新がどのように行われるか（archive 時のマージ戦略）が不明確 | delta spec の MODIFIED セクションに、既存 spec のどのシナリオを置き換えるか（既存 spec の "Session role CHECK constraint" シナリオ、"Request type CHECK constraint" シナリオ）を明示的に参照する。または、database delta spec 内で既存 spec の対応シナリオ ID を引用し、マージ時の競合を防ぐ |
| 3 | MEDIUM | completeness | specs/session-completion-handling/spec.md | session-completion-handler の `handleSessionCompleted` は `sessionDbId` を引数に取るが、OAuth トークンの取得方法が曖昧。spec では「SSE route の認証チェーンから authenticated user context にアクセス」とあるが、SSE route は API Route（auth() で session 取得）であり、session-completion-handler は `'use server'` モジュールとして設計されるべきか、純粋な関数として SSE route 内から呼ばれるのかが不明。`'use server'` なら `getAuthenticatedUser()` で取得可能だが、API Route から Server Action を直接呼ぶのは Next.js の推奨パターンではない | session-completion-handler のモジュール設計を明確化する: (A) `'use server'` にせず、純粋な関数として accessToken を引数に受け取る設計。SSE route（API Route）が auth() で取得した accessToken を渡す。(B) design.md の Decision 1 で明示的に `session-completion-handler.ts` が `'use server'` ではないことを記載し、token の受け渡し方法を定義する |
| 4 | MEDIUM | completeness | specs/bootstrap-cancel/spec.md | `cancelBootstrap` で `bootstrapping` 状態からキャンセルする際、「active bootstrap session を archive」とあるが、active な bootstrap session の特定方法が未定義。repository から request を逆引きし、さらに session を逆引きする必要がある。クエリの方法（repositories → requests WHERE type='bootstrap' AND status='in-progress' → sessions WHERE status='active'）を spec レベルで定義すべき | cancelBootstrap のシナリオに「active bootstrap session の特定」ステップを追加: `repositories.id` → `requests WHERE repository_id = ? AND type = 'bootstrap' AND status = 'in-progress'` → `sessions WHERE request_id = ? AND role = 'bootstrap' AND status = 'active'` の逆引きチェーン。見つからない場合の挙動（DB のみ更新、API archive はスキップ）も明記する |
| 5 | MEDIUM | completeness | specs/session-completion-handling/spec.md, specs/bootstrap-execution/spec.md | request status 遷移の `in-progress -> reviewing` を `handleBootstrapCompleted` 内で直接 `updateRequestStatus` 経由で行うと記載されているが、`updateRequestStatus` は `verifyRequestOwnership` を内部で呼ぶ。`handleBootstrapCompleted` が SSE route（API Route）経由で呼ばれる場合、`verifyRequestOwnership` は `getAuthenticatedUser()` を呼ぶが、API Route のコンテキストで `getAuthenticatedUser()` が正しく動作するかは auth-helpers の実装次第。Server Action 以外のコンテキストからの呼び出しが考慮されていない | `handleBootstrapCompleted` 内での request status 更新を、`updateRequestStatus`（所有権検証付き）ではなく、内部用の直接 DB 更新関数を使うか、`updateRequestStatus` が API Route コンテキストでも動作することを保証する旨を spec に明記する |
| 6 | MEDIUM | security | specs/vault-management/spec.md | vault-actions.ts の `ensureVaultWithCredentials` は `userId` と `accessToken` を引数に取ると design.md に記載。しかし vault-management spec では「`getAuthenticatedUser()` による認証が必要」と記載。`userId` を外部引数として受け取るなら IDOR リスクがある（review-lessons の「userId を引数に取る Server Action は IDOR の強いシグナル」に該当）。design.md と spec の間でインターフェースが矛盾している | vault-actions.ts を `'use server'` にする場合: `ensureVaultWithCredentials()` は引数を取らず、内部で `getAuthenticatedUser()` から userId と accessToken を取得する。`'use server'` にしない場合: 呼び出し元（bootstrap-actions.ts）が `getAuthenticatedUser()` で取得した値を渡す設計とし、vault-actions.ts 自体は純粋関数として spec を修正する。design.md のシグネチャ `ensureVaultWithCredentials(userId, accessToken)` を正しい方に合わせる |
| 7 | MEDIUM | consistency | specs/bootstrap-execution/spec.md | bootstrap 指示メッセージのステップ 7-8 で「commit on branch `openspec-bootstrap/{owner}/{repo}` + push」とあるが、design.md の Decision 5 でのブランチ命名規則とは一致する一方、session-completion-handling spec の「expected branch (`openspec-bootstrap/{owner}/{repo}`)」と整合している。しかし、このブランチ命名規則が既存のリモートブランチと衝突した場合の挙動（既にブランチが存在する場合）が定義されていない。2 回目の bootstrap（前回失敗でロールバック後の再実行）では古いブランチが残っている可能性がある | 以下のいずれかを spec に追加: (A) `startBootstrap` の事前チェックとして `getBranchExists` でブランチの存在を確認し、存在する場合はブランチを削除してから進める。(B) エージェント指示メッセージに「既存ブランチがあれば force push」を含める。(C) ブランチ名にタイムスタンプや短いハッシュを付与してユニーク化する。推奨は (A) — 冪等な再実行を保証 |
| 8 | MEDIUM | feasibility | tasks.md | Task 8.1「SSE route にセッション完了検知ロジックを追加」で `session_updated` + `idle` + `end_turn` の組み合わせ検知とあるが、Anthropic Managed Agents SDK の `client.beta.sessions.events.stream()` が返すイベントの型が `session_updated` かどうか、また `stop_reason.type` フィールドの正確な構造について SDK の型定義を確認する必要がある。設計段階で SDK 調査が不足している可能性がある | 実装前に `@anthropic-ai/sdk` の型定義（`BetaSessionEvent` 等）を調査し、セッション完了を示すイベントの正確な型・フィールド名を design.md に追記する。SDK の breaking change に備え、イベント型の検証を defensive に実装する旨を spec に記載する |
| 9 | LOW | completeness | specs/message-streaming/spec.md | ステータス API (`GET /api/repos/{owner}/{name}/status`) の `requestStatus` フィールドの取得方法が未定義。最新の bootstrap request を type='bootstrap' で検索するのか、特定の request ID を使うのかが不明 | ステータス API のシナリオに、requestStatus の取得方法を追加: `requests WHERE repository_id = ? AND type = 'bootstrap' ORDER BY created_at DESC LIMIT 1` で最新の bootstrap request の status を返す。bootstrap request が存在しない場合は null を返す |
| 10 | LOW | maintainability | design.md | `archiveSessionsByRequest` が bootstrap-actions.ts の内部ヘルパーとして定義されているが、cancelBootstrap でも使用される。しかし design.md や tasks.md ではこの関数が cancelBootstrap からどう呼ばれるかの記述がない | design.md の Decision 1 または tasks.md の Task 7.3 に、cancelBootstrap が `archiveSessionsByRequest` または同等の機能を使用してセッションを archive する旨を明記する |

## Iteration Comparison

（初回のため該当なし）

### Improvements
- （初回のため該当なし）

### Regressions
- （初回のため該当なし）

### Unchanged Issues
- （初回のため該当なし）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.70 | needs-fix | 初回レビュー。request 状態マシンとの整合性問題（HIGH x2）、セッション完了ハンドラの設計詳細不足（MEDIUM x4） |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue

### 停滞検出ルール

- `plateaued` (前回との差が ±0.3 以内) が **2 iteration 連続** した場合、`verdict` を `escalation` にする
- `regressing` (前回より 0.3 以上低下) が 1 回でも発生した場合、即 `escalation` を検討する

## Summary

全体として設計の方向性は正しく、SSE route の責務分離、role ベースの完了ハンドラ、GitHub API lib の集約など、アーキテクチャ上の判断は適切。しかし 2 つの HIGH 指摘が承認を阻止している:

1. **request 状態マシンとの整合性問題**: pr_pending キャンセル時に request が `reviewing` 状態にあるが、`reviewing -> cancelled` 遷移が既存の状態マシンで許可されていない。既存 spec との整合性の欠如。
2. **database delta spec と既存 spec の CHECK 制約シナリオの競合**: MODIFIED 宣言はあるが、既存 spec のどのシナリオを置き換えるかが曖昧で、マージ時に矛盾が残る。

これらに加え、session-completion-handler のモジュール境界（Server Action vs 純粋関数）と OAuth トークンの受け渡し方法、vault-actions の引数設計における IDOR リスクなど、実装に入る前に解消すべき MEDIUM 指摘が複数ある。
