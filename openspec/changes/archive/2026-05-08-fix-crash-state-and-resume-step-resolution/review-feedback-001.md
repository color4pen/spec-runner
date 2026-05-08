# Review Feedback — fix-crash-state-and-resume-step-resolution — iter 1

## Summary

実装は design.md / tasks.md に忠実。pipeline の 2 層 safety net（runInternal catch + run catch）と resolveResumeStep の 3 分岐ロジックは正しく機能する。既存テスト 1099 件全パス。要件 7-11 に対応するテストが追加されている。test-cases.md は未生成だが、request.md の要件に対するカバレッジは十分。

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | 2 層 safety net のフロー（fail → error → escalate → awaiting-resume）が正確。resolveResumeStep の 3 分岐は resumePoint の状態で正しく分岐する。既存テスト互換性も維持 |
| security | 8 | セキュリティ上の変更なし。エラーメッセージの外部露出はない（state ファイルに書き込まれるのみ） |
| architecture | 9 | executor に pipeline-level state 遷移の知識を持たせない責務分離が維持されている。defense in depth の 2 層構造は適切 |
| performance | 8 | 異常系パスでの追加 I/O（store.fail / store.persist）のみ。正常系への影響なし |
| maintainability | 8 | コメントが意図を明確に説明している。REVIEWER_STEPS 定数による判定は拡張可能 |
| testing | 8 | 要件 7-11 をすべてカバー。edge case（non-Error throw、non-reviewer + iterationsExhausted > 0）も網羅。pipeline crash テストは実際の persistence を検証しており信頼性が高い |

**Total**: 9×0.30 + 8×0.25 + 9×0.15 + 8×0.10 + 8×0.10 + 8×0.10 = 2.70 + 2.00 + 1.35 + 0.80 + 0.80 + 0.80 = **8.45**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | src/core/pipeline/pipeline.ts:92 | `(err as Error).message ?? String(err)` — Error でない throw（例: `throw "string"`）の場合、`(err as Error).message` は `undefined` になり `String(err)` にフォールバックするので動作するが、`reason` と `message` の 2 箇所で同じ式を書いている。ローカル変数に抽出すれば DRY になる | `const errMsg = (err as Error).message ?? String(err);` をブロック先頭に抽出し、`reason: errMsg, message: errMsg` で参照する |
| 2 | LOW | maintainability | src/core/pipeline/pipeline.ts:41 | `/** Loop name for stdout progress output ... */` のコメントが重複している（L41-42 で同一行が 2 回） | 重複コメント行を削除する |

## Iteration Comparison

N/A（iter 1）

## Verdict

- **verdict**: approved

CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2
Total score: 8.45 ≥ 7.0（pass threshold）
