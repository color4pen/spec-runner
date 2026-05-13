# Spec Review: fix-worktree-lock-contention

- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-13
- **verdict**: approved

## Summary

request.md の要件に対して design.md / tasks.md が整合しており、実装計画は明確。修正対象を `local.ts` → `manager.ts` に変更した設計判断は正しい。

## Findings

### F1: 修正箇所の変更（Info）

request.md は `src/core/runtime/local.ts` の `setupWorkspace()` を指定しているが、design.md は `src/core/worktree/manager.ts` の `WorktreeManager.create()` に変更。`local.ts` には `manager.create()` 呼び出しが 3 箇所あり、manager 側で吸収する方が DRY で将来の呼び出し追加にも安全。妥当な設計改善。

### F2: リトライ回数の表現揺れ（Minor）

request.md は「最大3回リトライ」（= 4 attempts）と読める。design.md は `MAX_RETRIES = 3` で 3 attempts（= 2 retries）。tasks.md の TC-WTM-011 も 3 spawn で exhaust → throw を期待しており、design/tasks 間は一貫。実用上 3 attempts で十分だが、request.md の文言とは厳密にはズレがある。implementer は design.md の `MAX_RETRIES = 3`（3 attempts）に従えばよい。

### F3: sleepFn DI パターン（OK）

既存の `pr-status.ts` の `sleepFn` DI パターンに倣っており、テストで即時 resolve する mock を注入可能。positional optional param が 3 つ目になるが、bug-fix スコープとしては許容。将来的に options object に移行する際のリファクタ対象。

### F4: エラー検知ヒューリスティック（OK）

`stderr.includes("could not lock config file")` は git が出力する一意のメッセージ。false positive リスクは極めて低い。lock contention 以外のエラーはリトライせず即 throw — 既存動作を維持。

### F5: セキュリティ（N/A）

新たな外部入力・API 変更・認証フロー変更なし。`Math.random()` の jitter はセキュリティ用途ではなく競合分散目的なので十分。攻撃面の拡大なし。

## Test Coverage

TC-WTM-010/011/012 で以下を網羅:
- リトライ成功パス（2nd attempt で成功）
- リトライ枯渇パス（3 attempts 全失敗 → throw）
- 非 lock-contention エラーのスキップ（即 throw、sleep なし）

正常パスへの影響は既存 TC-WTM-001/002 で担保。

## Conclusion

スコープが絞られた bug-fix として適切。設計判断・テスト計画・リスク評価いずれも妥当。
