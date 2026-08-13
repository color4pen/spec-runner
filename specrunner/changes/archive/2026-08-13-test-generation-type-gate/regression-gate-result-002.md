# Regression Gate Result — Iteration 002

## Evidence

- **Checked**: 5 findings
- **Skipped**: 0
- **Unverified**: 0

---

## Finding Verification

### [LOW] T-02: 新規 predicate モジュールのファイル名が未指定
**Status**: FIXED

`tasks.md` T-02 の冒頭行（line 26）に `src/core/pipeline/test-gen-exemption.ts` のファイル名が明示されている。

> `src/core/pipeline/test-gen-exemption.ts` を新設（spec-observation.ts / reverification.ts と同配置・同スタイル）

ファイル名は指定済み。回帰なし。

---

### [LOW] T-05: build 失敗 + 免除 type + coverage 設定ありの組み合わせが未明示
**Status**: FIXED

T-05 の 4 番目の bullet（coverage 明示 skip）に以下の文言が追記されている（tasks.md lines 104–108）:

> build が失敗している場合でも coverage の skip 理由は `test-generation-exempt request type: chore` のままとなり、`previous command failed` にならないことも assert する（D4: 免除チェックは failed チェックより前に評価される）。

Acceptance Criteria は「上記 5 観点のテストが green」と参照しており、上記の第 4 観点がこの組み合わせを包含する。TC-014 がこれをカバーするテストとして実装されている。回帰なし。

---

### [LOW] TC-012 が SPEC_REVIEW→SPEC_FIXER 行と SPEC_REVIEW→IMPLEMENTER(exempt) 行の順序をピンしていない
**Status**: FIXED

`src/core/pipeline/__tests__/test-gen-exemption.test.ts` lines 193–211 に以下のテストが追加されている:

```typescript
it("TC-012: SPEC_REVIEW→SPEC_FIXER (specReviewHasRoutableFixables) row precedes SPEC_REVIEW→IMPLEMENTER (isTestGenExempt) row", () => {
  const specFixerIdx = STANDARD_TRANSITIONS.findIndex(
    (t) => t.step === STEP_NAMES.SPEC_REVIEW && t.on === "approved" && t.to === STEP_NAMES.SPEC_FIXER && t.when !== undefined,
  );
  const exemptIdx = STANDARD_TRANSITIONS.findIndex(
    (t) => t.step === STEP_NAMES.SPEC_REVIEW && t.on === "approved" && t.to === STEP_NAMES.IMPLEMENTER && t.when !== undefined,
  );
  expect(specFixerIdx).toBeLessThan(exemptIdx);
});
```

`specReviewHasRoutableFixables` 行が `isTestGenExempt` 行より前にあることが固定されている。回帰なし。

---

### [MEDIUM] specFixerForwardsToImplementer の JSDoc に conformance context 検出 invariant の文書化がない
**Status**: FIXED

`src/core/pipeline/test-gen-exemption.ts` lines 43–53 の JSDoc に以下の invariant が文書化されている:

```typescript
 * ⚠ Fixture invariant (inherited from specFixerForwardsToTestGen):
 * The conformance-path exclusion inside specFixerForwardsToTestGen requires:
 *   (a) conformance StepRun has verdict `needs-fix:spec-fixer`, AND
 *   (b) conformance.endedAt >= spec-review.endedAt (ordered timestamps), AND
 *   (c) conformance StepRun has toolResult.findings (non-null).
 * Test fixtures that simulate a conformance-triggered entry MUST supply ordered
 * timestamps AND toolResult.findings; omitting either causes getConformanceFixContext
 * to return null, making the guard silently pass and route to implementer incorrectly.
```

load-bearing invariant が継承文書化されている。回帰なし。

---

### [LOW] TC-006 が conformance-triggered chore spec-fixer → SPEC_REVIEW 遷移をアサートしていない
**Status**: STILL PRESENT

`src/core/pipeline/__tests__/test-gen-exemption.test.ts` の TC-006（lines 117–128）は観測修正パス（`specFixerForwardsToTestGen=true` かつ chore）で SPEC_FIXER → IMPLEMENTER をテストするが、conformance-triggered 経路（conformance StepRun あり、正しいタイムスタンプ順序 + `toolResult.findings`）での `specFixerForwardsToImplementer=false` および SPEC_FIXER → SPEC_REVIEW 遷移を直接アサートするテストは存在しない。

ファイル全体を検索した結果、"conformance" というキーワードは test-gen-exemption.test.ts に一切出現しない。TC-015（lines 238–261）は AND 合成の false 側（spec-review approved でない場合、spec-review ランが無い場合）をカバーするが、conformance context を持つフィクスチャを用いたケースはない。

元 finding の状態が維持されており、回帰（再現）している。
