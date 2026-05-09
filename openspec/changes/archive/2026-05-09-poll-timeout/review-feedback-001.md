# Code Review — poll-timeout — iteration 1

- **reviewer**: code-reviewer
- **date**: 2026-05-09
- **verdict**: needs-fix

## Summary

実装は design.md の D1–D4 に沿っており、5 層チェーン（errors → completion → session-client → agent-runner → executor）は正しく繋がっている。typecheck / test ともに green。ただし `pollTimeoutError` の引数名 `elapsedMs` に設定値（実経過時間ではない）を渡している不正確さ、SSE fallback 側で error を返さず hint が消失する非対称性、テストの try/catch パターンが false-pass のリスクを抱える点が指摘事項。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/adapter/managed-agent/completion.ts:77 | `pollTimeoutError(sessionId, opts!.timeoutMs!)` — 第2引数は `elapsedMs` だが、渡しているのは設定値 `timeoutMs` であり実経過時間ではない。sleep のオーバーヘッド分だけ実際の経過時間は `timeoutMs` より長い。エラーメッセージの「did not complete within Xs」が不正確になる | 関数冒頭の `deadline` 計算の直前に `const startTime = Date.now();` を記録し、throw 時に `pollTimeoutError(sessionId, Date.now() - startTime)` を渡す |
| 2 | MEDIUM | correctness | src/adapter/managed-agent/agent-runner.ts:184-185 | `runProposeStyle` SSE fallback の POLL_TIMEOUT ハンドリングで `error` プロパティを返していない。`runPollingStyle`（line 360-363）は `error: timeoutErr` を返しているのに、SSE fallback 側は `{ completionReason: "timeout", resultContent: null, sessionId }` のみ。executor.ts で fallback Error が使われ、`hint` が空文字列になる | `runPollingStyle` と同様に `pollResult.error` から Error オブジェクトを構築して `error` プロパティに含める |
| 3 | MEDIUM | testing | tests/completion.test.ts:188-196 | POLL_TIMEOUT テストの try/catch パターンが危険。`pollUntilComplete` が resolve した場合、catch ブロックが実行されず assertion が skip されてテストが false-pass する | `await expect(pollUntilComplete(...)).rejects.toMatchObject({ code: "POLL_TIMEOUT" })` に統合し、二重呼び出しを除去する |
| 4 | LOW | maintainability | tests/completion.test.ts:158-160 | 旧コメント `"pollUntilComplete no longer has a wall-clock timeout (design D1). The only terminal error from polling is SESSION_TERMINATED."` が残存。wall-clock timeout が再導入された本変更と矛盾 | コメントを削除するか、POLL_TIMEOUT 追加を反映した内容に更新する |
| 5 | LOW | maintainability | tests/unit/remove-session-timeout.test.ts:123 | TC-011 の第2テスト description `"pollUntilComplete は AbortSignal による中断のみをサポートし timeout を throw しない"` が factually incorrect。pollUntilComplete は POLL_TIMEOUT を throw するようになった | description を `"pollUntilComplete は AbortSignal pre-abort 時に SESSION_TIMEOUT を throw しない"` 等に修正する |

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| correctness | 6 | timeout 引数の意味ずれ（#1）と error 非対称（#2）が品質低下 |
| security | 8 | 新たな脆弱性なし |
| architecture | 8 | 5 層チェーンは design.md と整合。port 更新も適切 |
| performance | 8 | defense-in-depth として妥当。hot path への影響なし |
| maintainability | 6 | 旧コメント残存（#4, #5）で後続開発者を mislead する |
| testing | 5 | false-pass リスク（#3）。TC-041-5（deadline は API 取得前にチェック）のテスト未実装 |

**Total**: 6 × 0.30 + 8 × 0.25 + 8 × 0.15 + 8 × 0.10 + 6 × 0.10 + 5 × 0.10 = 1.80 + 2.00 + 1.20 + 0.80 + 0.60 + 0.50 = **6.9**

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-040-1 | must | — | 直接テストなし。factory の出力検証は暗黙的（POLL_TIMEOUT code のみ assert） |
| TC-040-2 | must | — | 静的解析テストなし（TC-008 で SESSION_TIMEOUT 不在は確認済み） |
| TC-041-1 | must | ✅ | completion.test.ts で実装済み |
| TC-041-2 | must | ✅ | completion.test.ts で実装済み |
| TC-041-3 | must | — | 未実装 |
| TC-041-4 | must | ✅ | `DEFAULT_POLL_TIMEOUT_MS` assert 済み |
| TC-041-5 | must | — | 未実装（deadline チェックが API 取得前であることの検証） |
| TC-042-1 | must | — | 静的テスト。TC-008 更新で部分的にカバー |
| TC-043-1 | must | — | 未実装 |
| TC-043-2 | must | — | 未実装 |
| TC-044-* | must | — | 未実装（integration レベル。単体テスト scope 外の可能性あり） |
| TC-045-* | must | — | 未実装（integration レベル） |
| TC-046-1 | must | ✅ | TC-008 更新済み |
| TC-046-2 | must | ✅ | TC-008 の timeoutMs 不在 assertion 削除済み |
| TC-046-3 | must | ✅ | TC-011 更新済み |
| TC-046-4 | must | ✅ | TC-011 の timeoutMs 不在 assertion 削除済み |
| TC-047-1 | must | ✅ | typecheck green |
| TC-047-2 | must | ✅ | test green (136 files, 1343 tests) |
| TC-047-3 | must | ✅ | SESSION_TIMEOUT 不在確認済み |

must シナリオ 19 件中、実装済み 11 件。TC-041-3, TC-041-5, TC-043-1/2, TC-044-*, TC-045-* は未実装だが、TC-044/045 は integration テストであり単体テスト scope では coverage 限界がある点は考慮。TC-041-3/5 と TC-043-1/2 は単体テストで実装可能。
