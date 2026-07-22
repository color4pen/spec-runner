# Regression Gate Result — Iteration 002

## Ledger Findings Verification

### [LOW] buildRequestReviewInitialMessage のステップ 6 フォーマット例に evidence が未反映

**Status**: Fixed — no regression

**Evidence**:

`git diff main...HEAD -- src/prompts/request-review-system.ts` により、該当箇所の変更を確認した。

`src/prompts/request-review-system.ts` 行 170（旧 166 相当）:

```
- 6. Report your completion result with { ok: true, findings: [...] }
+ 6. Report your completion result with { ok: true, findings: [...], evidence: { checked: N, skipped: N, unverified: N } }
```

ファイルを直接読んだ結果（行 170）:

```
6. Report your completion result with { ok: true, findings: [...], evidence: { checked: N, skipped: N, unverified: N } }${attestationStep}
```

フォーマット例に `evidence: { checked: N, skipped: N, unverified: N }` が追加されており、
`parseRequestReviewReportInput` が ok=true で evidence を必須とする実装と整合している。

**Verdict**: 修正済み、リグレッションなし

## Summary

- Checked: 1 finding
- Regressions: 0
- Contradictions: 0
