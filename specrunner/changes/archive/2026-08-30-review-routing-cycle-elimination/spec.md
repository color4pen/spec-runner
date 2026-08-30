# Spec: review routing の value-import cycle を解消する

## Requirements

### Requirement: review-routing は pipeline / step factory への value import を持たない

`src/core/review-routing.ts` SHALL NOT contain value imports from any `core/pipeline/` composition module or any `core/step/` factory module (`fixer-helpers`, `regression-gate`). Type-only imports (`import type`) from those modules are permitted.

#### Scenario: review-routing のモジュールグラフにおける value import 先の制約

**Given** `src/core/review-routing.ts` が作成されている
**When** ファイルの import 文を解析する
**Then** value import 先は `step/step-names`、`step/judge-verdict`、`decision/decision-ledger` のみであり、`pipeline/reviewer-chain`、`pipeline/findings-ledger`、`step/fixer-helpers`、`step/regression-gate` への value import が存在しない

#### Scenario: review-routing から pipeline/types への import は type-only

**Given** `buildReviewerChainTransitions` の戻り値型 `Transition` が `pipeline/types.ts` で定義されている
**When** `review-routing.ts` 内でこの型を参照する必要がある場合
**Then** `import type { Transition }` を使用しており、value import としてカウントされない

---

### Requirement: src/ の value-import SCC が 0 件になる

After this change, the runtime value-import graph of `src/` SHALL contain zero strongly-connected components (SCCs) with size greater than 1. The SCC count SHALL be machine-verifiable by an architecture test without loading any production modules at runtime.

#### Scenario: SCC-A の解消（reviewer-chain ↔ fixer-helpers 2ノード SCC）

**Given** 変更前は `pipeline/reviewer-chain.ts` → `step/fixer-helpers.ts` → `pipeline/reviewer-chain.ts` という 2 ノード SCC が存在していた
**When** T-01〜T-03 の変更が適用される
**Then** `reviewer-chain.ts` は `step/fixer-helpers.ts` を value import せず、`fixer-helpers.ts` は `pipeline/reviewer-chain.ts` を value import しない。両ファイルとも `review-routing.ts` から必要な識別子を取得する

#### Scenario: SCC-B の解消（4ノード SCC）

**Given** 変更前は `reviewer-chain → regression-gate → findings-ledger → fixer-helpers → reviewer-chain` という 4 ノード SCC が存在していた
**When** T-01〜T-05 の変更が適用される
**Then** `reviewer-chain.ts` は `step/regression-gate.ts` を value import せず、`pipeline/findings-ledger.ts` は `step/fixer-helpers.ts` を value import せず、`step/regression-gate.ts` は `pipeline/reviewer-chain.ts` を value import しない

#### Scenario: architecture test による SCC 自動検出

**Given** T-06 で追加された `value-import-scc.test.ts` が存在する
**When** `bun run test` を実行する
**Then** `src/` の value-import SCC が 0 件であることが自動検証される。`import type` / `export type` は value edge としてカウントされない

---

### Requirement: type-only import は SCC 検出の対象外になる

The architecture SCC test SHALL NOT count `import type { ... }` or `export type { ... }` as value edges. Inline type modifiers (`import { type X, Y }`) SHALL exclude the type-modifier specifiers from the value edge while counting non-type specifiers.

#### Scenario: import type は value edge にならない

**Given** `review-routing.ts` が `import type { Transition } from "../pipeline/types.js"` を使用している
**When** SCC テストが import graph を解析する
**Then** この import は value edge としてカウントされず、SCC 計算に影響しない

#### Scenario: inline type modifier の部分除外

**Given** あるファイルが `import { type JobState, deriveChain } from "..."` を使用している（仮定）
**When** SCC テストが import graph を解析する
**Then** `deriveChain` のみ value edge としてカウントされ、`JobState` は除外される

---

### Requirement: STANDARD / FAST pipeline の transition 構造が変化しない

The transition shape (step, outcome, destination, guard presence/absence, row order) of `STANDARD_TRANSITIONS` and `FAST_TRANSITIONS` for the code-review / code-fixer section SHALL be identical before and after this refactoring. This MUST be enforced by a parity test.

#### Scenario: STANDARD_TRANSITIONS の code-review セクションが不変

**Given** T-07 の parity test が追加されている
**When** `STANDARD_TRANSITIONS` の code-review 行を `buildReviewerChainTransitions(["code-review"])` の出力と比較する
**Then** step・on・to・hasGuard のすべてが一致し、行の順序も一致する

#### Scenario: FAST_TRANSITIONS の code-review / code-fixer セクションが不変

**Given** T-07 の parity test が追加されている
**When** `FAST_TRANSITIONS` の code-review / code-fixer 行を検査する
**Then** `buildReviewerChainTransitions(["code-review"])` の構造と完全に一致する

---

### Requirement: custom reviewer pipeline の transition 構造が変化しない

When custom reviewers are present, `buildParallelReviewerTransitions` SHALL produce the same coordinator / regression-gate / code-fixer routing rows as before this refactoring. The parity test MUST verify each section's step, on, to, and guard presence in declaration order.

#### Scenario: custom reviewer ありの code-fixer priority routing が不変

**Given** `buildParallelReviewerTransitions({ coordinator: "custom-reviewers", members: ["sec"] })` を呼び出す
**When** code-fixer の approved 行の priority 順（conformance → regression-gate → code-review → coordinator）を検査する
**Then** 各行の to と hasGuard が変更前と一致する

#### Scenario: coordinator および regression-gate のセクションが不変

**Given** `buildParallelReviewerTransitions` の出力を検査する
**When** coordinator セクション（approved→regression-gate, needs-fix→code-fixer, skipped→regression-gate）と regression-gate セクション（approved→conformance, needs-fix→code-fixer, skipped→conformance）を確認する
**Then** すべての行で step・on・to が期待値と一致し、guard の有無も一致する

---

### Requirement: 既存の step ロジックが変化しない

The observable behavior of code-fixer return target resolution, active reviewer selection, regression-gate ledger computation, conformance fix routing, and all findings-related functions SHALL be identical before and after the refactoring.

#### Scenario: resolveActiveReviewer の tie-break ロジックが保たれる

**Given** `review-routing.ts` に移植した `resolveActiveReviewer` が同一の tie-break ロジック（`>=` による chain 後位優先）を実装している
**When** `reviewer-chain.test.ts` TC-028 の tie-break テストを実行する
**Then** 等しい startedAt を持つ 2 つのレビュアーについて、chain の後位にあるレビュアーが active として選択される

#### Scenario: getConformanceFixContext の recency check が保たれる

**Given** `review-routing.ts` に移植した `getConformanceFixContext` が同一の recency check（predecessor.endedAt >= conformance.endedAt の場合 null 返却）を実装している
**When** conformance が predecessor より古い状態で `getConformanceFixContext` を呼び出す
**Then** `null` が返却され、conformance-triggered entry として扱われない
