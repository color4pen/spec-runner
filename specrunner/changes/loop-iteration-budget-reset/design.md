# Design: loop iteration budget reset (convergence-episode 単位化)

## Context

`Pipeline.runInternal`（`src/core/pipeline/pipeline.ts`）は loop step の試行回数を 2 本の関数ローカル `Map` で管理する。

- `loopIters: Map<stepName, number>` — loop step（`loopNames`）の試行回数。loop step 入場時に `prevIter + 1` する。
- `fixerIters: Map<stepName, number>` — fixer step（`loopFixerPairs` の値）の試行回数。fixer 入場時に `+1` する。

両 `Map` は `runInternal` の生涯で **累積**する（リセット経路が存在しない）。この累積が exhaustion 判定の入力になる:

1. loop entry-guard（"Check loop exhaustion before entering next loop iteration"）: `loopIters[nextStep] >= maxIterations` で escalate（fixer bypass あり）。
2. fixer entry-guard（"Check fixer exhaustion before entering fixer step"）: `fixerIters[nextStep] >= maxIterations` で fixer を起動させず escalate。
3. no-fixer loop の即時 exhaustion（"Check current loop step exhaustion"）: paired fixer を持たない loop（conformance）が `loopIters[currentStep] >= maxIterations` で escalate。

### 症状と観測事実

review→fix ループの gate に **自分の loop の外**から再入したとき、両 counter が前 episode の値を引き継いだまま、fixer を一度も起動せず "retries exhausted" で escalate する。

観測例（`minimal-state-slug-dir` run, `maxIterations=2`）:
- episode 1: `implementer → verification(iter1 failed) → build-fixer(1) → verification(iter2 failed) → build-fixer(2) → verification(iter3 passed)`。この時点で `loopIters[verification]=3`, `fixerIters[build-fixer]=2`。
- `code-review → conformance(needs-fix) → implementer` で impl phase を再実行 → `verification` に再入。
- `loopIters[verification]=3 >= 2` だが bypass（`fixerIters[build-fixer]=2 >= 2`）で +1 を許可 → `verification(iter4) failed`。
- `verification → build-fixer` の fixer entry-guard が `fixerIters[build-fixer]=2 >= 2` を検知 → **build-fixer 不起動**で `iter 2/2 retries exhausted` escalate。

落ちた中身は未使用変数 2 個という trivial な lint で、fresh budget があれば build-fixer が直せたもの。

### 根本原因（2 系統）

request.md の「根本原因」は `loopIters` の累積のみを挙げているが、**コードを追うと観測された "build-fixer 不起動" を直接ゲートしているのは `fixerIters` の累積である**。`loopIters` だけをリセットしても、fixer entry-guard が前 episode の `fixerIters` で fixer を弾くため、受け入れ基準「再入後の fixable な失敗で build-fixer が起動する」を満たせない。両 counter を episode 単位にする必要がある。

### 制約

- attempt 採番（永続 state の `StepRun.attempt`）は `state.steps[step].length + 1` から導出される（`src/core/step/executor.ts`, `src/store/job-state-store.ts`）。`fixerIters` とは無関係。
- `loopIters` / `fixerIters` は `runInternal` のローカル `const Map` であり、永続化されず resume に流れない。run ごとに空から再生成される。

## Goals / Non-Goals

**Goals**:

- dedicated fixer を持つ loop（`loopFixerPairs` にキーがある spec-review / verification / code-review）の試行 budget を **convergence episode 単位**にする。loop の fixer 以外の直前 step から gate へ到達したら budget をリセットし、fixer から戻った周回は継続カウントする。
- リセットは gate の `loopIters` と paired fixer の `fixerIters` を **両方** 0 に戻す（episode budget 全体を fresh にする）。
- dedicated fixer を持たない loop（conformance）は lifetime counter を保持し、impl 再実行回数を `maxIterations` で bound する停止性を維持する。
- 単一 episode 内の exhaustion / bypass 挙動を不変に保つ。

**Non-Goals**:

- `maxIterations` の値そのものの調整。
- exhaustion 時の error shape / メッセージ（`LOOP_ERROR_CODES`, `src/core/pipeline/types.ts`）の変更。
- attempt 採番ロジック（`StepRun.attempt` の導出）の変更。
- resume 時の `resolveResumeStep` ロジックの変更。
- transition table（`STANDARD_TRANSITIONS`）の変更。

## Decisions

### D1: fresh-episode リセットを「gate への非 fixer 直前 step からの到達」で起点化する

loop step を `runInternal` 内で再入する経路（`implementer→verification` / `conformance→implementer→verification` / resume 復帰）を、すべて「直前 step がその gate の paired fixer ではない」という単一条件で fresh episode として扱う。条件成立時、`loopIters[gate]` と `fixerIters[loopFixerPairs[gate]]` を 0 にリセットする。

判定式（gate を入場しようとする時点、直前 step を `predecessor` とする）:

```
isFixerPairLoop  = loopFixerPairs[gate] !== undefined
arrivedFromFixer = predecessor === loopFixerPairs[gate]
freshEpisode     = isFixerPairLoop && !arrivedFromFixer
```

- 初回到達（`implementer→verification`）: predecessor は fixer ではない → fresh。`Map` は空なので実質 no-op（iter 1 から）。
- fixer からの周回（`build-fixer→verification`, `spec-fixer→spec-review`, `code-fixer→code-review`）: predecessor === paired fixer → 継続。同一 episode で `maxIterations` を超えれば従来通り exhaust。
- 再入（`conformance→implementer→verification`）: predecessor（implementer）は fixer ではない → fresh budget。
- resume 復帰: `runInternal` の `Map` が空から再生成されるため、本リセットに依存せず fresh。本条件は startStep が gate の場合に transition を経由しないが、空 `Map` により自然に iter 1 となり整合する。

