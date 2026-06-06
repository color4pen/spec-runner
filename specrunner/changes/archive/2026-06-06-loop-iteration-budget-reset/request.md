# ループの fixer retry budget が step 生涯で累積し、loop 外からの再入で fresh budget を持てず即 escalate する

## Meta

- **type**: bug-fix
- **slug**: loop-iteration-budget-reset
- **base-branch**: main
- **adr**: false

## 背景

### 症状

review→fix ループ（verification⟲build-fixer / code-review⟲code-fixer / conformance⟲fixer 等）の gate step に **自分の loop の外**から再入したとき、iteration counter が前回の値を引き継いだまま増え、**fixer を一度も起動せず即座に "retries exhausted" で escalate** する。再入後に fresh で fixable な失敗が出ても、修正の機会が無い。

観測例（`minimal-state-slug-dir` の run）: verification が iter 3 で pass → code-review → conformance(needs-fix) → implementer 再実装 → **verification(iter 4) failed → 即 `iter 2/2 retries exhausted`**（build-fixer 不起動）。落ちた中身は未使用変数2つという trivial な lint で、本来 build-fixer が直せたはずのもの。

### 根本原因

`src/core/pipeline/pipeline.ts` の `loopIters`（`Map<string, number>`、L147）は `runInternal` の生涯で累積する。loop step 入場時（L161-164）に `prevIter + 1` するだけで、**loop の外から再入したときにリセットしない**。そのため budget（`maxIterations`）が実質 step の一生で 1 episode 分しかなく、別の loop（conformance→implementer）経由で gate に戻った episode は budget ゼロで始まり、最初の失敗で即 exhaust する。

## 要件

1. **dedicated fixer を持つ loop**（`loopFixerPairs` にエントリがある spec-review / verification / code-review）の iteration counter を **convergence episode 単位**にする。gate step に **その loop の fixer 以外**の直前 step から到達したら counter を 0 にリセットし、fixer から戻った周回は継続カウントする。これで `implementer→verification` や `conformance→implementer→verification` の再入が fresh budget を得る。
2. **dedicated fixer を持たない loop（conformance）は lifetime counter のままにする（リセットしない）**。conformance は impl phase 全体を再実行する外側 loop で、毎回 upstream（code-review）から到達するため predecessor で fresh/continuation を区別できない。lifetime counter が impl 再実行回数を `maxIterations` で bound する役割を保つ ―― ここをリセットすると（`loopFixerPairs["conformance"]` が undefined で判定が常に true）conformance の exhaustion が無効化され無限ループになる。
3. 結果として: fixer-pair loop は implementer からの初回到達 / conformance 経由の再入 / resume 復帰で fresh budget、fixer→gate の周回で継続カウント。conformance は run 生涯で `maxIterations` 回の impl 再実行に bound。
4. 各 loop の counter は独立。fixer-pair loop の episode リセットは外側 conformance の bound を壊さない（別カウンタ）。
5. episode 内の正当な exhaustion（fixer を `maxIterations` 回試して収束しない）の挙動は不変。

## スコープ外

- `maxIterations` の値そのものの調整。
- exhaustion 時の error shape / メッセージ（`LOOP_EXHAUSTION_SHAPES`、`src/core/pipeline/types.ts`）。
- fixer counter（`fixerIters`）の意味論（resume の attempt 採番に使う別系統）。
- resume 時の `resolveResumeStep` ロジック。

## 受け入れ基準

- [ ] fixer-pair loop（verification / code-review / spec-review）の gate に loop 外（非 fixer の直前 step）から到達すると iteration counter が 0 から始まる。
- [ ] fixer から gate に戻った場合は counter が継続する（同一 episode で `maxIterations` を超えれば exhaust）。
- [ ] conformance→implementer→verification の再入で verification が fresh budget を得て、再入後の fixable な失敗で build-fixer が起動する（observed バグの回帰テスト）。
- [ ] **conformance（fixer なし）は lifetime counter を保ち、verification / code-review が pass しつつ conformance だけ繰り返し失敗するシナリオで `maxIterations` 回後に exhaustion で escalate する**（停止性の回帰テスト）。
- [ ] 単一 episode 内の exhaustion 挙動（`maxIterations` 回で escalate）が不変。
- [ ] `bun run typecheck && bun run test` が green。

## 設計判断

- **リセットは dedicated fixer を持つ loop に限定する**。判定は gate への直前 step がその loop の fixer（`loopFixerPairs[gate]`）か否か。`loopFixerPairs` には spec-review / verification / code-review のみがあり、conformance は無い。`pipeline.ts` の loop entry bookkeeping への局所変更で済む。
- **conformance を reset 対象に含めないのが停止性の要**。conformance は fixer を持たず（needs-fix は implementer 経由で impl phase 全体を再実行）、毎回 code-review から到達するため predecessor で episode を区別できない。lifetime counter のままにすることで `maxIterations` が impl 再実行回数を bound する。`loopFixerPairs[gate]` 判定を無条件に全 loop へ適用すると、conformance では常に true となり exhaustion が無効化される（architect 指摘）。
- 代替案「pass で loop を抜けた時にリセット」は正常 exit 経路では等価だが、crash で抜けずに止まった→resume の場合を一様に拾えない。entry-from-non-fixer を起点にすれば、初回到達・再入・resume 復帰を一様に fresh budget として扱える。
