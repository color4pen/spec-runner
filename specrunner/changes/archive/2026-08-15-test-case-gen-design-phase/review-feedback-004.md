# Code Review — test-case-gen-design-phase (Iteration 4)

## 検証した項目

### 遷移表 (src/core/pipeline/types.ts)
- `DESIGN success → TEST_CASE_GEN`（unconditional）が存在する ✅
- `DESIGN success → SPEC_REVIEW when isTestGenExempt`（guarded、first-match-wins で先行）✅
- `TEST_CASE_GEN success → SPEC_REVIEW` ✅（旧 `→ TEST_MATERIALIZE` は削除済み）
- `SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional）✅（旧 `→ TEST_CASE_GEN` は削除済み）
- `SPEC_REVIEW needs-fix → TEST_CASE_GEN when specReviewNeedsFixIsTcOnly`（guarded）✅
- `SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward` ✅
- `SPEC_FIXER approved → TEST_CASE_GEN when specFixerNeedsFixForward` ✅
- `STANDARD_TRANSITIONS.length === 52`（旧 49 + 3）✅

### spec-observation.ts guards
- `specFixerObservationForward`（旧 `specFixerForwardsToTestGen` リネーム）: approved spec-review + 非 conformance → true ✅
- `specFixerNeedsFixForward`: needs-fix spec-review + 非 conformance → true ✅
- `specReviewNeedsFixIsTcOnly`: TC-only finding → true / spec finding 混在（severity 問わず）→ false ✅

### judge-verdict.ts — deriveSpecReviewVerdict
- 優先順 4a: request.md + test-cases.md 共存 → escalation ✅
- 優先順 4b: TC-only fixable（high/medium/low）→ needs-fix ✅
- 優先順 4c: spec-fixer routable critical|high → needs-fix（low|medium → fall-through approved）✅
- 承認後保護: deriveConformanceVerdict / deriveJudgeVerdict は `conformanceEffectiveFixer` / `judgeEffectiveFixer` を使用するため test-cases.md は unroutable → escalation ✅

### canon-write-scope.ts
- `writableByFixer` に `["test-case-gen", {test-cases.md}]` を追加済み ✅

### canon-escalation.ts
- `testCaseGenEffectiveFixer: () => "test-case-gen"` エクスポート済み ✅

### spec-review.ts reads()
- `isTestGenRequired(state.request.type)` 条件で `test-cases.md` を追加 ✅
- 免除 type（chore 等）では test-cases.md を読まない ✅

### spec-review-system.ts
- Contract セクションに test-cases.md を記載 ✅
- Method セクションに TC 照合観点（カバレッジ / 記述水準 / tasks 整合）追加 ✅
- initial message template に "test-cases.md" を含む ✅

### test-case-gen.ts
- `buildMessage()` が spec-review の TC routable findings を注入（再生成時）✅
- 初回生成（spec-review 未実行）は注入なし ✅
- `writes()` は test-cases.md のみ（tasks.md を含まない）✅

### test-case-gen-system.ts
- 振る舞いレベル記述指示（実装 API / 内部クラス名を含めない）追加 ✅
- tasks と TC 不整合は申し送り注記として記録し spec-review に委ねる指示 ✅

### registry.ts
- `STANDARD_DESCRIPTOR.loopIntermediateSteps: new Set([STEP_NAMES.TEST_CASE_GEN])` 設定済み ✅
  - spec-fixer → test-case-gen → spec-review サイクルで収束予算がリセットされないための必須フィールド
- step order: design → test-case-gen → spec-review → spec-fixer → test-materialize ✅

### report-result.ts
- `FixTarget` union に `"test-case-gen"` を追加済み ✅

### テストスイート（全項目確認）
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts`: TC-001〜028 網羅 ✅
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts`: guard / 遷移更新済み ✅
- `src/core/pipeline/__tests__/test-gen-exemption.test.ts`: 免除 type 更新済み ✅
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts`: TC-013 に test-cases.md ケース追加 ✅
- `tests/core/pipeline/pipeline.test.ts` TC-063: spec-review exhaustion（test-case-gen stub 含む）✅
- `tests/pipeline-integration.test.ts` TC-012: SPEC_REVIEW_RETRIES_EXHAUSTED（3 spec-review 実行で exhaustion）✅
- `typecheck && test`: 765 ファイル / 11,513 tests / 1 skipped — 全 green ✅

## 検証できなかった項目

- `loopIntermediateSteps` の budget-reset 防止効果を**直接**観察する unit test が存在しない（TC-012 integration test が間接的に保証しているにとどまる）

## Findings 詳細

### F-001: `loopIntermediateSteps` が unit test で固定されていない

**severity**: medium
**resolution**: fixable
**file**: `src/core/pipeline/registry.ts`
**line**: 89

`STANDARD_DESCRIPTOR.loopIntermediateSteps = new Set([STEP_NAMES.TEST_CASE_GEN])` は、`spec-fixer → test-case-gen → spec-review` サイクルで収束予算がリセットされないための必須設定である。このフィールドが除去または誤設定されると、loop step が test-case-gen 通過ごとに新 episode 扱いとなり、needs-fix が永続する場合に exhaustion が発生しなくなる（無限ループになりうる）。

現状は `tests/pipeline-integration.test.ts` TC-012 が SPEC_REVIEW_RETRIES_EXHAUSTED で 3 回の spec-review 実行を検証することで間接的に保証しているが、`STANDARD_DESCRIPTOR.loopIntermediateSteps` の値を直接 assert する unit test は存在しない。

修正案:

```ts
it("STANDARD_DESCRIPTOR.loopIntermediateSteps contains test-case-gen", () => {
  expect(STANDARD_DESCRIPTOR.loopIntermediateSteps?.has(STEP_NAMES.TEST_CASE_GEN)).toBe(true);
});
```

---

### F-002: registry の `test-case-gen` role に `phase: "impl"` が割り当てられているが spec phase に位置する

**severity**: low
**resolution**: fixable
**file**: `src/core/pipeline/registry.ts`
**line**: 74

```ts
[STEP_NAMES.TEST_CASE_GEN]:    { role: "gate",     phase: "impl" },
```

test-case-gen は `design → test-case-gen → spec-review` の設計上 spec phase に属するが、registry では `phase: "impl"` に設定されている。現時点で `roles[...].phase` を参照する production コードは存在しないため runtime への影響はない。ただし PipelineDescriptor の doc comment が「used by resume resolution and pipeline convergence semantics」と記述しており、将来の参照時に誤動作しうる。

修正案: `phase: "spec"` に修正する。