**Rationale**: 「pass で loop を抜けた時にリセット」案は正常 exit 経路では等価だが、crash で抜けずに止まり resume した episode を一様に拾えない。entry-from-non-fixer を起点にすれば初回到達・再入・resume を一様に fresh budget として扱える。

**Alternatives considered**:

- *loopIters のみリセット（fixerIters はリセットしない）*: 受け入れ基準を満たせない。観測シナリオでは `fixerIters[build-fixer]` が前 episode で max に達しており、fixer entry-guard が build-fixer を弾く。`loopIters` リセットだけでは "build-fixer 起動" に至らない。→ 棄却。
- *exhaustion 判定を全 loop へ無条件でリセット適用*: conformance（`loopFixerPairs[conformance]` が undefined）でも常にリセットされ、lifetime bound が無効化されて無限ループになる（architect 指摘）。→ 棄却（D2 で明示的に除外）。
- *`fixerIters` を episode スコープに作り変える大規模改修*: scope を超える。`fixerIters` は既存の attempt 採番に使われていない（採番は store 由来）ため、必要なのは episode 起点での 0 リセットのみ。→ 棄却。

### D2: conformance（dedicated fixer なし loop）は lifetime counter を保持する

`loopFixerPairs` には spec-review / verification / code-review のみがエントリを持ち、conformance は持たない。D1 の `freshEpisode` 判定は `isFixerPairLoop` を AND 条件に含むため、conformance は `nextStep` になってもリセットされない。

conformance は impl phase 全体を再実行する外側 loop であり、`needs-fix` は implementer 経由で phase 全体を再走させる。毎回 upstream（code-review）から到達するため predecessor で fresh/continuation を区別できない。conformance の `loopIters` を lifetime のまま維持することで、`maxIterations` 回の impl 再実行で停止性が保証される（no-fixer loop の即時 exhaustion check が機能する）。

**Rationale**: 停止性の要。conformance をリセット対象に含めると exhaustion が無効化され無限ループになる。

### D3: リセットは「transition 解決後・exhaustion check 前」に 1 箇所で行う

`loopIters[gate]` のリセットは loop entry-guard が `loopIters[nextStep]` を読む **前** に行わなければならない（読んだ後では stale 値で誤 escalate する）。同様に `fixerIters[pairedFixer]` のリセットは fixer entry-guard が読む前に有効化されている必要がある。

両者を満たす単一の挿入点は、`runInternal` ループ内で `nextStep` を解決し terminal（`end` / `escalate`）を処理した **直後**、各 exhaustion check の **直前**。ここで `currentStep` を predecessor、`nextStep` を入場対象 gate として D1 の判定を行い、成立時に両 `Map` を 0 にする。

- `loopIters[gate]=0` → 次イテレーション冒頭の loop entry bookkeeping が `0+1=1` にする（fresh iter 1）。
- `fixerIters[pairedFixer]=0` → そのまま次に fixer entry-guard を通過する時点で fresh budget。

loop entry bookkeeping（入場時の `+1`）自体は変更しない。挿入はリセット 1 ブロックのみで、既存ロジックへの破壊的変更を避ける。

**Rationale**: 局所変更で済み、exhaustion check のタイミング依存を満たす。entry bookkeeping を書き換えるより diff が小さく回帰リスクが低い。

### D4: `fixerIters` リセットは attempt 採番・resume を侵さない

`fixerIters` は `runInternal` のローカル `Map` で、永続化されず resume に流れない。永続 state の `StepRun.attempt` は `state.steps[step].length + 1` から導出される（`fixerIters` 非依存）。したがって in-memory budget の episode リセットは attempt 採番・resume 挙動を変えない。これにより request.md の scope-out「fixer counter の resume attempt 採番系統は不変」と両立する。

**Rationale**: scope-out との整合を観測可能な事実（採番が store 由来であること）で裏付ける。

## Risks / Trade-offs

- [Risk] request.md の「根本原因」が `loopIters` のみを挙げており、`fixerIters` リセットを含めると scope-out（fixer counter）と矛盾して見える。
  → Mitigation: D4 で「`fixerIters` は in-memory budget であり attempt 採番に使われない」ことをコードで裏付け、リセットが resume 採番を侵さないことを明示。受け入れ基準「build-fixer が起動する」は両 counter リセットなしには満たせない（観測トレースで確認済み）。

- [Risk] conformance を誤ってリセット対象に含めると無限ループ化する。
  → Mitigation: `freshEpisode` 判定に `isFixerPairLoop`（`loopFixerPairs[gate] !== undefined`）を AND 条件として組み込み、conformance を構造的に除外。停止性回帰テスト（conformance だけ繰り返し失敗 → `maxIterations` 回で escalate）で守る。

- [Risk] 単一 episode 内の bypass（review-after-final-fix）が壊れる。
  → Mitigation: bypass 経路（`build-fixer↔verification` 等）は predecessor === paired fixer のため `freshEpisode=false` でリセットされない。`fixerIters` は episode 内で累積し続け、bypass 判定は不変。既存 bypass テスト（TC-061 系 / code-fixer-final-iter-reviewed）が green であることで守る。

## Open Questions

- なし（request.md と観測トレースで意図は確定。`fixerIters` リセットの要否はコード読解で確定済み）。
