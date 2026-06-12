# Cross-Boundary Invariants Review — conformance-fix-target — iter 1

## Verdict

- **verdict**: approved

---

## Scope

Reviewed files: `src/core/pipeline/pipeline.ts`, `src/core/pipeline/types.ts`, `src/core/step/executor.ts`, `src/core/step/judge-verdict.ts`, `src/core/step/fixer-helpers.ts`, `src/core/step/code-fixer.ts`, `src/core/step/spec-fixer.ts`, `src/core/step/implementer.ts`, `src/core/step/conformance.ts`, `src/core/step/report-tool.ts`, `src/core/port/report-result.ts`, `src/kernel/report-result.ts`, `src/prompts/conformance-system.ts`.

---

## Findings

### F-001 — `pipeline.ts:387` が `STEP_NAMES.CONFORMANCE` ではなく文字列リテラル `"conformance"` を使っている

**重大度**: low

**対象コード** (`src/core/pipeline/pipeline.ts:387`):

```typescript
if (currentStep === "conformance") {
```

**詳細**:

この行はこの change で新たに追加された conformance→fixer budget reset ブロックの条件式。コードベース全体では `STEP_NAMES.CONFORMANCE` 定数を介してステップ名を参照する慣行が徹底されており、同ファイル内の他すべての step name 参照も `toStepName` / `loopNames` / ディスクリプタ経由でその慣行に従っている。`pipeline.ts` は `STEP_NAMES` を import していないため、変更者が string literal を選んだことになる。

**リスク**: 現時点では `STEP_NAMES.CONFORMANCE = "conformance"` と一致するため機能的影響はなく、テストも green のまま。しかし将来 `STEP_NAMES.CONFORMANCE` が変更された場合（あるいは custom pipeline でステップ名が異なる場合）、budget reset がサイレントに no-op になり、conformance-triggered code-fixer/spec-fixer がこの change で防止しようとした「前 episode の残留予算で即 exhaust」バグを再現させる。

**修正例**:

```typescript
// pipeline.ts の import に STEP_NAMES を追加:
import { toStepName, STEP_NAMES } from "../step/step-names.js";

// 条件式:
if (currentStep === STEP_NAMES.CONFORMANCE) {
```

---

## 確認済み不変条件

以下は diff が黙って破っていないことを確認した既存の暗黙の前提。

### R7 contract（verdict 導出を CLI が握る）

- `CONFORMANCE_REPORT_TOOL` schema の `fixTarget` は finding 単位のラベル付けに留まり、routing verdict は `deriveConformanceVerdict` が findings から決定的に導出する。
- `executor.ts:631-634` で `isConformanceStep === true` のとき `deriveConformanceVerdict` を呼び、agent の自己申告値（`approved` boolean 等）を routing に使わない経路が維持されている。
- `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` の zod schema に `fixTarget` が含まれていないことを確認（スコープ封じ込めが維持されている）。

### 遷移表の後方互換

- `STANDARD_TRANSITIONS` の conformance 区画に plain `needs-fix → IMPLEMENTER` エントリが残置されており、旧形式 history（verdict = "needs-fix" のみ）を持つ state の resume でも escalate に落ちない。

### recency 判定（D4）

- `getConformanceFixContext` の前駆 step 比較：
  - code-fixer 経路：`conformance → code-fixer → conformance` tight loop では code-review の `endedAt` が常に最新 conformance より古く、injection が維持される。
  - spec-fixer 経路：`conformance → spec-fixer → spec-review → spec-fixer` の二巡目では spec-review の `endedAt > conformance.endedAt` となり injection が null を返すことを確認（stale findings の誤注入なし）。

### 収束予算の境界

- conformance→fixer reset（`pipeline.ts:382-394`）と conformance の exhaustion check（`pipeline.ts:396-407`）は異なるカウンタを操作・参照しており、互いに干渉しない。
  - reset は `fixerIters[nextFixer]` と `loopIters[pairedReview]` を 0 に戻す。
  - exhaustion check は `loopIters[currentStep="conformance"]` を読む。
- 3 経路すべてで `CONFORMANCE_RETRIES_EXHAUSTED` が正しく発火し `CODE_REVIEW_RETRIES_EXHAUSTED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` を上書きしないことは `TC-CONFRT-05` が固定している。

### module identity（isConformanceStep）

- `executor.ts` の `isConformanceStep = stepReportTool === CONFORMANCE_REPORT_TOOL` は JS module singleton 保証に基づく identity 比較。`conformance.ts` も `executor.ts` も同一 `report-tool.ts` から import しており、同一オブジェクト参照が保証される。

### conformance result file の path 整合

- `conformance.ts` の `writes()` / `resultFilePath()` が `nextIteration` を使って書き込み、戻り先 step の `reads()` / `buildMessage()` が `latestIteration` を使って参照する。conformance run 完了後に state に run が追加されるため `latestIteration = nextIteration_before` となり、参照先ファイルが一致する。
