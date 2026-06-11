# inbox の start 実行直前に issue の linkage を再確認する

## Meta

- **type**: bug-fix
- **slug**: inbox-start-recheck
- **base-branch**: main
- **adr**: false

## 背景

inbox は tick 冒頭で start 計画を立て、各 start を直列に実行する。startJob は pipeline の完走まで戻らないため、計画に複数の start が含まれる場合、2 本目以降は数十分後に実行される。その間に別の tick が同じ issue を start していても、計画時点のスナップショットに基づく重複排除は再評価されず、同一 issue から複数の job が起動する。

実測: 同時にラベル付与された 2 issue（#615 / #616）を含む tick が、1 本目（#616）の pipeline 完走後に 2 本目（#615）を start し、その 25 分前に別 tick が #615 を既に start していたため、同一 issue から 2 job・2 worktree が並走した。

## 現状コードの前提

- inbox は plan.starts を for ループで直列に await し、各 startJob は pipeline 完走まで戻らない（src/core/inbox/run-inbox.ts:144-156）
- start の重複排除は計画時点の job state から作る linkedIssueNumbers のみで行われ、実行直前の再確認は無い（src/core/inbox/planner.ts:36-48）

## 要件

1. start action の実行直前に対象 issue の linkage を再確認し、既に job に link 済みであれば start を skip する

## スコープ外

- start の並列実行化・実行順の変更

## 受け入れ基準

- [ ] 計画後に link 済みとなった issue の start が skip される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

TBD
