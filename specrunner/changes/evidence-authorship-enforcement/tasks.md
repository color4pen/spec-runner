# Tasks: pipeline-owned evidence journal の authorship 強制

> 実装順序の原則: pure 基盤（digest / holder / git plumbing）→ journal 統合 → authorship 分離 → 各経路の検証・復元配線 → 反例・回帰テスト。テストは interface（port seam / pure 関数 signature）確定後に書く。managed runtime は全 seam で no-op（tamper 面が無い構造的非該当）。

## T-01: pure anchor 基盤（digest / holder / absent 規則）と byte 一致 write

- [x] `src/store/journal-anchor.ts` を新規作成する。
  - `computeJournalDigest(eventsBytes: string, stateBytes: string): string` — length-delimited concat（例 `"events:"+len+":"+events+"\n"+"state:"+len+":"+state`）の sha256 を `"sha256:"+hex` で返す pure 関数。
  - `class JournalAnchorHolder` — full authored bytes を単一 job scope で保持: `events: string | null`、`state: string | null`、`seeded: boolean`。メソッド `isSeeded()`、`seed(events, state)`、`appendEvents(line)`、`setState(state)`、`markSeeded()`、`snapshot(): { events, state, digest } | null`（両方 null → null、片方は空文字補完、digest は `computeJournalDigest`）。復元用に full bytes を返せること。
  - `evaluateAnchorPresence(input: { inProcess: string | null; durable: string | null; onDiskDigest: string | null }): { kind: "skip" } | { kind: "use"; baseline: string } | { kind: "tamper" }` — absent 規則（design D7）の pure 判定: 両 absent かつ onDiskDigest null → skip、両 absent かつ onDiskDigest 非 null → tamper、inProcess absent・durable present → use(durable)、inProcess present → use(inProcess)。pre-branch/pre-feature の ref-absent skip は呼び出し側（durable=null を渡すか否か）で表現する。
- [x] `src/util/atomic-write.ts` に `atomicWriteString(filePath, content: string, options?): Promise<void>` を追加し、`atomicWriteJson` をその薄いラッパ（`JSON.stringify(data,null,2)+"\n"` を渡す）に refactor する。書き込み byte と holder 蓄積 byte を単一 source にするため、JobJournal は pre-serialized 文字列を `atomicWriteString` へ渡し同じ文字列を holder に入れられること。
- [x] pure テストを追加する（`computeJournalDigest` の決定性・byte 変化で digest 変化、holder の seed/append/setState/snapshot、`evaluateAnchorPresence` の全分岐、`atomicWriteJson` が `atomicWriteString` 経由で従来 byte を保つ round-trip）。

**Acceptance Criteria**:
- `computeJournalDigest` が同一 bytes に同一 digest、1 byte 変化で異なる digest を返す。
- holder が fresh 蓄積・seed・fast(state のみ)・delta の各系列で full bytes を再現し snapshot.digest が `computeJournalDigest` と一致する。
- `evaluateAnchorPresence` が design D7 の全分岐を返す。
- `atomicWriteJson` の出力 byte が従来と同一（既存 state.json 読取テストが無変更 green）。
- `bun run typecheck` が green。

## T-02: durable anchor の git plumbing（`refs/specrunner/evidence/<branch>`）

- [x] `src/git/evidence-anchor-ref.ts` を新規作成する（`SpawnFn` 直叩き、`src/git/checkpoint-ref.ts` と同じ src/git 層規約: adapter/core を import しない）。
  - `evidenceAnchorRefName(branch: string): string` → `refs/specrunner/evidence/<branch>`。
  - `pushEvidenceAnchor(spawnFn, cwd, branch, digest): Promise<void>` — `git hash-object -w --stdin`（digest を書き込み blob OID を得る）→ `git update-ref <ref> <blobOid>` → `git push origin <ref>:<ref>`。best-effort（throw しない、失敗は stderr 警告）。
  - `readEvidenceAnchor(spawnFn, cwd, branch): Promise<{ kind:"present"; digest:string } | { kind:"absent" } | { kind:"unavailable"; reason:string }>` — `git fetch origin <ref>:<ref>`（ref 不在の非 0 → absent、network 等その他非 0 → unavailable）→ `git cat-file blob <ref>` → digest 文字列（trim）。
