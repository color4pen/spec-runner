# pipeline-owned evidence を agent が偽造できないようにする — authorship 検証＋復元＋全経路再検査（P0 fix-forward）

## Meta

- **type**: spec-change
- **slug**: evidence-authorship-enforcement
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260718（pipeline-owned evidence の authorship 境界）で ratify 済み。本 request はその D2〜D5 を、検出＋復元を全経路（per-node commit / resume / attach）で enforce する形で実装する。sandbox OS レベルの journal 除外（#783 の fail-open 是正）は独立 seam の defense-in-depth として follow-up（下記スコープ外）。#464 の一般 denylist も別。新規 architecture ADR を要さない。 -->

## 背景

ADR-20260717 の floor は達成 provenance を記録 anchor（test-case-gen / spec-review / test-materialize / implementer の commit OID）で git tree から再導出する。その anchor・verdict・凍結基準はすべて journal（`specrunner/changes/<slug>/{events.jsonl,state.json}`）に記録された値に根を持つ。ADR-20260718 が定めた不変:

> agent は、正常/異常終了・crash・resume/attach のいずれを経ても、forged な pipeline-owned evidence を正規記録として成立させられない。

現状これが成立しない（調査済み）:
- journal は agent の writable worktree（cwd）内で、agent は Edit/Write/Bash で書ける。
- per-node commit は `git add -A`（`commit-push.ts`）で journal を agent code と同一 commit に載せる。
- 事後の journal 改竄検査は無い（main-checkout guard は main checkout＋`.specrunner/**` を見るだけ）。resume は on-disk を素通り、attach は self-consistency のみで authenticity を見ない。

本 request は「検出＋復元を全経路で」enforce することで不変を閉じる。**agent がどの経路（Edit/Write/Bash/git plumbing）で書いても、pipeline が author した journal と一致しなければ、trusted bytes へ復元してから halt する**。復元＋halt を per-node commit・resume・attach の全経路で行うため、検査前 crash も洗浄経路にならない。

## 現状コードの前提（調査済み・実装はこの前提に沿うこと）

- **journal path**: `specrunner/changes/<slug>/{events.jsonl,state.json}`（`stateRoot=worktreePath`、`src/store/job-location-resolver.ts`）。cwd 配下で agent-writable。`usage.json` も同 dir。
- **pipeline のみが author する write 経路**: `JobJournal.persist`（`src/store/job-journal.ts`、events.jsonl を append・state.json を atomic overwrite）を `JobStateStore.persist` 経由で `CommitOrchestrator` だけが呼ぶ（唯一の persistence owner、`src/core/step/commit-orchestrator.ts`）。**pipeline は自分が書いた journal の bytes を知っている**（digest 可能）。
- **per-node commit**: `commit-push.ts` の `commitAndPush` が `git add -A`→commit `"${step.name}: ${slug}"`→push（`executor.ts:436` の `finalizeStepArtifacts`）。commitOid は commit 後 `captureHeadSha`（`executor.ts:461-466`）。**round 経路には既に journal 除外の前例がある**: `commitScopedPaths`＋`pipelineManagedPaths`（state.json/events.jsonl/usage.json を除外、`src/core/pipeline/round-git-scope.ts:54-55`）。sequential 経路の `git add -A` はこの除外を持たない。
- **node lifecycle**: agent 実行→output-contract gate（`executor.ts:405`）→commit（`:436`）→commitOid capture→apply で persist（`commit-orchestrator.ts`）。inspection は commit 前、evidence(verdict/commitOid) の persist は commit 後。crash がこの inspection を飛ばすと success 記録も残らないが、**journal 自体を偽造する攻撃は lifecycle と無関係に成立する**（journal が agent-writable なため）。
- **resume**: slug 経路（`resolve-job.ts`→`JobStateStore.list`）は corruption も無視して on-disk を fold。jobId 経路（`loadSplitLayout`）は mid-journal corruption のみ reject。**authenticity 検証なし**。
- **attach**: `verify-checkpoint.ts` が fold/counter/profile digest/identity の self-consistency を検証（authenticity でない）。durable な checkpoint は feature branch へ push 済みの journal commit（`commitFinalState` messageLabel="checkpoint"、`commit-push.ts:105-146`）。**origin の checkpoint は agent が push 権を持たず改竄不能**＝durable な agent-unreachable anchor に使える。
- **archive floor**: `deriveAchievedAssurance` が記録 anchor で git 再導出（ADR-20260717）。本 request が journal を偽造不能にすることで、この anchor が信頼できるようになる。
- **runtime primitive**: `readFileAtCommit(oid, suffix, cwd)` / `diffPathsBetweenCommits` / `listCommitChangedFiles`（#849/#850）で commit の tree/内容を読める。`digestArtifacts`（working-tree hash）。`git show <oid>:<path>` 前例（`checkpoint-ref.ts`）。
- **fail-closed / halt 前例**: `StepHalt` / `makeDriftHalt` / escalation（`executor.ts`）。

