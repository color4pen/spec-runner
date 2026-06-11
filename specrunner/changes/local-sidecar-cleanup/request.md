# archive 済み job の machine-local sidecar が削除されず無限に増える

## Meta

- **type**: bug-fix
- **slug**: local-sidecar-cleanup
- **base-branch**: main
- **adr**: false

## 背景

job ごとに作られる machine-local sidecar（`.specrunner/local/<slug>/` — liveness / managed marker）は、job の archive 後に誰も読まないが削除する者もいない。現在 67 ディレクトリが堆積しており、job 数に比例して永遠に増える。

実害は2つ。(1) jobId → slug 解決や `JobStateStore.list` の sidecar 合成がこのディレクトリを全走査するため、堆積分のコストを job 系コマンドが払い続ける。(2) sidecar は slug キーのため、過去に同名 slug の job を作ると前 job の残骸と衝突する事故の温床になる（inbox 二重起動事故の際に sidecar clobber として顕在化した既知の形）。

## 現状コードの前提

- sidecar のパスは `localSidecarDir(slug)` = `.specrunner/local/<slug>`（`src/util/paths.ts:262-270`）
- `job archive` の Phase 2 は worktree 撤去と feature branch 削除を行うが、sidecar には触れない（`src/core/archive/orchestrator.ts:263-265` 周辺）
- sidecar の全走査読者: `src/store/local-job-index.ts:47`（jobId → slug 解決）と `JobStateStore.list` の sidecar 合成（`src/store/job-state-store.ts` 手順 3）
- doctor コマンドが環境診断の置き場として存在する（`specrunner doctor`）

## 要件

1. `job archive` の完了時に、当該 slug の `.specrunner/local/<slug>/` を削除する（best-effort — 削除失敗は archive を失敗させない）
2. doctor に孤児 sidecar の検出を追加する: 対応する job state が archived または不存在の sidecar を列挙し、件数と削除手順を提示する（既存の堆積 67 件の回収経路）
3. running / awaiting-* など非終端 job の sidecar には一切触れない

## スコープ外

- local-job-index の index 化（O(1) 解決）
- `.specrunner/logs/` の retention（既存の maxJobs prune で有界）

## 受け入れ基準

- [ ] archive 完了後に `.specrunner/local/<slug>/` が存在しない
- [ ] sidecar 削除の失敗（権限等）が archive の成否に影響しない
- [ ] doctor が孤児 sidecar を検出・列挙する
- [ ] 非終端 job の sidecar が archive 以外の経路で削除されないことをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 削除のタイミングは archive 時とする。archived job の sidecar（liveness / managed marker）は以後どの経路からも読まれないため安全であり、常駐の sweep を増やさない
- 既存の堆積分は自動削除ではなく doctor の検出 + 提示にとどめる。機械ローカルとはいえ一括削除は診断と分離する