- [x] git plumbing の unit テストを追加する（既存 `checkpoint-ref` の spawn fake パターンを再利用）: push が hash-object→update-ref→push を順に呼ぶ、read が present/absent/unavailable を返す。

**Acceptance Criteria**:
- `pushEvidenceAnchor` が blob 作成 → update-ref → push を実行し、push 失敗でも throw しない。
- `readEvidenceAnchor` が ref present で digest、ref 不在で absent、network 失敗で unavailable を返す。
- `bun run typecheck` が green。

## T-03: JobJournal に in-process anchor を統合する（累積・seed）

- [x] `src/store/job-state-store.ts` の `JobStateStore` constructor opts に `anchorHolder?: JournalAnchorHolder` を追加し、`JobJournal` へ渡す（`src/store/job-journal.ts` の constructor も holder を optional で受ける）。既存 caller は無変更（未指定＝anchor 追跡なし）。
- [x] `src/store/job-journal.ts` の全 journal mutation 経路で holder を更新する（holder 有りのときのみ）。**書いた bytes を再読しない**（seed の1回を除く）:
  - `persist`: 冒頭で「`existingCounters !== null` かつ holder 未 seed」なら on-disk events.jsonl＋state.json を1度 full 読みして `holder.seed(...)`（delta を書く前）。fresh 経路は各 append 行を `holder.appendEvents(line)`、state 文字列を `holder.setState(str)`、`holder.markSeeded()`。fast 経路は `holder.setState(str)` のみ。delta 経路は各 delta 行を `holder.appendEvents(line)`、state 文字列を `holder.setState(str)`。state.json は pre-serialized 文字列を `atomicWriteString` で書き、同文字列を holder に入れる。events 行は書き込みと同一 `JSON.stringify(record)+"\n"` を holder に入れる。
  - `appendInterruption` / `appendLineage`: events.jsonl へ append する行を holder にも append する（seed 未了なら先に seed）。
- [x] holder 更新を1箇所（private helper 経由）に集約し、events mutation で必ず通るようにする。
- [x] JobJournal の unit テストを追加する: fresh→delta→fast→interruption→lineage の系列後に `holder.snapshot().digest` が on-disk 全 bytes の `computeJournalDigest` と一致する。resume seed（新 holder＋既存 on-disk）で最初の mutation 前に full 読みして seed し、以後 on-disk と holder が一致し続ける。

**Acceptance Criteria**:
- 継続実行の全 mutation 経路で holder が on-disk journal と byte・digest 一致する（interruption/lineage 追記含む）。
- resume seed が最初の mutation で1度だけ on-disk を読み、以後は再読しない。
- holder 未注入（managed/test/直接構築）で従来挙動が無変更。
- `bun run typecheck` が green。

## T-04: authorship 分離（sequential 除外＋pipeline journal commit＋round sweep）

