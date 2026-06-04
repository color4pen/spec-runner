# signal 中断時の resumePoint に、起動 step でなく中断時の実行中 step を記録する

## Meta

- **type**: bug-fix
- **slug**: resume-record-interrupted-step
- **base-branch**: main
- **adr**: false

## 背景

signal（SIGINT/SIGTERM）で中断したとき、cleanup ハンドラが job を `awaiting-resume` に遷移し、再開位置として `resumePoint.step` を記録する。しかしこの記録値が、中断時に実行していた step ではなく、**pipeline を起動した step（`startStep`）** になっている。

`src/core/runtime/local.ts` の signal cleanup は、直前で job state を load して実行中 step（`state.step`）を保持しているにもかかわらず、`resumePoint.step` には引数の `startStep` を書いている。

このため、例えば design から起動して code-review 実行中に中断すると、resume が **design からやり直しになる**。`resolveResumeStep` は記録された step を起点に再開位置を決めるため、誤った起点が以後の再開判断を狂わせる。

## 要件

1. signal 中断時の `resumePoint.step` に、load 済み state の実行中 step（`state.step`）を記録する。`state.step` が null/undefined の場合のみ `startStep` に fallback する。
2. 中断時の resume が、起動 step でなく中断時に実行していた step（またはその正しい再開先）から再開する。

## スコープ外

- `resumePoint` を中断事由つきの型へ再設計すること（discriminated union 化）。
- `resolveResumeStep` の再開位置決定ロジック（2a/2b/2c）の変更。
- adr-gen の日付 path による再走二重生成、exit code 多値化、retry/resume の概念分離。
- managed runtime の signal ハンドラ追加。

## 受け入れ基準

- [ ] signal 中断時、`resumePoint.step` が中断時の実行中 step（`state.step`）になる。
- [ ] `state.step` が null/undefined の場合のみ `startStep` に fallback する。
- [ ] 後半 step（例: code-review）の実行中に中断 → resume がその step（またはその正しい再開先）から再開し、起動 step（design）に戻らない。
- [ ] 既存の resume 関連テスト・状態遷移が green（回帰なし）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- これは設計変更でなく**記録バグの修正**。`signalCleanup` は既に `state` を load 済み（同関数内）で、必要な値（`state.step`）が手元にあるのに使っていないだけ。修正は「`startStep` を書く」→「`state.step ?? startStep` を書く」に置き換える最小変更。
- `resumePoint` の型・`resolveResumeStep` のロジックは変更しない。記録される**値**を正すことが本 request の唯一の目的であり、記録の**型**を変える再設計（事由の discriminated union 化）は別 request に分離する。理由：書き込み値の正しさが、型付けや再開ロジック簡素化の前提になるため、まず値を正す。
- `resolveResumeStep` の 2a（fixer-empty 検出）など周辺事実からの補正ロジックは**残す**。本修正で記録値が正しくなることで、その補正が信頼できる入力を得るようになるが、補正自体の除去は本 request では行わない。
- managed runtime には signal ハンドラが無いため本修正は local runtime のみに効く。runtime 間の中断挙動の非対称解消は別 request。
