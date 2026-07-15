# 主役 E2E の Machine B を実 `job resume` 経路（ResumeCommand + buildPipelineForJob）で通す

## Meta

- **type**: spec-change
- **slug**: star-e2e-real-resume-path
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260715（remote checkpoint / machine-local reattachment boundary）で ratify 済み。本 request は #838 が主役 E2E の Machine B 側で残した「看板が実体より半歩大きい」食い違いを、実 resume 経路を通すことで閉じる follow-up。新規 architecture ADR を要さない。 -->

## 背景

#838 で主役 E2E（`tests/attach/attach-resume-e2e.test.ts`）の **Machine A 側**は実 `Pipeline.run()` を timeout guard-halt→checkpoint publish まで通し、本物になった。しかし **Machine B 側**は実 `job resume` を通していない：

- `ResumeCommand` を呼ばず、テスト自身が `transitionJob(verified.state, "running")` して、独自の `IMPLEMENTER_ONLY_DESCRIPTOR` で `Pipeline.run()` を直接呼んでいる。

そのため受け入れ基準(c)「別 clone の `job attach` → **実 `job resume` が開始する**」は看板が実体より大きい。次が未証明のまま：

- **sidecar 経由の attached state / worktree 解決**（`resolveJobStateBySlug` / liveness sidecar / `resolveStateStoreByJobId`）
- **`ResumeCommand.prepare()` の request・resumePoint 解決**
- **running 遷移の永続化**
- **existing worktree の再利用**
- **`buildPipelineForJob()` による実 descriptor 選択**

証明できているのは「attached checkpoint から resume step の pipeline を開始できる」までで、「既存の `job resume` 経路が開始できる」までは未証明。本 request はこの半歩を埋め、看板と実体を一致させる。

## 現状コードの前提

実 resume 経路とその成立条件は調査で確認済み。実装はこの前提に沿うこと（憶測で再設計しない）。

- **駆動**: `ResumeCommand(runtime, events, slug, options)` の `execute()` → `CommandRunner.execute()`（`src/core/command/runner.ts`）が prepare→setupWorkspace→buildDeps→**`buildPipelineForJob`（runner.ts:215、execute 内）**→`pipeline.run(startStep)` を順に駆動する。`buildPipelineForJob` は prepare() でなく execute() 内なので、prepare() 単体駆動では descriptor 選択を証明できない。
- **prepare()**（`src/core/command/resume.ts`）: `resolveJobStateBySlug(slug, cwd)`（`JobStateStore.list` で列挙）→ status gate → `resolveResumeStep`（`--from` > `resumePoint.step` > `state.step`）→ `resolveRequestPath`+`parseRequestMd` → `transitionJob(running)`＋`resolveStateStoreByJobId(cwd, jobId)` で永続化 → `loadConfig(repoRoot)` → worktreePath 解決（`state.worktreePath` ?? liveness sidecar `.specrunner/local/<slug>/liveness.json`）。
- **attach 成果物**: 実 attach（`runtime.setupWorkspace({ attachCheckpoint })` = materializer の attach-from-checkpoint、`src/core/runtime/workspace-materializer.ts:125-147`）は「checkpoint OID からの worktree」＋「liveness sidecar（pid=null, jobId, worktreePath）」＋「workspace 登録」を生成し、slug state は seed しない（branch-borne truth 保存）。
- **interop の軸は liveness.json**: `resolveJobIdToSlug`/`listLocalSidecars`（`src/store/local-job-index.ts`）は `.specrunner/local/<slug>/liveness.json` から index を導出する。attach が書くその sidecar を軸に、resume の `resolveStateStoreByJobId`（writable store 解決）と worktreePath 解決が成立する。`JobStateStore.list(repoRoot, {includeArchived:true})` は current checkout + **local worktrees** + sidecar + managed を走査し、attach 生成 worktree 内の state.json を発見する。
- **既存 resume テストは流用不可**: `tests/unit/core/command/resume.test.ts` は `buildPipelineForJob` を `vi.mock` している。これは本 request が証明したい主役の seam を潰すため、そのパターンを流用してはならない。

## 要件

1. **[主役 E2E 昇格] Machine B を実 `ResumeCommand` 駆動に差し替える**: `tests/attach/attach-resume-e2e.test.ts` の Machine B 側で、実 `ResumeCommand`（または同等に prepare()＋`buildPipelineForJob`＋`Pipeline.run` を一体で駆動する実コード経路）を通す。`ResumeCommand.prepare()` と `buildPipelineForJob()` は **mock せず実行**し、実 `Pipeline.run()` が resumePoint.step から開始することを固定する。テスト自前の `transitionJob(running)` や独自 descriptor（IMPLEMENTER_ONLY 等）の直呼びで代替しない。

