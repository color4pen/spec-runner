# Cross-Boundary Invariants Review — executor-decompose-runagentstep — iter 1

## Summary

- **verdict**: approved
- **scope**: `src/core/step/executor.ts`, `src/core/step/step-halt.ts`, `src/core/step/step-context-builder.ts`, `src/core/step/step-completion.ts`
- **method**: diff main…HEAD, line-by-line guard comparison between original and refactored executor, factory output equivalence analysis

---

## 観点（レビュー対象）

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Findings

### F-01: `StepCompletion` に `pullRequest` フィールドが追加されている（severity: low / information）

**観察**: `design.md` が定義した `StepCompletion` インターフェースは 2 フィールド（`verdict`, `persistToolResult`）だが、実装では第 3 フィールド `pullRequest?: { url; number; createdAt }` が追加されている。

**理由**: 原実装の `finalizeStep` は `parsed?.pullRequest` を `state.pullRequest` に転記していた。`deriveStepCompletion` が `parsed` を内部で保持する設計に移行した結果、`pullRequest` を戻り値に含めなければ `finalizeStep` が `state.pullRequest` を設定できなくなる。設計書の記述が不完全だったのであり、追加は挙動維持に必要。

**不変条件への影響**: `state.pullRequest` の転記順序・タイミングは変わらない。`executor.ts` の `finalizeStep` が `completion.pullRequest` を参照する形になっただけであり、`parsed?.pullRequest` を参照していた原実装と等価。

**判定**: 設計書の誤記訂正。挙動不変。

---

### F-02: `buildStepContext` が `fsAdapter` 引数を持ち、`design.md` 仕様と異なる（severity: low / information）

**観察**: `design.md` のシグネチャ定義は 5 引数（`step, state, deps, cwd, emitFn`）だが、実装は第 6 引数 `fsAdapter: BuildStepContextFs` を持つ。`executor.ts` は `{ readFile: ..., readdir: ... }` を渡している。

**理由**: `step-context-builder.ts` は `core` 層ファイルであり、`node:fs` を直接 import することは architecture invariant（コアはインフラに直接依存しない）に抵触する可能性がある。seam を切ることで core invariant を守るとともに、テスト容易性も向上する。設計書の記述が先行していた段階の簡略仕様であり、実装が正しく補完した。

**不変条件への影響**: executor が渡す実装は `fsReadFile(p, "utf-8")` / `fsReaddir(dir)` であり、原実装が直接呼んでいた式と同一。`readFile(pmPath, "utf-8")` → `fsAdapter.readFile(pmPath, "utf-8")` の変換で挙動変化なし。

**判定**: 挙動不変、設計改善。

---

### F-03: `deps.resumePrompt` / `deps.resumeContext` のクリアタイミング（severity: verified-safe）

**観察**: 原実装では `ctx` 構築（インライン）の直後にクリアが行われていた。新実装では `await buildStepContext(...)` の直後にクリアブロックがある。

**検証**: `buildStepContext` は `buildResumePrompt({ state, stepName, resumeContext: deps.resumeContext, humanResumePrompt: deps.resumePrompt })` を内部で呼び出す。`buildStepContext` を `await` した後、`deps.resumePrompt = undefined` が実行される。Promise の逐次処理により、`buildStepContext` が `deps.resumeContext` / `deps.resumePrompt` を読み取った後にクリアが起きることが保証される。

**不変条件**: "one-shot 消費"契約（再実行で古い resume context が漏れない）が維持される。

**判定**: 不変条件維持確認済み。

---

### F-04: 6 ガードの `ErrorInfo` 等価性（severity: verified-safe）

6 箇所の guard を一つずつ比較した。

| Guard | code | message | hint | thrownErr |
|-------|------|---------|------|-----------|
| agent-throw | `err.code ?? "AGENT_STEP_FAILED"` | `err.message` | `err.hint ?? ""` | 原 error そのまま（original と同一） |
| timeout | `err.code ?? "POLL_TIMEOUT"` | `err.message` | `err.hint ?? ""` | `runResult.error ?? new Error(...)` （original と同一） |
| non-success | `err.code ?? "AGENT_STEP_FAILED"` | `err.message` | `err.hint ?? ""` | `runResult.error ?? new Error(...)` （original と同一） |
| drift | `"MAIN_CHECKOUT_WRITE_DETECTED"` | `Main checkout write detected...` | `Guarded paths...specrunner job resume ${slug}...` | 新規合成 Error（original と同一） |
| output-gate | `"STEP_OUTPUT_MISSING"` | `Step '${name}' output contract(s)...` | `Required step output(s) missing...` | 新規合成 Error（original と同一） |
| commit-fail | `err.code ?? "COMMIT_AND_PUSH_FAILED"` | `err.message` | `err.hint ?? ""` | 原 error そのまま（original と同一） |

