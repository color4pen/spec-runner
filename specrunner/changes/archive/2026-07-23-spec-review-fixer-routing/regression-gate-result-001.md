# Regression Gate — spec-review-fixer-routing — Iteration 1

## Evidence

| Finding | File | Expected | Actual | Status |
|---------|------|----------|--------|--------|
| RED phase comment removal | `src/core/step/__tests__/spec-review-fixer-routing.test.ts:8–13` | コメント削除済み | "RED phase: these tests are intentionally red..." + T-01〜T-04 列挙が残存 | REGRESSION |
| types.ts:235 comment update | `src/core/pipeline/types.ts:235` | "loop exhaustion または CANON_FINDING_ESCALATION" の両経路を記述 | "judge halt via loop exhaustion only" のまま（未変更） | REGRESSION |
| run.ts:124 error code list update | `src/core/pipeline/run.ts:124–125` | CANON_FINDING_ESCALATION を追記 | SPEC_REVIEW_RETRIES_EXHAUSTED のみ記載（CANON_FINDING_ESCALATION 欠落） | REGRESSION |

## Verification details

`git diff main...HEAD --name-only` で変更されたファイルを確認:

- `src/core/pipeline/types.ts` — **変更なし**（branch 内で一切 diff なし）
- `src/core/pipeline/run.ts` — **変更なし**（branch 内で一切 diff なし）
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — 新規追加（RED phase コメント含むまま）

3 件の fixing が施されたという claim に対し、いずれも現コードに反映されていないことを直接読取で確認。

## Checked items

- checked: 3（全件直接読取で確認）
- skipped: 0
- unverified: 0
