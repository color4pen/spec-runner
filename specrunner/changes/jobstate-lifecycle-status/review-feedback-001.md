# Code Review — jobstate-lifecycle-status — Iteration 1

## Summary

JobStatus lifecycle の再設計。`awaiting-resume` / `canceled` の追加、ResumePoint schema、Pipeline の escalation/exhaustion 遷移変更、SIGINT handler の worktree 保持、ps / assertJobFinishable / validateJobState の対応。設計に忠実な実装。型安全性の活用（exhaustive switch）が良い。テスト 963 件全 green、typecheck clean。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.00** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/cli/ps.ts:66 | TTY STATUS 列の `padEnd(12)` に対し `"running (stale?)"` は 17 文字、`"awaiting-resume"` は 15 文字で溢れる。列がズレる（`"awaiting-merge"` 14 文字も既存で溢れていた）。 | `padEnd(12)` → `padEnd(18)` に変更。header の `"STATUS".padEnd(12)` も同様に合わせる。 |
| 2 | MEDIUM | correctness | src/state/schema.ts:322-325 | `resumePoint` validation が `typeof === "object"` の浅いチェックのみ。`resumePoint: {}` や `{ step: 123 }` が通過し、runtime で `resumePoint.step` アクセス時に予期しない値になる。 | `step` (string), `reason` (string), `iterationsExhausted` (number) の型チェックを追加する。 |
| 3 | LOW | consistency | src/core/pipeline/pipeline.ts:13-18 | `FATAL_ERROR_CODES` に `AGENT_STEP_FAILED` が含まれない。design.md D3 では例示されているが D8 の定義リストには含まれていない。意図的な除外であれば D3 の文言を修正すべき。 | design.md D3 から `AGENT_STEP_FAILED` の言及を削除するか、コメントで「D8 が definitive list」と明記する。 |
| 4 | LOW | testing | tests/ | SIGINT handler による `awaiting-resume` 遷移 + worktree 保持のシナリオは unit test なし。signal handler のテストは困難だが、`signalCleanup` を分離して `updateJobState` 呼び出しだけ検証可能。 | `signalCleanup` の状態遷移ロジックを抽出した関数に分離し、unit test を追加する（signal 送信自体はテスト不要）。 |

## Verdict

- **verdict**: approved

## Rationale

CRITICAL: 0, HIGH: 0。Total 8.00 ≥ 7.0 threshold。

MEDIUM 2 件はいずれも機能破壊ではない：
- #1 は表示上の列ズレ（pre-existing: `awaiting-merge` も同様に溢れていた）
- #2 は defensive validation の深さ。現状の producer は正しい shape を書くため、実害は legacy/手動編集時のみ

両方とも次の改善サイクルで対応可能。