## 要件

各検査は fail-closed（判定不能は tamper 扱いで halt）。

1. **agent per-node commit を journal 非包含にする（authorship 分離）**: sequential 経路の `commitAndPush` の `git add` を、round 経路と同じ `pipelineManagedPaths`（events.jsonl/state.json/usage.json）を除外する形にする。agent code の commit は journal を運ばない。pipeline は persist した journal を pipeline 管理の write/commit で別途載せる（agent の `git add -A` に混ぜない）。
   - **round 終端の journal sweep（#3b の確定）**: 終端 transition の直前の step が round（例 parallel code-review）で、後続の sequential node が無い場合、coordinator が `commitRound` 完了後・`commitFinalState` 前に pipeline journal commit を1回 emit する。これにより origin の durable anchor が round 分の journal bytes を取りこぼさない。
   - **単一 writer 不変の保持（B-13）**: pipeline journal の write/commit は既存の persistence owner 側で行い、orchestrator（single-writer）に git side effect を持ち込まない。

2. **pipeline-authored anchor（durable・agent 到達不能・crash 生存）**: pipeline が persist するたび、author した journal（events.jsonl＋state.json の**全体**）の content digest を anchor として保持する。
   - **in-process anchor**: `JobJournal.persist` の書込直前に digest を更新する。継続実行中は full bytes の digest を持つ。
   - **resume seed（#1 の解消・必須）**: `persist` が既存 journal（`existingCounters` が非 null）を検出したとき、**delta を書く前に on-disk の events.jsonl＋state.json を1度だけ full 読みして in-process anchor を seed する**。これは write 前の read であり「書込後は再読しない」（D1）に反しない。seed 後の append で anchor は full bytes を反映する。resume（新 process）でも in-process anchor が full を表すため、per-node 検査が false-positive にならず、初回 resumed node の tamper 窓も生じない。
   - **durable anchor（object 形・#3a の確定）**: digest を **git blob ref `refs/specrunner/evidence/<branch>`**（digest 文字列を encode した blob を `git update-ref` で指す。history を持たない最小形）に置き、checkpoint push（`commitFinalState`）時に origin へ push する。agent は push 権も pipeline 管理 ref namespace も持たないため改竄不能、crash を跨いで参照可能。

3. **committed-tree／on-disk の authorship 検証（全経路）**: 次の各点で、journal（committed tree と worktree の on-disk）が pipeline-authored anchor と一致することを検証する。baseline は経路で異なる:
   - **per-node commit 後**: baseline は（seed 済みの）**in-process anchor**。agent の node commit に journal 変更が含まれないこと（parent との journal diff が空）、かつ worktree の on-disk journal が in-process anchor と一致すること。git plumbing による tree 差し替えもここで committed-tree を見て捕える。
   - **resume load 時**: baseline は **durable origin anchor**（`refs/specrunner/evidence/<branch>`）。on-disk journal の digest が origin anchor と一致すること（検査前 crash を跨いだ偽造を洗浄させない）。
   - **attach 時**: `verify-checkpoint` に authenticity 述語を足し、checkpoint tree の journal digest が durable anchor と一致すること（self-consistency に authenticity を重ねる）。
   - **absent-anchor 規則の統一（#5）**: in-process と durable の**両方が absent** かつ on-disk journal も空/不在（新規 job の初回 write 前）→ skip（baseline が無い）。両方 absent だが on-disk journal は存在 → tamper（fail-closed）。in-process が absent だが durable が present → durable を baseline に使う（resume seed 前の窓）。
   不一致は偽造。

4. **違反時は trusted bytes へ復元してから halt**: 検証不一致を検知したら、**anchor の pipeline-authored journal を復元してから** escalation で halt する。tampered bytes のまま進めず・persist せず・merge へ渡さない。復元元は per-node では pipeline-authored な直近 bytes、resume/attach では origin anchor。

5. **false-positive を出さない**: pipeline 自身の正当な journal 書込（persist / checkpoint）は違反として扱わない。継続実行・resume・attach の正常系で halt しないことを固定する。

6. **per-node journal push の bytes 範囲と ordering（#2 の明示）**: per-node の pipeline journal commit は **begin の persist までの journal bytes** を捕える。`commitSuccess` が append する success-era bytes（verdict history＋success persist）は per-node commit に含めず、**次 node の journal commit または checkpoint（`commitFinalState`）で push される**。これは single-writer 不変（B-13）を保つための意図的な ordering。
   - 含意として、**per-node journal push と次の `commitSuccess` の間で crash → resume すると、success-era bytes が durable anchor に未反映のため resume 検査が halt し得る**。これは fail-closed 側（human resume）へ倒す accepted posture とする（tamper を通すより安全）。
   - この crash-recovery 窓の halt は、要件5 が禁じる**正常系の false-positive とは区別する**。要件5 は crash を経ない継続実行・意図的停止からの resume・attach を対象とする。

