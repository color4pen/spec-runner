# Cross-Boundary Invariants Review Result — spec-review-prior-round-context (Iteration 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

### Iteration 2 の目的

operator commit 74dcdda88 で修正された 2 指摘の解消確認。

### 読んだファイル

- `specrunner/changes/spec-review-prior-round-context/design.md`（修正後）
- `src/core/port/step-types.ts`（修正後）
- `src/core/pipeline/spec-observation.ts`（`specFixerForwardsToTestGen` 実装確認）
- `src/core/step/prior-round-context.ts`
- `src/core/step/spec-review.ts`
- `src/core/step/step-context-builder.ts`
- `src/git/dynamic-context.ts`
- `src/prompts/spec-review-system.ts`
- `src/core/step/executor.ts`（buildStepContext 呼び出し位置確認）

---

## Iteration 1 指摘の解消確認

### F-001 解消確認: design.md のルーティング主張が実コードに合致した

**operator commit の変更内容**（`git show 74dcdda88 -- design.md` で確認）:

変更前（誤）:
> "conformance 由来の spec-fixer 起動は spec-fixer → test-gen へ抜けて spec-review へ戻らない"

変更後（正）:
> "conformance 由来の spec-fixer 起動も spec-review へ戻る（`specFixerForwardsToTestGen`（`src/core/pipeline/spec-observation.ts`）が conformance-triggered entry に対して false を返すため、guarded な spec-fixer → test-case-gen は発火せず、無条件行 spec-fixer → spec-review が発火する）"

`spec-observation.ts:74` で確認:
```ts
if (getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) !== null) return false;
```

conformance-triggered entry では `getConformanceFixContext` が non-null を返すため、`specFixerForwardsToTestGen` は `false` を返す → guarded 行（spec-fixer → test-case-gen）は発火しない → 無条件行（spec-fixer → spec-review）が発火する。

design.md は実コードの動作と一致する。✓

### F-002 解消確認: `enrichContext` doc comment に順序不変が明記された

**operator commit の変更内容**（`git show 74dcdda88 -- src/core/port/step-types.ts` で確認）:

```diff
+   * Ordering: prepareRoundContext (core layer) runs BEFORE this hook and spread-merges
+   * its fields into dynamicContext. Implementations must not drop those fields —
+   * return `{ ...dynamicContext, ...newFields }` rather than a rebuilt object.
```

`step-types.ts:242-246` で確認済み。この doc comment は:
- `prepareRoundContext` が先行して実行されることを明示
- `priorRoundContext` 等の事前設定フィールドを消去しないよう `{ ...dynamicContext, ...newFields }` パターンを要求

`SpecReviewStep.enrichContext`（`spec-review.ts:100-102`）が passthrough noop であることは変更なし。✓

---

## 追加の横断確認

### operator commit が新たな cross-boundary 問題を生んでいないことの確認

operator commit 74dcdda88 の変更はドキュメントのみ（design.md 1 行と step-types.ts doc comment 4 行）。実装コードへの変更なし。

追加確認した不変条件:

1. **`collectDynamicContext` は `priorRoundContext` を設定しない**: `dynamic-context.ts:101-106` で確認。`collectDynamicContext` は `gitLog`/`diffStat`/`changesList` のみを返し、`priorRoundContext` は含まない。one-shot 寿命は変わらず構造的に保証される。✓

2. **`buildStepContext` の `prepareRoundContext` 呼び出し guard**: `step-context-builder.ts:153` — `if (step.prepareRoundContext && dynamicContext)` — `dynamicContext` が null/undefined のとき呼ばれない。正常続行する。✓

3. **`spec-observation.ts` の routing 不変**: `specFixerForwardsToTestGen` の実装は変更なし（operator commit は design.md の説明を実コードに合わせただけ）。実コードはもともと正しく、F-001 はドキュメントの誤りだった。✓

---

## 検証できなかった項目

- `prepareRoundContext` → `enrichContext` 順序の runtime integration test（ユニットテストの mock ベース検証にとどまる）

---

## Findings 詳細

新規 finding なし。

Iteration 1 の F-001 / F-002 はいずれも operator commit 74dcdda88 で解消されたことを確認した。
