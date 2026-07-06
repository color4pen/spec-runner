# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

3 findings were carried into this gate from code-review and cross-boundary-invariants.
All 3 were **LOW / non-blocking** and none involved an actual code fix — verified below.

### Finding 1: TC-015 — composeReviewerDescriptor 通過後の scope 保持テストなし

| Item | Value |
|------|-------|
| Source | code-review finding #1 |
| Original severity | LOW |
| Fix column in review-feedback-001.md | `no` (code-fixer は対象外) |
| Current state | テスト未追加のまま（`resolve-scope.test.ts` に `composeReviewerDescriptor` の import なし） |
| Regression? | **なし** — code-fixer はこの finding を修正していない（Fix: no）。コードはレビュー承認時と同一状態。 |

### Finding 2: TC-002 — forbiddenSurfaces array の deep-merge 置換テストなし

| Item | Value |
|------|-------|
| Source | code-review finding #2 |
| Original severity | LOW |
| Fix column in review-feedback-001.md | `no` (code-fixer は対象外) |
| Current state | `tests/config/merge.test.ts` に `forbiddenSurfaces` 固有のケースは未追加（`git diff main...HEAD` に変更なし） |
| Regression? | **なし** — code-fixer はこの finding を修正していない（Fix: no）。コードはレビュー承認時と同一状態。 |

### Finding 3: resolvePipelineForbiddenSurfaces がマジックストリング "fast" を使用

| Item | Value |
|------|-------|
| Source | cross-boundary-invariants finding F-01 |
| Original severity | LOW |
| cross-boundary-invariants verdict | approved（ブロッキングなし） |
| Current state | `src/config/schema.ts:1196` に `pipelineId === "fast"` リテラルが残存。`PIPELINE_IDS.FAST` は未使用。 |
| Regression? | **なし** — cross-boundary-invariants が承認済みの状態から変化していない。動作上の欠陥は現時点でない（`"fast" === PIPELINE_IDS.FAST` は成立）。 |

## Summary

3 件すべて、コードレビュー承認時点から変化のない「意図的に修正されなかった LOW 指摘」。
code-fixer はいずれの finding も修正しておらず（`findingsPath: null`、`status: success`）、
cross-boundary-invariants も3件目をブロッキングなしで承認している。

回帰（一度修正された finding が復活）は確認されなかった。