- [x] `src/core/step/commit-push.ts` の `commitAndPush`（L48）の staging を `pipelineManagedPaths(slug)`（`round-git-scope.ts:54-56`）除外に変える（`git add -A -- . ':(exclude)<state.json>' ':(exclude)<events.jsonl>' ':(exclude)<usage.json>'`）。agent self-commit（HEAD advance）分岐（L62-73）は保持する。
- [x] `commitJournalArtifacts(cwd, branch, slug, infra)` を `commit-push.ts` に追加する（`commitScopedPaths` を `pipelineManagedPaths(slug)` を stagePaths として再利用、commit message `journal: <slug>`）。stage 対象が空/変化無しなら no-op。
- [x] `src/core/port/runtime-strategy.ts` に optional メソッド `commitJournalArtifacts(cwd, branch, slug, commitPushInfra): Promise<void>` を宣言し、`RealRuntimeStrategy` intersection に required で追加する。
- [x] `src/core/runtime/local.ts` に実装を追加（`commit-push.ts` の `commitJournalArtifacts` へ委譲）。`src/core/runtime/managed.ts` は no-op。
- [x] `src/core/step/executor.ts` の sequential 経路で、`finalizeStepArtifacts`（`:445`）＋commitOid capture（`:463-466`）の後、返却前に `commitJournalArtifacts` を呼ぶ（`!deps.roundOwnsGitEffects` guard 下、per-node 検証 T-05 の後）。begin-persist bytes を捕える（success-era は含めない、design D8）。
- [x] `src/core/pipeline/parallel-review-round.ts` の `run` で `commitRound`（`:326`）の後に `commitJournalArtifacts` を1回呼ぶ（round sweep、`state.branch` / `deps.cwd` 使用、`listWorktreeChanges` 相当の infra 再利用）。

**Acceptance Criteria**（= T7 の実装面）:
- sequential per-node の agent code commit が `events.jsonl`/`state.json`/`usage.json` を含まない。
- pipeline journal commit が pipeline-managed paths のみを載せ、commitOid は agent code commit を指す。
- round 後に journal sweep が1回走る（idempotent）。managed は全 no-op。
- `bun run typecheck` が green。

## T-05: per-node authorship 検証・復元・halt（baseline=in-process anchor）

- [x] `src/core/port/runtime-strategy.ts` に optional メソッドを追加し `RealRuntimeStrategy` に required で足す:
  - `verifyNodeJournalAuthorship(input: { headBeforeStep: string | null; cwd: string; slug: string }): Promise<{ kind:"ok" } | { kind:"skip" } | { kind:"tamper"; detail: string }>`。
  - `restoreJournalToAnchor(input: { cwd: string; slug: string }): Promise<boolean>`（in-process anchor の full bytes を on-disk へ書く。holder 未確立なら false）。
- [x] `src/core/runtime/local.ts` に実装する（`this.journalAnchor` holder を参照）:
  - committed-tree 歯: `diffPathsBetweenCommits(headBeforeStep, HEAD, pipelineManagedPaths(slug), cwd)` 非空 → tamper。`headBeforeStep===null` または HEAD 不変 → この歯 skip。
  - on-disk 歯: on-disk events.jsonl＋state.json raw を `computeJournalDigest` し holder digest と比較。absent 規則（`evaluateAnchorPresence`、durable は per-node では未使用＝null 相当、baseline=in-process）に従い skip/ok/tamper を返す。
  - `restoreJournalToAnchor`: `holder.snapshot()` の bytes を events.jsonl / state.json へ atomic write。
  - managed（`managed.ts`）: `verifyNodeJournalAuthorship` は常に `skip`、`restoreJournalToAnchor` は false（no worktree）。
- [x] `src/errors.ts` に error code `JOURNAL_AUTHENTICITY_VIOLATION` と factory `journalAuthenticityViolationError(detail)` を追加する（`journalCorruptedError` の隣、restore/resume を促す hint）。
- [x] `src/core/step/step-halt.ts` に `makeJournalTamperHalt(detail, stepName, slug, recordOpts?)` を追加する（`kind:"awaiting-resume"`、code `JOURNAL_AUTHENTICITY_VIOLATION`、resumePoint=当該 step、interruption reason `failure`、history `{step}-journal-tamper-detected`）。
- [x] `src/core/step/executor.ts` の sequential 経路で、commitOid capture 後・`commitJournalArtifacts`（T-04）前に `verifyNodeJournalAuthorship` を呼ぶ。`tamper` なら `restoreJournalToAnchor` → `makeJournalTamperHalt` を `{kind:"halt"}` で返す（`commitJournalArtifacts` は実行しない）。`ok`/`skip` は継続。`!deps.roundOwnsGitEffects` かつ `deps.runtimeStrategy` 有りのときのみ実行（round member・managed は skip）。

