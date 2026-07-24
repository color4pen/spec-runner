# Implementation Notes: spec-observation-autofix

## 既存テスト 期待値変更一覧

### `src/core/step/__tests__/spec-review-fixer-routing.test.ts`

| TC ID | 変更内容 |
|-------|---------|
| TC-001 | `deriveSpecReviewVerdict(medium fixable on spec.md)` の期待を `needs-fix` → `approved` |
| TC-002 | `deriveSpecReviewVerdict(low fixable on design.md)` の期待を `needs-fix` → `approved` |
| TC-005 | `deriveStepCompletion` verdict（spec.md medium fixable）を `needs-fix` → `approved` |
| TC-013 | `deriveSpecReviewVerdict(medium fixable on tasks.md)` の期待を `needs-fix` → `approved` |
| TC-015 | `checked>0 with spec.md fixable (medium)` の期待を `needs-fix` → `approved` |

不変で green を確認した TC: TC-003, TC-004, TC-006, TC-007, TC-008, TC-010〜012, TC-016〜020

### `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts`

| TC ID | 変更内容 |
|-------|---------|
| TC-003 | `deriveSpecReviewVerdict` / `deriveStepCompletion` の 2 サブテストを `needs-fix` → `approved`（`escalationReason` 未設定は不変） |

不変で green を確認した TC: TC-004（needs-fix → spec-fixer 行）

### `tests/unit/core/pipeline/pipeline.transitions.test.ts`

| TC ID | 変更内容 |
|-------|---------|
| TC-030 | `STANDARD_TRANSITIONS.length` の期待を `44` → `46`（guarded 行 +2） |

### `tests/core/pipeline/pipeline.test.ts`

| TC ID | 変更内容 |
|-------|---------|
| TC-067 | spec-layer 遷移アサーションを更新。`find("spec-review", "approved")` の first-match が guarded 行（to: "spec-fixer"）になったため `findWithTo` で unconditional fallback を別途確認する構成に変更。同様に `find("spec-fixer", "approved")` も guarded 行（to: "test-case-gen"）first-match に対応 |

### `tests/unit/pipeline/transition-when.test.ts`

| TC ID | 変更内容 |
|-------|---------|
| TC-WHEN-02 | `STANDARD_TRANSITIONS.length` の期待を `44` → `46` |

---

## TC-CONFRT-07 フロー変化の記録（期待値変更なし）

`tests/unit/core/pipeline/pipeline.conformance-routing.test.ts` TC-CONFRT-07 は、すべてのステップに同一タイムスタンプ（`'2026-01-01T00:00:00.000Z'`）を使用している。

guarded 遷移追加後、conformance 起動の spec-fixer#3 において `getConformanceFixContext` の recency check（`>=` 条件：同一タイムスタンプ → equal → null）が `null` を返すため、`specFixerForwardsToTestGen` が `true` となり spec-fixer#3 は spec-review reverification をスキップして test-case-gen へ直行する。

最終アサーション（specFixerCallCount===3 / awaiting-archive）は引き続き通過するためテストは赤くならないが、本来の `conformance→spec-fixer→spec-review reverification` フローは検証されなくなる。

T-06 の新規テスト（`tests/unit/core/pipeline/spec-observation-autofix.test.ts`）が proper timestamps を用いた reverification 不変条件をカバーしている。
