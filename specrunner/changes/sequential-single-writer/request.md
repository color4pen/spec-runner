# 逐次経路の single-writer: StepExecutor は実行結果を返し CommitOrchestrator が唯一の commit 者になる

## Meta

- **type**: spec-change
- **slug**: sequential-single-writer
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（実行所有権モデル、accepted）の **D1（state commit の単一所有者）・D2（StepHalt 単一適用）の逐次経路実装**。R1 で `StepHalt` 値・`buildStepContext`・`StepCompletion` を抽出済み（適用器＝persist/transition/rethrow は executor に残存）。本 request で executor から永続化を外し、`CommitOrchestrator` を唯一の commit 者にする。**B-13逐次・B-14 を ratify する所有権変更**。

## 現状コードの前提

- R1 後の `src/core/step/executor.ts`: `runAgentStep` が各 guard で `makeXxxHalt()` により `StepHalt` 値を構築し、**executor 内で `store.fail` / `transitionJob` / `store.persist` / `attachStateAndRethrow` を適用**（:290 / 310 / 342 / 374 付近）。成功確定は `deriveStepCompletion`。
- executor は `store.update`（開始）/ `store.appendHistory` / `store.fail` / `store.persist` を直接呼ぶ。
- 並列経路（`ParallelReviewRound`, R3 で抽出）は member が persist する ― **本 request では変えない**（R6 が担当）。

## 要件

1. `StepExecutor.runAgentStep`（逐次 step 実行）が、state を直接 persist せず、実行結果（成功は `StepCompletion` 由来の差分＋events、失敗は `StepHalt`）を値として返す形にする。
2. **`CommitOrchestrator` を新設**し、実行結果（成功 / `StepHalt`）を state へ適用・history/events 記録・persist する**唯一の経路**にする。成功・halt とも CommitOrchestrator が適用する。
3. executor から state mutation API（`store.persist` / `store.fail` / `store.update` 相当）への call-edge を除去する。
4. 逐次 step の観測可能な挙動（最終 state / verdict / history / persist 結果 / throw semantics）を**不変に保つ**。

## スコープ外

- 並列 round の single-writer（member no-persist / round commit）＝ R6。`ParallelReviewRound` は本 request で変えない。
- git 副作用の所有権（R5）。
- optimistic revision / total patch（将来）。

## 受け入れ基準

- [ ] `StepExecutor` から state mutation API（`store.persist` / `store.fail` / `store.update`）への call-edge が消え、**成功・halt とも `CommitOrchestrator` が適用する**ことをテストで固定する（intended-invariant, scenario 先）。
- [ ] 逐次 step の最終 state / verdict / history / throw が従来と一致することをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 逐次経路の single-writer（executor 返り値 → `CommitOrchestrator`）。ADR D1 の逐次実装。
- `CommitOrchestrator` は逐次で導入し、並列 round（R6）が**同じ orchestrator を再利用する足場**にする。
- `StepHalt`（R1 で値化済）の適用所有者を executor から `CommitOrchestrator` へ移す ― これが **B-14 の ratify 点**（値化した R1 でなく、適用所有権が移る本 request）。
- 並列経路は本 request で変えない（2つの書き込みモデルが一時併存するが、R6 で並列も `CommitOrchestrator` へ寄せる）。