**Acceptance Criteria**:
- Edit/Write/Bash による on-disk 改竄で on-disk 歯が tamper を返す。
- git plumbing で node commit tree に journal を注入すると committed-tree 歯が tamper を返す（worktree が clean でも）。
- tamper 時 restore が in-process anchor bytes を on-disk へ書き、halt が awaiting-resume を返す。
- 正常系（begin→検証間に legit journal write 無し）で ok を返し halt しない。
- managed は skip。`bun run typecheck` が green。

## T-06: durable anchor を checkpoint で origin へ push する

- [x] `src/core/runtime/local.ts` の `commitFinalState`（`:668-674`）で、既存 `commit-push.ts` の `commitFinalState`（journal push）の後、`state.branch` が非空かつ `this.journalAnchor.snapshot()` が present のとき `pushEvidenceAnchor(this.wrappedSpawnFn, cwd, branch, digest)` を呼ぶ（best-effort、throw しない）。awaiting-resume（checkpoint）・awaiting-archive（finalize）の両経路で走る。
- [x] `src/core/runtime/managed.ts` の `commitFinalState` は無変更（no-op のまま）。
- [x] LocalRuntime レベルの unit テストを追加する（fake spawn）: checkpoint で anchor digest が update-ref＋push される、branch 空/holder 未確立で push しない。

**Acceptance Criteria**:
- terminal（awaiting-resume / awaiting-archive）で origin evidence anchor が in-process digest で push される。
- branch 不在 / anchor 未確立で anchor push が skip される。
- push 失敗が terminal 遷移を壊さない（throw しない）。
- `bun run typecheck` が green。

## T-07: resume authenticity（baseline=durable origin anchor、復元してから halt）

- [x] `src/core/resume/verify-journal-authenticity.ts` を新規作成する。`verifyResumeJournalAuthenticity(input: { cwd: string; branch: string | null; sourceChangeDir: string; spawnFn }): Promise<{ kind:"ok" } | { kind:"skip" } | { kind:"tamper"; detail } | { kind:"unavailable"; reason }>`:
  - branch 無し → skip（pre-branch、design D7）。
  - `readEvidenceAnchor` → absent → skip（pre-feature / ref 不在、design D7）。unavailable → unavailable（fail-closed）。present → `sourceChangeDir` の on-disk events.jsonl＋state.json を `computeJournalDigest` し比較。一致 → ok、不一致 → tamper。
  - `restoreResumeJournal(input)` — tamper 時 `git show origin/<branch>:<change>/state.json` / `events.jsonl` を `sourceChangeDir` へ書き戻す（origin checkpoint journal から復元）。origin journal digest が anchor と一致することを確認してから復元（不一致なら復元せず fail-closed）。
- [x] `src/core/command/resume.ts` の `prepare` で、state resolve 後・running 遷移 persist（`:203-216`）前に検証を挿入する。source dir は `JobStateStore.listWithSourceDirs` の `sourceChangeDir`（resolve と同じ選択規則）から取る。`tamper` → `restoreResumeJournal` → `PrepareError(1, ...)`（診断: 復元済み・online で再 resume）。`unavailable` → `PrepareError(1, ...)`（fail-closed、offline 案内）。`ok`/`skip` → 継続。worktree guard（`:85-94`）の後に置く。
- [x] resume authenticity の unit テストを追加する（fake spawn/anchor）: 意図的 checkpoint（on-disk==anchor）で ok、crash tamper（on-disk!=anchor）で tamper→restore→PrepareError、offline で unavailable→PrepareError、pre-branch/ref-absent で skip。

**Acceptance Criteria**（T4 / T6 の resume 面）:
- 意図的 `awaiting-resume` からの resume で on-disk==origin anchor → 継続（halt しない）。
- crash tamper で on-disk!=anchor → 復元 → prepare fail（fail-closed）。
- anchor read unavailable（offline）→ prepare fail（fail-closed）。
- branch 無し / ref 不在 → skip。`bun run typecheck` が green。

