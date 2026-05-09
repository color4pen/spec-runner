# Spec Review Result — session-state-handling (Iteration 1)

- **reviewer**: spec-reviewer
- **date**: 2026-05-09
- **verdict**: needs-fix

## Summary

Proposal と tasks.md はリクエストの要件をほぼ網羅しており、SDK 型定義との整合性も高い。ただし、T5（ポーリングの stop_reason 区別）の `listEvents` ラッパー設計に SDK API シグネチャとの不一致があり、T3 の SSE ハンドリングで `session.error` の `error.retry_status` アクセスに型安全性の問題がある。また `completion.ts` の `isProposeComplete` が `idle` を無条件に完了扱いする設計が、T5 の変更と矛盾する。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | tasks.md T5 | `listEvents` ラッパーが `client.beta.sessions.events.list(sessionId)` を呼んでいるが、SDK の `events.list()` はデフォルト昇順（古い順）。T5 の `getIdleStopReason` は `for await` で最初にヒットした idle イベントを返すため、古い idle イベントの stop_reason を返す。`order: "desc"` を渡して降順にするか、全ページ走査して最後の idle を取る必要がある。tasks.md の「実装ノート」に注記はあるが、`listEvents` の仕様コードは昇順前提で書かれている | `listEvents` の呼び出しに `{ order: "desc" }` パラメータを渡す設計に変更する。SDK は `EventListParams` で `order?: 'asc' \| 'desc'` をサポートしている |
| 2 | HIGH | consistency | tasks.md T4/T5 | `completion.ts` の `isProposeComplete()` は `session.status === "idle"` を返すが、T5 で idle の stop_reason を区別してエラーにするなら、`isProposeComplete` の命名と意味が矛盾する。`isProposeComplete` → `true` → `getIdleStopReason` → throw の流れは「完了してるのにエラー」という認知的矛盾を生む | `isProposeComplete` を `isSessionIdle` にリネームするか、stop_reason 判定を `isProposeComplete` 内部に統合する。どちらを選ぶかはタスクに明記する |
| 3 | MEDIUM | correctness | tasks.md T3 | `isRetryStatusRetrying(event.error)` は `event.error` を引数に取るが、SDK の `BetaManagedAgentsSessionErrorEvent.error` は union 型（`BetaManagedAgentsUnknownError \| ... \| BetaManagedAgentsBillingError`）。全 variant が `retry_status` を持つので動作するが、`isRetryStatusRetrying` の引数型が `BetaManagedAgentsSessionErrorEvent["error"]` となっており、`error.retry_status.type` は `"retrying" \| "exhausted" \| "terminal"` の union。型は正しいが、T2 のコード例で `error.retry_status` のアクセスがナローイングなしで `{ type: "retrying" }` と比較しており、`retry_status` 自体が union 型（`RetryStatusRetrying \| RetryStatusExhausted \| RetryStatusTerminal`）であることの明示が不足 | T2 の `isRetryStatusRetrying` のシグネチャを `error: { retry_status: { type: string } }` ではなく SDK の union 型で明示的に記述する。現状でも動くが意図の明示性が低い |
| 4 | MEDIUM | completeness | proposal.md | Port インターフェース（`session-client.ts`）の `pollUntilComplete` 返り値型が `status: "idle" \| "terminated"` だが、新しいエラー（`rescheduling_exhausted`, `requires_action`, `retries_exhausted`）は `AnthropicSessionClient` の catch ブロックで `normalizeSessionError` 経由で `{ status: "terminated", error }` に変換される設計。これ自体は正しいが、proposal.md の "Impact" / "後方互換性" セクションに `session-client.ts` adapter の error 正規化パスへの影響が記述されていない | proposal.md の Impact セクションに `session-client.ts` adapter 経由の error 正規化（catch → normalizeSessionError）が新しいエラーコードを正しく伝搬することを明記する |
| 5 | MEDIUM | completeness | tasks.md | `session-error.ts`（`normalizeSessionError`）が新しいエラーコード（`SESSION_RETRIES_EXHAUSTED` 等）を正しくハンドリングするかの確認タスクがない。`AnthropicSessionClient.pollUntilComplete` は catch で `normalizeSessionError(err)` を呼ぶが、新しいエラーが `SpecRunnerError` インスタンスなら code/message/hint がそのまま渡るか確認が必要 | `session-error.ts` の `normalizeSessionError` が `SpecRunnerError` を正しく変換するかの確認を T9 相当のタスクとして追加する |
| 6 | LOW | maintainability | tasks.md T7/T8 | Port の `terminationReason` 型（Line 79）と adapter の `TerminationReason` 型を同期する手動管理は脆い。型の値が一方のみ更新される regression が予想される | 将来的に共通 const tuple → typeof で両方を導出する。今回は実装ノートの注意事項で許容 |
| 7 | LOW | completeness | tasks.md T10 | SSE ストリームの `session.error` / `session.deleted` / `session.status_rescheduled` に対する統合テスト（`runSseStream` を通したテスト）がない。T10-3 はナローイング関数の単体テストのみ | SSE ストリーム自体のモック統合テストは scope が大きいため、今回は T10-3 のナローイング関数テストで許容。将来課題として記録 |

## Verdict Rationale

Finding #1 は `getIdleStopReason` が古い idle イベントの stop_reason を返すバグを埋め込む設計であり、`requires_action` の誤検出または見逃しに直結する。Finding #2 は `isProposeComplete` の意味が変わるにもかかわらずリネームも再定義もされておらず、実装者が混乱する可能性が高い。いずれも HIGH のため `needs-fix`。
