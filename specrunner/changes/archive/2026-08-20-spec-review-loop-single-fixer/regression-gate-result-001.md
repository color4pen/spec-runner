# Regression Gate Result — spec-review-loop-single-fixer (iteration 1)

## Ledger Verification (7 findings)

### Finding 1 — [HIGH] spec-review-fixer-routing.test.ts が T-08 の更新対象に含まれていない

**Status: FIXED**

`src/core/step/__tests__/spec-review-fixer-routing.test.ts` の `makeCanonScope()`（line 108）に `TEST_CASES_MD` が追加され、spec-fixer writableByFixer に含まれている。TC-013（line 949/980）は `"approved"` を期待するよう更新済み。4b 分岐削除後も `medium test-cases.md finding → approved` が成立する。

---

### Finding 2 — [MEDIUM] src/prompts/rules.ts が T-01 の更新対象に含まれていない

**Status: FIXED**

`src/prompts/rules.ts` line 48 の spec-fixer 行が `change folder 内の spec.md, design.md, tasks.md, test-cases.md` に更新済み。system prompt との矛盾解消。

---

### Finding 3 — [LOW] spec-observation.ts の specReviewHasRoutableFixables JSDoc が T-01 更新対象に含まれていない

**Status: FIXED**

`src/core/pipeline/spec-observation.ts` lines 27-28 の JSDoc が `(spec.md, design.md, tasks.md, test-cases.md)` に更新済み。

---

### Finding 4 — [MEDIUM] T-08 が STANDARD_TRANSITIONS.length カウント変化を pin する 3 テストを列挙していない

**Status: FIXED**

4 ファイルすべてのカウント pin が 47→45 に更新済み:
- `tests/unit/core/pipeline/pipeline.transitions.test.ts:275` → `toBe(45)`
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts:1430` → `toBe(45)`
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts:1224` → `toBe(45)`
- `tests/unit/pipeline/transition-when.test.ts:196` → `toBe(45)`

---

### Finding 5 — [MEDIUM] TC-006 (#1015 歯) のテストが behavioral でなく structural proxy に留まる

**Status: FIXED (partial — per finding's own scope)**

Finding が提案した TC-009（should）が `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` の TC-011/TC-009 として実装済み（lines 601-609）。`SPEC_FIXER_SYSTEM_PROMPT` に `"test-cases.md"` と `"再生成はしない"` が含まれることを pin。`tests/pipeline-integration.test.ts:1827` の structural proxy（`testCaseGenSteps.length === 1`）は design.md Risk セクションで意図的な代用と認定されており、finding の説明（「部分的に閉じられる」）の範囲内で対処済み。

---

### Finding 6 — [LOW] specFixerObservationForward のコメントが test-case-gen ループ削除後も旧設計を参照している

**Status: NOT FIXED (still present)**

`src/core/pipeline/spec-observation.ts:56` のコメントが依然として旧文言のまま:
```
* (test-case-gen already ran before spec-review; observation pass goes directly to implementer)
```
test-case-gen はループから除去されており、observation pass の理由付けが実態と乖離している。1 行コメント更新で完結する。

---

### Finding 7 — [LOW] spec-fixer write scope 拡張が conformance 経路の escalation 判定を暗黙に変更する

**Status: NOT FIXED (still present)**

`src/core/step/judge-verdict.ts:173` の `deriveConformanceVerdict` に、`test-cases.md` finding（`fixTarget: "spec-fixer"` を持つ）が PR 前は escalation だったが PR 後は `needs-fix:spec-fixer` になるという暗黙の変化を明文化する doc コメントまたはテストが追加されていない。`tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts` には `conformance + tasks.md + fixTarget:spec-fixer = needs-fix:spec-fixer` のピンはあるが、`test-cases.md` の同等ピンは存在しない。

---

## Evidence Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | HIGH | Fixed |
| 2 | MEDIUM | Fixed |
| 3 | LOW | Fixed |
| 4 | MEDIUM | Fixed |
| 5 | MEDIUM | Fixed (partial, per finding scope) |
| 6 | LOW | **Still present** |
| 7 | LOW | **Still present** |