2. **[attach 成果物の実物] resume が解決する対象は実 attach 由来にする**: Machine B の resume が解決する attached state / worktree / sidecar は、実 materialize 経路（`setupWorkspace({attachCheckpoint})` 相当）が生成したものであること。手で組んだ state / worktree で resolver を迂回しない。resume の resolver（`resolveJobStateBySlug` / liveness sidecar / `resolveStateStoreByJobId`）が実際に発見・解決することを観測可能に固定する。

3. **[歯の名指し] 次を observable なアサーションで固定する**:
   - **sidecar/worktree 経由の attached state 解決**: resume が正しい jobId・slug・（解決時点の）status を解決する。
   - **resumePoint→startStep 解決**: 解決された開始 step が `resumePoint.step` と一致する。
   - **running 遷移の永続化**: resume 前は disk の state.json が `awaiting-resume`、resume 後（開始時点）に `running` へ更新されている。
   - **existing worktree の再利用**: attach が作った worktree path をそのまま使い、新規 worktree を作らない（worktree create 呼び出し 0 回 / path 一致）。
   - **`buildPipelineForJob()` の実 descriptor 選択**: descriptor が `request.type` から実選択される（mock でない）。resume step がその descriptor 上で実行される。
   - **resume の開始**: fake agent runner が `resumePoint.step` で呼ばれる（実際に開始した観測証拠）。

4. **[Machine A 保存] Machine A 側は #838 の挙動を変えない**: 実 pipeline guard-halt→checkpoint publish のアサーション（status=awaiting-resume, resumePoint=implementer, runner 1 回, checkpoint commit / tree）は無変更で green。

5. **[spec 整合] 受け入れ基準(c)の文言を実体に一致させる**: change folder の spec / 受け入れ基準で「実 `job resume` が開始する」を、実 `ResumeCommand`（prepare + `buildPipelineForJob` 非 mock）経由で開始する、と実装した実体に一致する表現へ更新する。看板を実体より大きくしない。

## スコープ外

- Machine B の STANDARD pipeline を**完走**させること。resume が resumePoint.step で開始し、実 descriptor 上で fake agent runner が呼ばれた時点で目的達成。以降は timeout guard-halt 等で束ねてよい（awaiting-resume 終端で可）。
- managed runtime の resume（local runtime のみ）。
- attach 後の自動 resume（attach と resume は別コマンドのまま）。
- 新規 production 機能の追加。ただし実 attach→resume interop に**本物の統合 gap**（resolver が発見できない／running 遷移が永続化されない 等）が判明した場合は、proxy で回避せず要件④（本 goal の停止条件）で停止し判断を仰ぐ。

## 受け入れ基準

- [ ] **【主役 E2E】** 1 本の統合テストで: 実 attach（materialize）で Machine B に worktree＋liveness sidecar を生成 → 実 `ResumeCommand`（`prepare()`＋`buildPipelineForJob()` 非 mock）→ 実 `Pipeline.run()` が `resumePoint.step` から開始 → fake agent runner がその step で呼ばれる、を固定する（proxy 直呼びでない）。
- [ ] resume が sidecar/worktree 経由で attached state を解決（jobId / slug / status を観測アサート）。
- [ ] 解決された開始 step === `resumePoint.step`。
- [ ] disk の state.json が `awaiting-resume` → `running` に遷移し永続化される。
- [ ] 新規 worktree を作らず、attach 生成の worktree を再利用（worktree create 0 回 / path 一致）。
- [ ] descriptor は `buildPipelineForJob` が `request.type` から選ぶ（mock でない）。
- [ ] `buildPipelineForJob` を mock する既存 resume テストの流用でないこと。
- [ ] Machine A 側アサーションは #838 と同一で green。
- [ ] 既存 attach / publisher / worktree / guard-halt テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **主役の歯は実 `ResumeCommand` を通す**。→ 却下: `transitionJob(running)`＋IMPLEMENTER_ONLY_DESCRIPTOR 直呼びの proxy（#838 の Machine B）。
- **attach 成果物は実 materialize 由来**。→ 却下: テストが手で組んだ state / worktree で resolver を迂回。
- **descriptor は `buildPipelineForJob` の実選択**。→ 却下: `buildPipelineForJob` を `vi.mock` する既存 resume テストのパターン流用。
- **実 interop gap は塞ぐか停止**。→ 却下: proxy で穴を隠して看板だけ大きくする。
