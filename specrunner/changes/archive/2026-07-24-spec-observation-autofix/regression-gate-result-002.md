# Regression Gate Result — Iteration 002

## Ledger Findings Verification

### [HIGH] TC-CONFRT-07 が conformance reverification 経路でなく observation-pass 経路を無言で通過している

**File**: tests/unit/core/pipeline/pipeline.conformance-routing.test.ts

**Status: FIXED ✅**

**Evidence**:
- `appendStepResult` が `opts.ts` / `opts.findings` を受け取る overload に拡張済み（lines 102–143）
- conformance#1 呼び出しに `ts: "2026-01-01T01:00:00.000Z"` を付与（spec-review のデフォルト `"2026-01-01T00:00:00.000Z"` より厳密に後）→ `getConformanceFixContext` の recency check（`conformance.endedAt >= spec-review.endedAt`）が通過
- conformance#1 呼び出しに `toolResult.findings` を付与 → `getConformanceFixContext` の findings check（step 4）も通過
- `expect(specReviewCallCount).toBe(4)` を追加（line 564）→ spec-fixer#3 が test-case-gen ではなく spec-review reverification へ進むことを Pipeline 統合レベルで明示的にアサート
- コメント（lines 537–542）が両条件の必要性と、不足時の silent false-negative リスクを説明

---

### [MEDIUM] specFixerForwardsToTestGen の conformance guard が同一タイムスタンプ state で false negative を生じる

**File**: src/core/pipeline/spec-observation.ts:60

**Status: FIXED ✅**

**Evidence**:
- `specFixerForwardsToTestGen` 内の Condition 1 ブロック（lines 61–73）に以下を明記するコメントを追加:
  - `getConformanceFixContext` が non-null を返す 3 条件: (a) verdict `needs-fix:spec-fixer`、(b) `conformance.endedAt >= spec-review.endedAt`（recency check、inclusive `>=`）、(c) `toolResult.findings` 非 null
  - production では逐次実行により (b) が常に成立すること
  - テストフィクスチャが conformance-triggered entry をシミュレートするには ordered timestamps と `toolResult.findings` の両方が必要であること
- これにより `>=` recency check の load-bearing な役割と、同一タイムスタンプ fixture が guard を無効化するリスクが文書化された

---

### [LOW] TC-CONFRT-07 記述が実装より保守的で stale

**File**: specrunner/changes/spec-observation-autofix/implementation-notes.md

**Status: FIXED ✅**

**Evidence**:
- 「TC-CONFRT-07 フロー変化の記録（期待値変更あり）」節（lines 45–55）を追加
- 修正内容として以下を正確に記載:
  - `ts: "2026-01-01T01:00:00.000Z"` と `toolResult.findings` の付与
  - `expect(specReviewCallCount).toBe(4)` の追加
  - `getConformanceFixContext` の recency check と findings check が両方通過することで `specFixerForwardsToTestGen` が `false` を返す仕組み
- reverification 不変条件のカバレッジ（TC-CONFRT-07: Pipeline 統合レベル、TC-010: predicate 単体レベル）も記載
- 旧来の「期待値変更は不要」という under-reporting は解消

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| TC-CONFRT-07 が reverification 経路を無言で通過 | HIGH | Fixed |
| specFixerForwardsToTestGen の conformance guard コメント欠如 | MEDIUM | Fixed |
| TC-CONFRT-07 記述が stale | LOW | Fixed |

3 件すべて修正確認済み。リグレッションなし。
