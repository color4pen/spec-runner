# Code Review — finish-phase2-merge-state-polling — Iteration 1

## Summary

Phase 2 post-push polling の新設は設計どおり実装されている。`pollMergeStateAfterPush` は Phase 0 の `fetchPrViewWithRetry` と明確に分離され、SRP を維持している。retry 条件（非 CLEAN すべて）、上限到達時の非 escalation 挙動、テスト用の `sleepFn` 注入すべて仕様に準拠。delta spec の 4 シナリオ中 3 つにユニットテストがあるが、`gh pr view` 失敗パスのテストが欠落している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/core/finish/preflight.test.ts | delta spec の「polling 中の gh pr view 失敗」シナリオ（exitCode !== 0）のテストが未実装。実装は正しく処理するが検証がない | `spawn` が `exitCode: 1` を返すモックで `pollMergeStateAfterPushForTest` を呼び、`mergeStateStatus === ""` を assert するテストを追加 |
| 2 | MEDIUM | testing | tests/unit/core/finish/preflight.test.ts | JSON parse 失敗パス（stdout が不正 JSON）のテストが未実装 | `spawn` が `exitCode: 0, stdout: "not-json"` を返すモックで `mergeStateStatus === ""` を assert するテストを追加 |
| 3 | LOW | maintainability | src/core/finish/preflight.ts:359 | `slug` パラメータを `_slug` で受けており未使用。API 一貫性のために残す意図は理解できるが、将来のログ出力等で使わないなら不要 | パラメータから `slug` を除去するか、polling ログメッセージに slug を含める（`Post-push polling [${slug}]: ...`） |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | retry ロジック、CLEAN 判定、exhaustion 時の fallback すべて正しい |
| security | 9 | セキュリティ表面の変更なし |
| architecture | 8 | 専用関数で SRP 維持。既存 `fetchPrViewWithRetry` に影響なし |
| performance | 8 | injectable sleep で制御可能。最大 15 秒の追加待ちは許容範囲 |
| maintainability | 7 | 未使用パラメータが minor マイナス。コメント・命名は良好 |
| testing | 6 | delta spec 4 シナリオ中 3 つ実装済み。error path 2 つが未検証 |

## Total

`Total = 9×0.30 + 9×0.25 + 8×0.15 + 8×0.10 + 7×0.10 + 6×0.10 = 2.70 + 2.25 + 1.20 + 0.80 + 0.70 + 0.60 = 8.25`

- **verdict**: approved

## Notes

- orchestrator.ts の `||` fallback（`postPushPoll.mergeStateStatus || prViewData.mergeStateStatus`）は、exhaustion 時に Phase 0 の値に戻る。最後の observed status を返す方が diagnostic に有用だが、tasks.md で明示的に「空文字を返す」選択がされており、Phase 3 が最終 guard として機能するため問題なし。
- orchestrator.test.ts は既存の汎用 `gh pr view` mock が `pollMergeStateAfterPush` にも応答するため、追加修正不要で tests pass している。