各 factory の返す `ErrorInfo` が原実装のインライン定義と等価であることを確認した。

**一点注記（drift）**: `makeDriftHalt` 内で `mainCheckoutDrift.ts` に `new Date().toISOString()` が呼ばれる。原実装でも `transitionJob` patch 内で `new Date().toISOString()` が呼ばれており、どちらも "呼び出し時刻" であった。実行コンテキスト上の差はサブミリ秒。 functional 差なし。

**判定**: 全 6 ガードの等価性確認済み。

---

### F-05: `finalizeStep` シグネチャ変更と呼び出し元の整合性（severity: verified-safe）

**観察**: `finalizeStep` は private メソッドだが引数の並びが変わった。原実装は `(step, state, deps, resultContent, completedAt, startedAt, agentResult?)` の 7 引数。新実装は `(step, state, deps, completedAt, startedAt, agentResult?)` の 6 引数で、`resultContent` は `agentResult.resultContent` に移動した。

**呼び出し元の変化**:
- `runAgentStep` 側: `finalizeStep(..., runResult.resultContent, completedAt, startedAt, { sessionId:... })` → `finalizeStep(..., completedAt, startedAt, { resultContent: runResult.resultContent, sessionId:... })`
- `runCliStep` 側: `finalizeStep(..., fileContent, completedAt, startedAt)` → `finalizeStep(..., completedAt, startedAt, { resultContent: fileContent })`

**`deriveStepCompletion` 内の分岐確認**: CLI step の場合 `stepReportTool === undefined`。条件 `agentResult !== undefined && stepReportTool !== undefined` は `false` となり、prose-parse branch に入る。`resultContent = agentResult?.resultContent ?? null = fileContent ?? null`。原実装（`resultContent` 直接参照）と等価。

**判定**: 内部 private メソッドのシグネチャ変更。外部 API（`execute`）は変化なし。両呼び出し元が正しく更新されており、挙動不変。

---

### F-06: `DomainEvent` の import source の違い（severity: low / information）

**観察**: `step-context-builder.ts` は `DomainEvent` を `../../kernel/event-types.js` から import する。`executor.ts` は `../event/types.js` から import する。後者は前者の re-export である。

```typescript
// src/core/event/types.ts
export type { DomainEvent } from "../../kernel/event-types.js";
```

**影響**: TypeScript の structural typing 上、同一の string union type。typecheck が 0 エラーで通過しているため互換性確認済み。`kernel/` から直接 import する方が architecture 的に正しい（kernel は zero-import な最内層）。

**判定**: 挙動への影響なし。

---

### F-07: `outputVerification.detect` クロージャの `branch` キャプチャ（severity: verified-safe）

**観察**: `buildStepContext` 内で `const branch = state.branch ?? null` をキャプチャして `detect: () => strategy.validateStepOutputs(followUpContracts, cwd, branch)` を構築する。

**検証**: 原実装でも同じ位置（`runner.run()` 前・`state.branch` が確定している時点）で同値の closure を構築していた。`state` はその後の `validateRequiredInputs` / `runner.run()` では変化しないため、キャプチャ値は原実装と同一。

**判定**: 不変条件維持確認済み。

---

## 統合評価

調査対象の7項目全て:
- 公開 API（`execute`）: 変化なし ✓
- history entry の順序: 変化なし ✓
- `store.fail` / `transitionJob` の呼び出し順: 変化なし ✓
- `attachStateAndRethrow` の呼び出し前に state を persist する順序: 変化なし ✓
- `deps.resumePrompt` one-shot クリア契約: 維持 ✓
- 6 ガードの `ErrorInfo` / `thrownErr`: 等価 ✓
- `state.pullRequest` 転記: 等価 ✓

既存テスト 6565 件全通過、typecheck 0 エラー。

- **verdict**: approved
