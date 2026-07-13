# executor の runAgentStep を Context / StepHalt値 / Completion へ概念分解する（挙動不変）

## Meta

- **type**: refactoring
- **slug**: executor-decompose-runagentstep
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（実行所有権モデル）の**下地**。`StepExecutor.runAgentStep()`（約440行）に、実行入力の組み立て・失敗停止の所作・成功確定処理が混在している。これらを名前付きの境界（module / 値）へ抽出する。本 request は**所有権・挙動を一切変えない構造抽出のみ**で、single-writer 化（B-13）・`StepHalt` の適用所有者移動（B-14）は後続 request（R2）が担う。

## 現状コードの前提

- `src/core/step/executor.ts:203-641` `runAgentStep()` に以下が同居:
  - **実行 context 組立**（`:256-347`：projectContext / rules follow-up / session / policy / outputVerification / ctx オブジェクト）― 制御フロー無しの純組立。
  - **失敗停止の所作 6 箇所**（`:380` agent throw / `:404` timeout / `:442` non-success / `:472` drift / `:525` output-gate / `:598` commit-fail）― どれも `ErrorInfo` 組立 → `recordFailedStepResult` → `store.fail` または `transitionJob` → history → persist → `attachStateAndRethrow`。
  - **成功確定**（`finalizeStep`, `:765` 以降：artifact 確定 / no-op 検出 / verdict 導出 / `StepRun`・history 生成）。
- 6 箇所は `failed`（`store.fail`）と `awaiting-resume`（`transitionJob` ＋ resumePoint）の2種に分かれる（timeout / drift が後者）。

## 要件

1. **`buildStepContext(step, state, deps)`** を新設し、context 組立（`:256-347`）を移す。制御フロー無しの純組立。
2. **`StepHalt`（discriminated union）を値として導入**: `{ kind: "failed"; error: ErrorInfo; patch? } | { kind: "awaiting-resume"; error: ErrorInfo; resumePoint; interruption?; patch? }`。各 guard は `StepHalt` を**構築**する。**適用（persist / transition / rethrow）は現状どおり executor 内に残す**（所有者移動は R2）。
3. **`StepCompletion`（成功確定の評価）** を切り出す: artifact 確定・no-op 検出・verdict 導出・`StepRun`/history 生成。副作用と判定を可能な範囲で分離する。

## スコープ外（越えたら R2 領域 ＝ 別 request へ分割）

- StepExecutor の公開戻り値を変更しない
- persist の所有者を変更しない
- failure disposition を変更しない
- history / event の記録順を変更しない
- fan-out 経路へ変更を波及させない

## 受け入れ基準

- [ ] Context / `StepHalt` 値 / Completion が named module / type として抽出される。
- [ ] **既存テストの期待振る舞いを書き換えない**。挙動不変（出力・状態・history・Git 差分が同じ）。モジュール移動に伴う機械的更新（import path / mock path / architecture test の対象一覧）は許容する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 本 request は execution-ownership ADR の**下地（構造抽出）**であり、所有権は変えない。
- `StepHalt` はこの段階では**値のみ**。適用所有者は executor 内に残し、recorder へ移すのは R2（**B-14 の ratify は R2**）。「値にしただけで適用者が executor に残る」状態を意図的に許容する。
- persist を executor から除去する案は却下（それは R2 ＝ 逐次 single-writer の仕事）。