## スコープ外（理由付きで明示。歯を黙って削らない）

- **sandbox OS レベルの journal 除外＋#783 の fail-open 是正**: agent の write を OS sandbox で journal から締め出し、sandbox 利用不能をこの境界で fail-closed にする defense-in-depth（ADR-20260718 D2 の sandbox 層）。claude-code adapter（`agent-runner.ts`）と #783 に跨る独立 seam なので **follow-up request**。本 request は「検出＋復元を全経路で」＝ agent がどう書いても正規記録に成立させない、を検出側で閉じる。sandbox 除外はそれを前段で防ぐ第二層。
- **#464 の一般 commit denylist**（`.specrunner/**` 等 machine-state 全般）: 本 request は pipeline-owned **evidence journal** に限定。他 machine-state paths の denylist は別。
- **B（全 step epistemic-contract 監査）/ C（per-scenario・dogfood 有効化）**: 既定どおり別。
- **R5** provenance carry、**R6** fast。

## 受け入れ基準（歯を名指しする。各 positive に対し time/path を跨ぐ adversarial negative を必須にする）

- [ ] **T1（Edit/Write 反例）**: agent が node 実行中に `events.jsonl` または `state.json` を Edit/Write で改竄したケースを再現し、per-node 検証が偽造を検出→trusted bytes へ復元→halt することを固定する。**破壊確認**: 復元＋halt を外すと tampered journal が commit/次工程へ通ること。
- [ ] **T2（Bash 反例）**: agent が Bash で journal を改竄したケースで同様に検出→復元→halt することを固定する。
- [ ] **T3（git plumbing 反例）**: agent が `git add`/plumbing で tampered journal を commit の tree に入れたケースで、committed-tree 検証が捕えて halt することを固定する（worktree だけでなく committed tree を見る歯）。
- [ ] **T4（crash→resume 反例）**: node 実行中に journal を改竄した状態で process が落ち、post-node 検証を経ずに resume したケースで、**resume load 時の検証**が origin anchor と照合して偽造を検出→復元→halt することを固定する（検査前 crash が洗浄経路にならない）。
- [ ] **T5（協調改竄反例）**: `events.jsonl` と `state.json` を整合させて同時改竄したケースで、両者とも anchor と不一致になり検出→halt することを固定する。
- [ ] **T6（false-positive 無し）**: pipeline の正当な persist/checkpoint による journal 更新が、継続実行・resume・attach の正常系で halt を起こさないことを固定する。ここでの resume は **意図的な `awaiting-resume` 停止（escalation / 完走待ち）からの再開**を指し、要件6 が accepted posture とする crash-recovery resume は含めない。
- [ ] **T7（authorship 分離）**: sequential per-node commit が `pipelineManagedPaths`（events.jsonl/state.json/usage.json）を除外し、agent code commit に journal 変更が含まれないことを固定する。
- [ ] **T8（backward-compat）**: 既存 pipeline / commit-push / resume / attach / verify-checkpoint / archive の挙動保存テストが無変更で green（本 request で authenticity が加わる期待の追加を除く）。`typecheck && test` が green。

## architect 評価済みの設計判断

- **検出＋復元を全経路（per-node / resume / attach）で enforce する**。→ 却下: post-run に一度検査するだけ（検査前 crash が洗浄する、ADR-20260718 D4）。→ 却下: prompt で journal 改変を禁止（enforcement にならない）。
- **anchor は pipeline-authored journal digest を origin の pipeline 管理 ref に push（agent 到達不能・crash 生存）**。→ 却下: worktree 内 / local のみに置く（agent が到達し得る、crash 後の trust 源にならない）。→ 却下: state.json 内に digest を書く（agent が同時に書き換えられる）。
- **agent per-node commit を journal 非包含にする（round 経路の既存除外を sequential に拡張）**。→ 却下: `git add -A` のまま journal を agent commit に同梱（authorship が分離しない）。
- **違反時は trusted bytes へ復元してから halt**。→ 却下: tampered bytes のまま halt（次の resume/attach が汚染 bytes を拾う）。
- **sandbox OS 除外(#783)は defense-in-depth の別 request**。→ 却下: 本 request に sandbox seam を混ぜて肥大化（検出側で不変は閉じる、sandbox は前段の第二層）。
- **本 request は evidence journal に限定**。→ 却下: #464 の machine-state 全般 denylist を前倒し。
