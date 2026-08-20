# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### AC1: 再現テスト（TC-017）が追加され green

`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` line 1568〜1769 に TC-017 `describe` ブロック追加済み。4 点 pin すべて確認:

| Pin | アサーション | 実装行 | 結果 |
|-----|-------------|--------|------|
| 1 | `result.status === "awaiting-archive"` かつ `error.code !== "SPEC_REVIEW_RETRIES_EXHAUSTED"` | 1752-1753 | ✅ |
| 2 | `budgetSkippedEvents[0].step === "spec-review"` / `fixer === "spec-fixer"` | 1756-1758 | ✅ |
| 3 | warning history に `"proceeding to"` 文言あり | 1761-1764 | ✅ |
| 4 | `implementerCallCount >= 1` | 1767 | ✅ |

テスト実行: `bun run test tests/core/.../pipeline.approved-not-overturned-by-fixer-budget.test.ts` → **29 passed | 1 skipped (30)**

`specReviewHasRoutableFixables` 発火確認: `state.request.slug = "approved-reroute-unconditional-row"` + `finding.file = "specrunner/changes/approved-reroute-unconditional-row/spec.md"` により `buildCanonWriteScopeFromState` が `writableByFixer["spec-fixer"]` に当該パスを含める（`canon-write-scope.ts:43`）。guarded `spec-review → spec-fixer` 行が選択され T-03 が発火する条件を満たす。

ファイル冒頭 TC 一覧（line 20）に `TC-017` 追記済み。

### AC2: cleanTransition 探索の置換

`pipeline.ts:478-486` の探索条件:

```ts
const cleanTransition = this.transitions.find(
  (t) =>
    t.step === currentStep &&
    t.on === "approved" &&
    t.to !== budgetSkippedFixer &&
    t.to !== "end" &&
    t.to !== "escalate" &&
    t.when === undefined,
);
```

`fixerNamesForReroute` への参照が探索条件から消えていることを `grep fixerNamesForReroute pipeline.ts` で確認: line 458（構築）/ line 462（発火判定 `has(nextStep)`）/ line 475（コメント言及）のみ — 探索条件への参照なし。

### AC3: T-03 発火判定・ガード・予算チェックが無変更

| 項目 | 実装行 | 内容 |
|------|--------|------|
| 発火判定 `fixerNamesForReroute.has(nextStep)` | 462 | 変更なし |
| `currentStep === exhaustedReviewer` ガード | 472 | 変更なし |
| fixer 入場前予算チェック | 590-596 | 変更なし |

### AC4: 既存テスト無改変で green

`bun run test` 全体実行: **791 test files / 11808 passed | 1 skipped | 2 todo** — 全 green。TC-001 / TC-014 / TC-016 を含む既存 29 tests が無改変で通過。

### AC5: typecheck / test green

- `bun run typecheck` exit code 0
- `bun run test` exit code 0

### Spec Requirements 適合確認

**Requirement 1** (SHALL): `t.when === undefined` + `t.to !== budgetSkippedFixer` + end/escalate 除外。`loopFixerPairs` values 全除外なし。Scenario を TC-017 で完全再現・green。✅

**Requirement 2** (MUST NOT halt): TC-017 pin1 `status !== "awaiting-resume"` / `error.code !== "SPEC_REVIEW_RETRIES_EXHAUSTED"` green。✅

**Requirement 3** (SHALL remain unchanged): TC-001（code-review 版 T-03）が無改変で green。✅

### T-03 コメント更新確認

`pipeline.ts:431-451` のブロックコメントが更新済み。新機能定義（`cleanTransition = unconditional row / 除外は budgetSkippedFixer 単体`）を明記。DESTRUCTION CONFIRMATION（TC-014 再現手順）は保持（line 452-456）。

## 検証できなかった項目

None

## Findings 詳細

None
