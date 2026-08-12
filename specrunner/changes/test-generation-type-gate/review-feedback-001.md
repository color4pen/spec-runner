# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだ・確認したファイル

| ファイル | 確認内容 |
|---------|---------|
| `src/config/type-config.ts` | `testGenRequired` フラグ追加、`isTestGenRequired` 関数実装 |
| `src/core/pipeline/test-gen-exemption.ts` | 新規 predicate モジュール |
| `src/core/pipeline/types.ts` | `STANDARD_TRANSITIONS` への 3 行挿入と順序 |
| `src/core/verification/runner.ts` | `requestType` plumbing、exempt check の実装と評価順序 |
| `src/core/step/verification.ts` | `deps.request.type` の第 5 引数渡し |
| `src/core/pipeline/spec-observation.ts` | `specFixerForwardsToTestGen` の条件確認 |
| `src/core/pipeline/compose-reviewers.ts` | custom reviewer 合成時の filter が新行を保持することを確認 |
| `src/core/pipeline/pipeline.ts:450-469` | approved re-route 補正が `when` guard を尊重することを確認 |
| `src/core/pipeline/__tests__/test-gen-exemption.test.ts` | TC-004〜007、TC-012、TC-015、TC-016 |
| `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` | TC-026 / TC-027 が IMPLEMENTER→BITE_EVIDENCE 行の残存を確認 |
| `tests/config/type-config.test.ts` | TC-001、TC-002、TC-003、TC-011 |
| `tests/unit/verification/runner-test-gen-exemption.test.ts` | TC-008〜010、TC-013、TC-014 |
| `src/state/schema/types.ts` | `request.type: string` が non-nullable であることを確認 |

### 実行した検証コマンド

- `bun run typecheck` → **green**
- `bun run test` → **11321 passed, 1 skipped, 757 test files** (全スイート)
- 新規テストファイル単体（73 tests、3 files） → **all green**
- `tests/unit/verification/runner-commands.test.ts` → **11 passed** (既存テスト無改変確認)
- `src/core/pipeline/__tests__/standard-transitions.test.ts` → **9 passed** (既存テスト無改変確認)

### 受け入れ基準の充足確認

| AC | 充足 | 根拠 |
|----|-----|------|
| chore: SPEC_REVIEW → IMPLEMENTER → VERIFICATION（test-case-gen / test-materialize / bite-evidence を通らない） | ✓ | TC-004, TC-005 |
| unknown type fail-closed | ✓ | TC-003 |
| 免除 type: coverage gate skip + 理由明示 | ✓ | TC-008 |
| 免除 type: verification コマンド実行維持 | ✓ | TC-010 |
| 既存テスト無改変 green | ✓ | 757 test files 全 pass |
| typecheck && test green | ✓ | 両方 green |

### 実装の正確性確認

**遷移順序（first-match-wins）**

`STANDARD_TRANSITIONS` の SPEC_REVIEW/approved 行の順序:
1. `→ SPEC_FIXER when specReviewHasRoutableFixables`（既存）
2. `→ IMPLEMENTER when isTestGenExempt`（新規）
3. `→ TEST_CASE_GEN`（unconditional、既存）

chore（routable fixable なし）: 1=false → 2=true → IMPLEMENTER ✓
chore（routable fixable あり）: 1=true → SPEC_FIXER（その後 specFixerForwardsToImplementer で IMPLEMENTER） ✓
new-feature（routable fixable なし）: 1=false → 2=false → 3 → TEST_CASE_GEN ✓

**coverage gate 評価順序**

`finalizeVerificationRun` 内の分岐順:
1. exempt check（`requestType !== undefined && !isTestGenRequired(requestType)`） → skipped（免除理由）
2. `failed` check → skipped（前工程失敗）
3. gate 実行

build 失敗 + chore のとき: exempt check が先行 → "test-generation-exempt request type: chore" で skip → "previous command failed" は含まれない（TC-014 で固定）。

**compose-reviewers.ts 互換性**

`baseTransitions.filter()` は `code-review / code-fixer / regression-gate / custom-reviewer` step のみを除去する。新規 3 行（`SPEC_REVIEW→IMPLEMENTER`、`SPEC_FIXER→IMPLEMENTER`、`IMPLEMENTER→VERIFICATION`）はいずれも filter 対象外であり、custom reviewer 合成後も保持される。

**approved re-route 補正（pipeline.ts:459）**

```ts
const cleanTransition = this.transitions.find(
  (t) => t.step === currentStep && t.on === "approved"
       && !fixerNamesForReroute.has(t.to) && (!t.when || t.when(state))
);
```

chore（spec-review approved、spec-fixer budget exhausted）: `SPEC_REVIEW→IMPLEMENTER when isTestGenExempt` の when が true → IMPLEMENTER に正しく re-route される。

## 検証できなかった項目

- 実際の pipeline 実行（managed / local runtime）での end-to-end 確認（sandbox 外の外部通信が必要）。ただし unit/integration テストがカバー範囲を網羅している。

## Findings 詳細

### F-001: TC-012 が `SPEC_REVIEW → SPEC_FIXER` 行と `SPEC_REVIEW → IMPLEMENTER(exempt)` 行の順序をピンしていない

**対象ファイル**: `src/core/pipeline/__tests__/test-gen-exemption.test.ts`

TC-012 は現状:
- `SPEC_REVIEW → IMPLEMENTER(exempt)` index < `SPEC_REVIEW → TEST_CASE_GEN(unconditional)` index をアサート済み

しかし:
- `SPEC_REVIEW → SPEC_FIXER(specReviewHasRoutableFixables)` index < `SPEC_REVIEW → IMPLEMENTER(exempt)` index をアサートしていない

design.md D2 はこの順序を要件としている（"guarded row を既存 unconditional row の前に置く"）。この順序が逆転した場合、chore + spec-review で routable fixable findings がある状況で spec-fixer を素通りし IMPLEMENTER に直行する。

**実害の可能性**: 低い（chore は `specRequired: false` のため spec-review が findings を持つことは稀）。ただし design 上の不変条件であり、回帰テストで固定することが望ましい。

**修正案**（TC-012 describe ブロックに追加）:

```ts
it("TC-012: SPEC_REVIEW→SPEC_FIXER (specReviewHasRoutableFixables) row precedes SPEC_REVIEW→IMPLEMENTER (isTestGenExempt) row", () => {
  const specFixerIdx = STANDARD_TRANSITIONS.findIndex(
    (t) =>
      t.step === STEP_NAMES.SPEC_REVIEW &&
      t.on === "approved" &&
      t.to === STEP_NAMES.SPEC_FIXER &&
      t.when !== undefined,
  );
  const exemptIdx = STANDARD_TRANSITIONS.findIndex(
    (t) =>
      t.step === STEP_NAMES.SPEC_REVIEW &&
      t.on === "approved" &&
      t.to === STEP_NAMES.IMPLEMENTER &&
      t.when !== undefined,
  );
  expect(specFixerIdx).toBeGreaterThan(-1);
  expect(exemptIdx).toBeGreaterThan(-1);
  expect(specFixerIdx).toBeLessThan(exemptIdx);
});
```
