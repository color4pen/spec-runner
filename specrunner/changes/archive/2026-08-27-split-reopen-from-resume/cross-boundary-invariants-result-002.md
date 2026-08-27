# Cross-Boundary Invariants Review — Iteration 2

<!--
verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
findings は report_result（typed）で報告し、この file はその evidence report である。
-->

## 検証範囲

- `git diff main...HEAD --stat` で変更範囲を確認した。
- `design.md` と `tasks.md` を読み、reopen の state-only 遷移、resume の execution ownership、Actions の逐次合成を確認した。
- iteration 1 の finding 対象である `src/core/inbox/planner.ts` を現内容で再読し、修正後の通常 escalation と reopen 後 polling の両経路を確認した。
- 新たな `awaiting-archive → awaiting-resume` 経路について、未変更側の ResumeCommand、inbox planner / executor、attach policy、state projection、worktree safety gate の前提を確認した。
- operator 裁定済みの workflow は読み取りとテストに限定し、編集していない。

## 新経路と隣接不変条件

| 新経路 | 隣接機構 | 確認結果 |
|---|---|---|
| local `reopen` → 明示的 `resume --from` | ResumeCommand status gate / ingress safety | reopen は run-control fields のみを clear し、resume は既存の `awaiting-resume → running` gate と `--prompt` / `--adopt-commits` / `--apply-canon` を通る |
| Actions `reopen` → 同一 shell の `resume` | shell fail-fast / state store | reopen と resume は逐次実行され、reopen failure では後段へ進まず、成功時は同一 checkout の persisted state を resume が読む |
| issue-linked job の reopen → inbox polling | comment-based auto-resume | `effectiveCutoff = max(escalation marker, job.updatedAt)` により reopen より前の `/resume` は再消費されず、reopen 後の新規 `/resume` のみが対象になる |
| 通常 escalation → inbox polling | escalation marker ordering | state transition より後に投稿される marker が cutoff となるため、従来どおり marker 後の `/resume` が消費される |
| reopen 後の attach / projection | attach resume policy / journal projection | `resumePoint: null` でも保存済み `state.step` から解決可能で、明示 `--from` を使う local / Actions resume の契約とも矛盾しない |

## Prior finding resolution

### iteration 1 F-001 — 解消済み

`planResumes()` は escalation marker の timestamp だけでなく `job.updatedAt` も cutoff に使用する。reopen transition は `transitionJob()` により `updatedAt` を更新するため、過去に消費済みの `/resume` comment は候補から除外される。追加テストは次の三つの組み合わせを固定している。

1. reopen 前の stale `/resume` は再消費しない。
2. reopen 後の fresh `/resume` は消費する。
3. 通常の初回 escalation では marker 後の `/resume` を従来どおり消費する。

修正は前周の具体的な再現列を閉じており、同一 finding の再指摘はない。

## Findings

なし。

## Observations

- comment timestamp と state `updatedAt` は文字列比較されている。GitHub timestamp の精度境界と同一秒に reopen / comment が競合する場合は厳密な前後関係を表せないが、通常の supported execution で具体的かつ material な破壊列とは判断しなかったため finding にはしていない。
- operator event append 後に transition persist が失敗すると event のみ残る durability 順序は従来設計どおりであり、その event を state transition 完了と誤認する consumer は確認できなかった。

## Verification evidence

- `bunx vitest run src/core/inbox/__tests__/planner.test.ts src/core/command/__tests__/reopen-command.test.ts src/state/__tests__/lifecycle-reopen.test.ts tests/unit/workflow/specrunner-dispatch.test.ts`
- Result: 4 files passed, 50 tests passed, exit code 0。
- Vitest の GitHub Actions summary reporter は sandbox 外の read-only path への書き込みで `EROFS` warning を出したが、test process 自体は exit code 0 で完了した。

## Evidence summary

- Checked: 5 boundary paths
- Skipped: 0
- Unverified: 0
