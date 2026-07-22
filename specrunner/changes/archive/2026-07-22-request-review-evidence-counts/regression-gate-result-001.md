# Regression Gate Result — request-review-evidence-counts — iter 1

## 検証した項目

### Findings Ledger: 1 件（[LOW] buildRequestReviewInitialMessage ステップ 6 フォーマット例に evidence 未反映）

**検証コマンド**: `git diff main...HEAD -- src/prompts/request-review-system.ts`

**結果**: `src/prompts/request-review-system.ts` への変更は以下の 2 点のみ:
1. `EVIDENCE_COUNTS_DEFINITION` を `judge-rules.ts` から import に追加
2. `REQUEST_REVIEW_BASE`（システムプロンプト本体）の `${OBSERVATION_DEFINITION}` 直後に `${EVIDENCE_COUNTS_DEFINITION}` を注入

**line 170 の現在のコード**:
```
6. Report your completion result with { ok: true, findings: [...] }${attestationStep}
```

`buildRequestReviewInitialMessage` の step 6 フォーマット例は `evidence` フィールドを含まない。
`parseRequestReviewReportInput` は `ok=true` の新規報告で `evidence` を必須化しているため、
このフォーマット例を文字通りに実行すると parse 失敗 → retry が強制される経路が残っている。

**判定**: 修正なし（regression — fix は適用されていない）

## 検証できなかった項目

None

## Findings 詳細

### [HIGH] buildRequestReviewInitialMessage ステップ 6 フォーマット例に evidence が未反映（regression）

- **File**: src/prompts/request-review-system.ts
- **Line**: 170
- **Resolution**: fixable
- **Rationale**: cross-boundary-invariants が指摘した「buildRequestReviewInitialMessage のステップ 6 フォーマット例 `{ ok: true, findings: [...] }` に evidence が含まれない」問題は修正されていない。`parseRequestReviewReportInput` は `ok=true` の新規報告で evidence を必須化したため、初期メッセージのフォーマット例のとおりに完了報告を行うとすべての request-review セッションで parse 失敗 → 余分な retry が強制される。`EVIDENCE_COUNTS_DEFINITION` のシステムプロンプト注入（本 PR の変更）が安全網として機能するため correctness への影響はないが、per-session の不要な round-trip が継続して発生する。修正: line 170 のフォーマット例を `{ ok: true, findings: [...], evidence: { checked: N, skipped: N, unverified: N } }` に更新する。
