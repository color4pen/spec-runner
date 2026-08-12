# Regression Gate Result — test-generation-type-gate (Iteration 1)

## Verification Summary

| Finding | Severity | Status |
|---------|----------|--------|
| T-02: tasks.md T-02 ファイル名未指定 | LOW | ✅ Fixed |
| T-05: build 失敗 + 免除 type + coverage 設定の組み合わせが未明示 | LOW | ✅ Fixed |
| TC-012: SPEC_REVIEW→SPEC_FIXER 行と SPEC_REVIEW→IMPLEMENTER(exempt) 行の順序未固定 | LOW | ✅ Fixed |
| specFixerForwardsToImplementer JSDoc に conformance context invariant 未文書化 | MEDIUM | ⚠️ Present |
| TC-006: conformance-triggered chore spec-fixer → SPEC_REVIEW 遷移のテスト欠如 | LOW | ⚠️ Present |

---

## Finding Detail

### ✅ T-02: tasks.md T-02 ファイル名未指定 — FIXED

`tasks.md` T-02 冒頭に `src/core/pipeline/test-gen-exemption.ts` が明示されている（line 26）。
ファイルも `src/core/pipeline/test-gen-exemption.ts` として実際に作成されており回帰なし。

### ✅ T-05: build 失敗 + 免除 type + coverage 設定の組み合わせが未明示 — FIXED

`tasks.md` T-05 acceptance criteria に以下が追記されている（lines 106–107）:

> build が失敗している場合でも coverage の skip 理由は `test-generation-exempt request type: chore` のままとなり、
> `previous command failed` にならないことも assert する（D4: 免除チェックは failed チェックより前に評価される）。

回帰なし。

### ✅ TC-012: 行順序の未固定 — FIXED

`src/core/pipeline/__tests__/test-gen-exemption.test.ts` lines 193–211 に以下のテストが追加されている:

```typescript
it("TC-012: SPEC_REVIEW→SPEC_FIXER (specReviewHasRoutableFixables) row precedes
    SPEC_REVIEW→IMPLEMENTER (isTestGenExempt) row", ...)
```

`specFixerIdx < exemptIdx` を `expect` で固定している。回帰なし。

---

### ⚠️ specFixerForwardsToImplementer JSDoc に conformance context invariant 未文書化 — PRESENT

**File**: `src/core/pipeline/test-gen-exemption.ts` line 46

`spec-observation.ts` の `specFixerForwardsToTestGen` は lines 66–73 にて下記 invariant を文書化している:

> Test fixtures that simulate a conformance-triggered entry must use ordered timestamps
> AND provide toolResult.findings on the conformance StepRun; otherwise
> getConformanceFixContext returns null here and the guard silently passes, routing
> incorrectly to test-case-gen.

`test-gen-exemption.ts` の `specFixerForwardsToImplementer` JSDoc（lines 34–47）は
"not a conformance/needs-fix path" と述べるのみで、この fixture setup invariant を継承していない。
修正: JSDoc に「conformance-triggered エントリのフィクスチャには順序付きタイムスタンプと
toolResult.findings が必要（spec-observation.ts の specFixerForwardsToTestGen 参照）」を追記する。

### ⚠️ TC-006: conformance-triggered 経路のテスト欠如 — PRESENT

**File**: `src/core/pipeline/__tests__/test-gen-exemption.test.ts` line 117 付近

TC-006 は観測修正パス（`specFixerForwardsToTestGen=true` かつ chore）で
`SPEC_FIXER → IMPLEMENTER` を固定するが、conformance-triggered 経路
（conformance StepRun あり + 正しいタイムスタンプ順序 + toolResult.findings）での
`specFixerForwardsToImplementer=false` および `SPEC_FIXER → SPEC_REVIEW` 遷移を
直接アサートするテストが現在の実装に存在しない。

TC-015 は `specFixerForwardsToTestGen=false` の側面をカバーするが、conformance context を
持つフィクスチャを用いたエンドツーエンド遷移固定ではない。
修正: conformance StepRun（`verdict: "needs-fix:spec-fixer"`、conformance.endedAt > spec-review.endedAt、
`toolResult.findings` 非 null）を持つ chore fixture で
`specFixerForwardsToImplementer=false` かつ `SPEC_FIXER/approved → SPEC_REVIEW` を assert するテストを追加する。

---

## Evidence

- Checked: 5 findings
- Skipped: 0
- Unverified: 0

### Files inspected

- `specrunner/changes/test-generation-type-gate/tasks.md` — T-02, T-05 確認
- `src/core/pipeline/__tests__/test-gen-exemption.test.ts` — TC-006, TC-012, TC-015 確認
- `src/core/pipeline/test-gen-exemption.ts` — JSDoc 確認
- `src/core/pipeline/spec-observation.ts` — conformance context invariant 参照元確認
