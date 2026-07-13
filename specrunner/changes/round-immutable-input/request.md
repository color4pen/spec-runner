# 並列 round の入力を immutable にする（共有 deps 不変・resume 配布）

## Meta

- **type**: spec-change
- **slug**: round-immutable-input
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D4（実行 seam を跨ぐ入力の不変性）の並列 round 実装**。R3 で `ParallelReviewRound` を挙動不変で抽出済み。現状、fan-out は同一 base `state` と可変 `deps` を複数 member へ共有し、resume 入力（`deps.resumePrompt` / `deps.resumeContext`）を最初に到達した member が消費する（どの member が最初かは非決定）。本 request で **member 実行が共有 `deps` を in-place で書き換えない**ようにし、resume 入力を round ごとの readonly execution input として構築する。**B-16 を ratify する所有権変更**。

## 現状コードの前提

- `src/core/pipeline/parallel-review-round.ts`（R3 で抽出）: `Promise.allSettled` で pending member を実行し、各 member に同一 `state` と `deps` を渡す。
- resume 入力は共有 `deps` にあり、executor 実行中に `deps.resumePrompt` / `deps.resumeContext` を最初に消費した member が `undefined` にクリアする（`src/core/step/*`）。並列では消費順が非決定。
- member→coordinator resume 時、自動 resume context が写像で捨てられる既知の課題がある（`src/core/command/resume.ts` の strict equality gate）。

## 要件

1. member 実行が共有 `deps`（orchestration 入力）を **in-place で書き換えない**（`deps.<field> =` 代入をしない）。round ごとに readonly な execution input を構築して各 member へ渡す。
2. **human resume note** は round の全 pending member へ readonly で配布する。
3. **automatic resume context** は対象 member（元の resumePoint.step の member）にだけ展開する。member→coordinator 写像後も元の resumePoint を保持し、context が捨てられないようにする。
4. 逐次経路・非並列時の resume 挙動は不変に保つ。

## スコープ外

- git 副作用の round 所有（R5）。member persist の除去（R6）。
- `architecture/` 配下は変更しない（B-16 の §4 / conformance.md (A) / 歯への ratify は本 request の pipeline では行わず、実装 merge 後に attended で行う）。

## 受け入れ基準

- [ ] member 実行中に共有 `deps` が in-place 変更されないことをテストで固定する（intended-invariant, scenario 先）。
- [ ] human resume note が全 pending member へ readonly 配布され、automatic resume context が対象 member だけへ展開されることをテストで固定する（現状の「最初の member が偶然消費する」挙動は固定しない ― 意図した配布を固定する）。
- [ ] member→coordinator resume で automatic context が保持されることをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- 入力の不変性（D4）の並列実装。member は round 提供の readonly input を参照し、共有 orchestration 状態を書き換えない。
- resume 配布は「human note = job 単位ガイダンス → 全 member」「automatic context = step 固有 → 対象 member」の2種に分ける。
- **現状の偶然挙動（どの member が resume を消費するか）を正しい仕様として固定しない**。意図した配布を intended-invariant test として置く。
- **architecture/ は pipeline で触らない**。B-16 の ratify（§4 / conformance / 歯）は実装 merge 後に attended で行う（trust-root は out-of-loop に保つ）。
