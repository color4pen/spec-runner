# remote branch から quiescent job を attach する（`job attach --branch`）

## Meta

- **type**: new-feature
- **slug**: remote-branch-job-attach
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260715（architecture/adr/2026-07-15-remote-checkpoint-reattachment-boundary.md）で ratify 済み。本 request はその behavior 実装であり新規 architecture ADR を要さない。 -->

## 背景

ADR-20260605 は truth（`state.json` ＋ `events.jsonl`）を branch-borne に置き、結果として cross-environment resume を掲げた。しかし branch だけを持って別環境で job を復元する要件 ―― 発見・検証・再束縛 ―― は未実装のまま残っている。

ADR-20260715 がその成立要件を構造判断として定めた:

- remote checkpoint は state・events・成果物が同一 tree に揃った単一 commit の性質。`remote-resumable` は送信側フラグでなく `origin/<branch>` HEAD tree への検証可能述語（D1）。
- attach は tree の自己整合を検証してから初めて再束縛する（D2）。
- machine-local state は branch-borne checkpoint から導出可能、または意味的連続性を失わず新規割当可能でなければならない（D3）。
- 射程は quiescent job の attach に限定（D4）。

本 request はこの behavior を実装する。`origin/<branch>` の checkpoint から quiescent job を発見・検証・materialize・rebind し、以後の `job resume` を成立させる `job attach` コマンドを追加する。

## 現状コードの前提

- `job attach` コマンドは存在しない。`src/cli/command-registry.ts` の job サブコマンドは resume / cancel / archive 等のみ。
- `resolveJobStateBySlug`（`src/core/resume/resolve-job.ts:18-19`）は `JobStateStore.list(repoRoot)` に委譲し、ローカル checkout / worktree / archive / sidecar のみを走査する。`origin/*` を fetch・走査しない。
- worktree materialization plan（`src/core/runtime/workspace-materializer.ts:28-33`）の resume 系（`resume-recreated` / `resume-without-recorded-worktree`）は `remoteBaseRef`（= base branch）から worktree を作る（同 `100-101` 行 `manager.create(..., plan.remoteBaseRef, undefined, ...)`）。feature branch の HEAD（checkpoint commit）から materialize する経路が無い。
- machine-local liveness sidecar は `.specrunner/local/<slug>/liveness.json`（`jobId` / `worktreePath` を持つ・gitignore・regenerable）。`src/store/local-job-index.ts` が索引する。
- branch-borne checkpoint は `specrunner/changes/<slug>/`（`state.json` / `events.jsonl` / step 成果物）。worktree ディレクトリ名は `<slug>-<jobId8>`（`src/util/paths.ts:128`）。

## 要件

1. `specrunner job attach --branch <branch>` を追加する。`origin/<branch>` を fetch し、その HEAD tree の branch-borne checkpoint（`specrunner/changes/<slug>/state.json` ＋ `events.jsonl` ＋ resume に要る成果物）を読む。slug は fetch した state から導出する（`getJobSlug`）。branch は明示指定であり、`origin/*` を走査しない。

2. **[最重量] checkpoint 検証述語**: attach は `origin/<branch>` HEAD tree が自己整合であることを検証してから初めてローカル状態を作る（ADR-20260715 D2）。検証項目 = (a) `state.status` が quiescent（`awaiting-resume`）、(b) journal（`events.jsonl`）と projection（`state.json`）の整合、(c) resume point / pipeline 定義が解決可能、(d) resume に必須の成果物が tree に存在、(e) repository / jobId / branch identity の一致。いずれか不成立なら typed error で拒否し、**job state / worktree / sidecar を一切作らない**（capability gate と同型の「検査して throw = 状態を作らない」前例に倣う）。

3. **[最重量] feature branch HEAD からの materialize**: attach は fetch した feature branch の HEAD（checkpoint commit）を checkout した worktree を作る（base branch 起点ではない）。新しい materialization plan variant として追加し、既存の resume 系 plan（base branch 起点）の挙動は変えない。

4. machine-local liveness sidecar を再構築する（`worktreePath` は規約 `<slug>-<jobId8>` から導出、`pid` は null、`jobId` は branch-borne state から）。ADR-20260715 D3 の reconstruction contract を満たす。

5. attach 後、既存の `specrunner job resume <slug>` が変更なしで成立する。attach（tree 検証 → materialize → rebind）と resume（FSM 再開）は別動詞として分離する。

## スコープ外

- `running`（owner 生存・不明）job の別マシン takeover / lease / epoch（ADR-20260715 D4 で別 ADR に分離）。
- `origin/*` の暗黙走査による job 発見（branch は明示指定）。
- attach 後の自動 resume（別動詞のまま。ワンショット alias は後続）。
- 実行経路の state-persist / git 副作用の二相境界の変更（ADR-20260715 で局所に留めると決定済み）。
- managed runtime の attach（本 request は local runtime のみ。managed は worktree を持たず enumeration marker を持つ別経路）。

## 受け入れ基準

- [ ] 自己整合でない checkpoint（`status` が quiescent でない / 必須成果物欠落 / identity 不一致）に対する attach は typed error で失敗し、job state・worktree・sidecar を一切作らないことをテストで固定する。
- [ ] attach が feature branch HEAD（checkpoint commit）を checkout した worktree を materialize し、その worktree に branch-borne な `state.json` / `events.jsonl` が存在することをテストで固定する（base branch tip ではない）。
- [ ] attach 後の sidecar が `jobId`（branch-borne 由来）/ `worktreePath`（規約導出）/ `pid=null` を持つことをテストで固定する。
- [ ] `awaiting-resume` の checkpoint のみ attach 対象とし、`running` は拒否することをテストで固定する。
- [ ] attach → `job resume <slug>` が成立する経路をテストで固定する。
- [ ] 既存の resume 系 materialization plan（base branch 起点）のテストが無変更で green（挙動不変）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

正典は ADR-20260715（本 request はその behavior 実装）。

- **remote checkpoint は単一 commit の性質（D1）**: `remote-resumable` は `origin/<branch>` HEAD tree への検証可能述語であり送信側フラグではない。→ 却下: commit と push を分散トランザクション（2PC）で束ねる案。単一 ref 更新は atomic なので不要。
- **attach は tree の性質検証に責務を閉じる（D2）**: → 却下: 送信側が remote-resumable フラグを state に書く案。送信側は二相の隙間で落ちうり、フラグは完全性を保証しない。
- **machine-local reconstruction contract（D3）**: `worktreePath` は規約導出、`pid` / `session` は attach 時に新規割当（導出ではなく連続性を保つ再割当）。
- **射程は quiescent に限定（D4）**: → 却下: running takeover を本 request で扱う案。lease / epoch が要り失敗意味論が異なるため別 ADR。→ 却下: `origin/*` 走査での発見。走査コスト・誤検出・排他を持ち込むため明示 branch 指定に閉じる。
