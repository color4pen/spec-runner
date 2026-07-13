# 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt）

## Meta

- **type**: spec-change
- **slug**: round-owned-git-effects
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D3（git 副作用の round 所有 ＋ scoped staging）の実装**。現状、fan-out の各 member は `finalizeStepArtifacts` で共有 worktree に対し `git add -A` ＋ `commit` するため、どの member の出力をどの commit が所有するかが実行順依存（共有 worktree の attribution 問題）。本 request で member 経路から stage/commit を外し、coordinator が round 単位で宣言出力だけを scoped stage・commit する。**B-15 を ratify する所有権変更**。

## 現状コードの前提

- member 実行（executor 経由）の `finalizeStepArtifacts` が `commitAndPush`（`git add -A` ＋ `commit "<step>: <slug>"`）を共有 worktree に対して行う（`src/core/step/commit-push.ts`）。
- `ParallelReviewRound`（R3 抽出）が member を並列実行、各 member が上記 commit を行う（R2 は逐次経路のみ変更、並列は未変更）。
- 共有 worktree のため `git add -A` は他 member の出力も stage しうる（attribution が実行順依存）。

## 要件

1. member 実行経路から git stage/commit（stage/commit port の呼び出し）を除去する。
2. coordinator（`ParallelReviewRound`）が round 単位で、round member の**宣言出力（declared outputs）の union だけを scoped stage** する（`git add -A` を使わず宣言 path に限定、削除・置換も範囲内で拾う）。
3. round member が宣言外のファイルを変更した場合は **round 全体を halt** する（changed ⊆ declared、外れたら halt）。member 単位の attribution は不可能なので round 単位で判定する。
4. 逐次経路の commit 挙動は変えない。

## スコープ外

- round state の single-writer（member no-persist / round commit）= R6。
- `architecture/` 配下は変更しない（B-15 の §4 / conformance / 歯への ratify は実装 merge 後に attended で行う ― trust-root を out-of-loop に保つ）。

## 受け入れ基準

- [ ] member 経路が git stage/commit port を呼ばず、coordinator の round 所有点だけが宣言出力を stage することをテストで固定する（intended-invariant）。
- [ ] round の changed files が宣言出力 union の範囲内であることを検証し、範囲外なら round halt することをテストで固定する。
- [ ] scoped staging が `git add -A` を使わず宣言 path に限定することをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- git 副作用を round 単位で coordinator が所有（ADR D3）。member 帰属は git commit でなく出力ファイル名・`StepRun`・history・reviewer status が保持する。
- 非宣言変更の検出は **round 単位**（共有 worktree では member 単位の attribution が不可能）。既存の `listChangedFiles` / snapshot-diff 機構を worktree scope へ振り向けて再利用する。
- scoped staging（`git add -A -- <declared>` 等、削除も範囲内で拾う）を使い、`state.json` / `usage.json` 等を round commit に呑まない。
- `architecture/` は pipeline で触らない。B-15 ratify は attended。