## T-08: attach authenticity（`verifyCheckpoint` に述語追加）

- [x] `src/core/attach/verify-checkpoint.ts` の `verifyCheckpoint` 入力に `anchorDigest?: string`（durable origin anchor、absent=未確立）を追加し、self-consistency 述語群の後に authenticity 述語を足す: `anchorDigest` present のとき `computeJournalDigest(eventsJsonl, stateJson)` と一致しなければ `checkpointNotAttachableError("journal-authenticity", ...)`。absent なら skip（design D7）。既存述語（fold/counter/profile/identity）は無変更。
- [x] `src/core/attach/orchestrator.ts` の `runAttachVerification` で、既存 fetch 後に `readEvidenceAnchor(spawnFn, cwd, branch)` を呼び、present→digest を `verifyCheckpoint` へ渡す、absent→undefined を渡す、unavailable→fail-closed（`checkpointNotAttachableError` か既存 attach error）で reject。
- [x] attach authenticity の unit テストを追加する: tree journal digest が anchor と一致→attach 継続、不一致→reject、anchor absent→従来どおり（self-consistency のみ）、unavailable→reject。

**Acceptance Criteria**:
- checkpoint tree journal digest が anchor と一致で attach 継続、不一致で reject。
- anchor absent で self-consistency のみ（後方互換）、unavailable で fail-closed reject。
- 既存 `verify-checkpoint` self-consistency テストが無変更 green。
- `bun run typecheck` が green。

## T-09: 反例（T1〜T5）・no-false-positive（T6）・authorship（T7）・回帰（T8）テスト

- [x] **T1（Edit/Write 反例）**: agent が node 実行中に `events.jsonl` または `state.json` を Edit/Write 改竄したケースを再現し、per-node 検証が検出→trusted bytes 復元→halt を固定する。**破壊確認**: 復元＋halt を外すと tampered journal が commit/次工程へ通ることをコメントで明示（実装は通さない）。
- [x] **T2（Bash 反例）**: agent が Bash で journal を改竄したケースで検出→復元→halt を固定する。
- [x] **T3（git plumbing 反例）**: agent が `git add`/plumbing で tampered journal を node commit の tree に入れたケースで committed-tree 検証が捕えて halt することを固定する（worktree が clean でも捕える）。**破壊確認**: committed-tree 歯を外すと plumbing 注入が通ることをコメントで明示。
- [x] **T4（crash→resume 反例）**: 先行 durable checkpoint がある job で、resume 中に journal 改竄→post-node 検証前に crash→再 resume したケースで、resume load 検証が origin anchor と照合して検出→復元→halt を固定する（検査前 crash が洗浄経路にならない）。
- [x] **T5（協調改竄反例）**: `events.jsonl` と `state.json` を整合改竄したケースで、結合 digest が anchor と不一致になり検出→halt を固定する。
- [x] **T6（false-positive 無し）**: pipeline の正当な persist/checkpoint による journal 更新が、(a) 継続実行の per-node 検証、(b) 意図的 `awaiting-resume` 停止からの resume、(c) attach の各正常系で halt しないことを固定する。crash-recovery resume（design D8 accepted）は本ケースに含めない。
- [x] **T7（authorship 分離）**: sequential per-node commit が `pipelineManagedPaths` を除外し agent code commit に journal 変更が含まれないこと、pipeline journal commit が別途 journal を載せることを固定する。
- [x] **T8（backward-compat）**: 既存 pipeline / `commit-push` / resume / attach / `verify-checkpoint` / archive の挙動保存テストが無変更 green（authorship 除外・anchor 検証の追加期待を除く）であることを確認する。`bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- T1〜T5 が検出→（復元）→halt を固定し、T3/T1 の破壊確認がコメントで明示される。
- T6 の (a)(b)(c) 正常系が halt しない。
- T7 が authorship 分離を固定する。
- T8 の既存テスト群が（authenticity 追加を除き）無変更 green。
- `bun run typecheck && bun run test` が green。
