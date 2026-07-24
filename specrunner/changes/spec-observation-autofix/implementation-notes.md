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

## TC-CONFRT-07 フロー変化の記録（期待値変更あり）

`tests/unit/core/pipeline/pipeline.conformance-routing.test.ts` TC-CONFRT-07 は、code-fixer commit（7ce103215）で以下の修正を実施済み。

**修正内容:**
- conformance#1 呼び出しに `ts: "2026-01-01T01:00:00.000Z"`（spec-review のデフォルト `'2026-01-01T00:00:00.000Z'` より厳密に後）と `toolResult.findings` を付与。これにより `getConformanceFixContext` の recency check（step 3: `>=`）と findings check（step 4）が両方通過し、`specFixerForwardsToTestGen` が `false` を返して spec-fixer#3 が spec-review reverification へ正しくルーティングされる。
- `expect(specReviewCallCount).toBe(4)` を追加。spec-review が spec-fixer#3 の後に 1 回（reverification）余分に呼ばれることを明示的にアサートし、`conformance→spec-fixer→spec-review reverification` 不変条件を Pipeline 統合レベルで固定する。

**reverification 不変条件のカバレッジ:**
- TC-CONFRT-07（`tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`）: Pipeline 統合レベル（budget-reset との組合せ）
- TC-010（`tests/unit/core/pipeline/spec-observation-autofix.test.ts`）: predicate 単体レベル（proper timestamps + findings を持つ state で `specFixerForwardsToTestGen` が `false` を返すことを確認）
