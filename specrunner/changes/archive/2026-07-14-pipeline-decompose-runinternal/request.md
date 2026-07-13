# pipeline を ConvergenceBudget / ParallelReviewRound へ概念分解する（挙動不変）

## Meta

- **type**: refactoring
- **slug**: pipeline-decompose-runinternal
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（実行所有権モデル）の**下地**。`Pipeline.runInternal()`（約300行）に、駆動ループ・収束予算（loop/fixer counter・episode reset・exhaustion）・並列 review の fan-out が同居している。収束予算と fan-out を名前付きの境界へ抽出する。本 request は**所有権・挙動を一切変えない構造抽出のみ**で、round 入力の immutable 化（B-16）・git round 所有（B-15）・state round 所有（B-13並列）は後続 request（R4-R6）が担う。

## 現状コードの前提

- `src/core/pipeline/pipeline.ts:256-553` `runInternal()` に以下が同居:
  - **収束予算**：`loopIters`/`fixerIters` の2 Map、entry 加算（`:280-304`）、fresh convergence / unpaired の episode reset（`:441-485`）、exhaustion check 3種（`:492-524`、`tryExhaust`）。
  - **並列 fan-out**：`runCoordinatorFanOut()`（`:732-868`、約130行）― member 選択 / invalidation / `Promise.allSettled` 実行 / merge / reviewer status / synthetic coordinator run / persist。
  - 駆動ループ本体（step dispatch / outcome / 遷移表引き / 終端）。

## 要件

1. **`ConvergenceBudget`（immutable state ＋ 操作）** を新設: `loopIterations`/`fixerIterations`/`previousLoopStep` を内包し、`enterStep` / `onTransition` / `checkExhaustion` を持つ。可変 Map を隠さず、操作ごとに新しい state を返す immutable object にする（resume 時に journal から再構築可能な形）。episode reset・exhaustion をここへ移す。
2. **`ParallelReviewRound`（コンポーネント）** を新設し、`runCoordinatorFanOut` の処理を移す。`Pipeline` から fan-out 固有処理を隔離する。
3. `runInternal` は「step 実行 → outcome → 遷移 → 終端」の駆動ループに寄せる。

## スコープ外（越えたら R4-R6 領域 ＝ 別 request へ分割）

- resume 入力の配布方法を変更しない
- member persist を除去しない
- member Git commit を除去しない
- merge 順・reviewer status 更新方法を変更しない
- **現在の偶然挙動（どの member が resume を消費するか / どの commit が誰の出力を持つか）を新規テストとして固定しない**

## 受け入れ基準

- [ ] `ConvergenceBudget` / `ParallelReviewRound` が named module / type として抽出される。
- [ ] **既存テストの期待振る舞いを書き換えない**。挙動不変（出力・状態・history・Git 差分が同じ）。モジュール移動に伴う機械的更新（import path / mock path）は許容する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 本 request は execution-ownership ADR の**下地（構造抽出）**であり、所有権は変えない。
- `ConvergenceBudget` は隠れ可変 Map を持つサービスにせず、**immutable state ＋ 操作**にする（resume 再構築・並列隔離・before/after 比較のため）。
- `ParallelReviewRound` はこの段階では**現状挙動のまま**移す。member no-persist / round git 所有 / immutable input は R4-R6 で変える。
- 現状の concurrency の偶然挙動を「正しい仕様」として test 固定しない（意図した不変条件は R4-R6 で intended-invariant test として置く）。
