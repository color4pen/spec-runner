# Design: 主役 E2E の Machine B を実 `job resume` 経路で通す

## Context

主役 E2E `tests/attach/attach-resume-e2e.test.ts`（TC-E2E-001 / TC-E2E-002）は、
guard-halt → checkpoint publish → attach → resume の 1 本の統合テストである。

- **Machine A 側**は実 `Pipeline.run()` を timeout guard-halt→checkpoint publish まで通し、本物になっている。
- **Machine B 側**は実 `job resume` を通していない。テスト自身が `transitionJob(verified.state, "running")` を直呼びし、
  テスト定義の `IMPLEMENTER_ONLY_DESCRIPTOR` で `buildPipeline` + `Pipeline.run()` を直接叩いている。

そのため、受け入れ基準「別 clone の `job attach` → 実 `job resume` が開始する」は、看板が実体より半歩大きい。
次が resume 経路として未証明のまま残っている:

- sidecar / worktree 経由の attached state 解決（`resolveJobStateBySlug` / liveness sidecar / `resolveStateStoreByJobId`）
- `ResumeCommand.prepare()` の request・resumePoint 解決と running 遷移の永続化
- existing worktree の再利用
- `buildPipelineForJob()` による実 descriptor 選択

### 実 resume 経路（調査で確認済みの前提）

production の呼び出し形は 2 つの CLI が定めている:

- **attach materialize**: `cli/attach.ts:137` — `LocalRuntime.setupWorkspace(slug, jobId, { attachCheckpoint: { branch, checkpointRef }, baseBranch })`。
  materializer の `attach-from-checkpoint` arm（`runtime/workspace-materializer.ts:122-151`）が checkpoint OID から worktree を作り、
  liveness sidecar（pid=null）を書き、workspace を登録する。slug state は seed しない（branch-borne truth 保存）。
- **resume**: `cli/resume.ts:67` — `new ResumeCommand(runtime, events, slug, options).execute()`。
  `CommandRunner.execute()`（`command/runner.ts`）が prepare → setupWorkspace → buildDeps → registerCleanup →
  **`buildPipelineForJob`（runner.ts:215）** → `pipeline.run(startStep, jobState, deps)` を順に駆動する。
  `buildPipelineForJob` は prepare() でなく execute() 内なので、prepare() 単体駆動では descriptor 選択を証明できない。

`ResumeCommand.prepare()`（`command/resume.ts`）の要点:
1. `resolveJobStateBySlug(slug, cwd)` → `JobStateStore.list(repoRoot, {includeArchived:true})` が
   current checkout + `.git/specrunner-worktrees/` + sidecar supplement を走査し、attach 生成 worktree 内の
   `state.json`（awaiting-resume）を発見する（`store/job-catalog.ts`）。
2. status gate（awaiting-resume → running へ遷移可能を確認）→ `resolveResumeStep`（`--from` > `resumePoint.step` > `state.step`）。
3. `resolveRequestPath` + `parseRequestMd`。slug mode では `state.request.path` は load 時に
   `<worktreePath>/specrunner/changes/<slug>/request.md`（絶対）へ projection される（`store/job-state-projection.ts:67`）ため、
   worktree の request.md が読める。
4. `transitionJob(running)` を `resolveStateStoreByJobId(cwd, jobId)`（`job-access/resolve-state-store.ts`、
   sidecar の worktreePath から writable store を解決）で **worktree の state.json へ永続化**。
5. worktreePath 解決（`state.worktreePath` ?? liveness sidecar）→ `workspaceOpts.existingWorktreePath`。

`LocalRuntime.setupWorkspace()` は `existingWorktreePath` が disk に在るとき
`resume-existing` plan を選び、`manager.create()` を呼ばず既存 worktree を再利用する（`runtime/local.ts:441-451`）。

### 予算がある不変（interop 対称性）

- **attach 予測子 ↔ resume 入力 gate の対称性**: #838 の attach 検証は「解決した resume step の `reads()` が返す必須入力が
  checkpoint tree に存在する」ことを検証する。実装で implementer.reads() = `tasks.md` / `spec.md`（`step/implementer.ts:117-131`）。
  よって attach 検証を通った checkpoint から作った worktree では、resume の `validateStepInputs` が必ず通り、
  fake agent runner に到達する。

## Goals / Non-Goals

**Goals**:

- 主役 E2E の Machine B を、実 `ResumeCommand`（`prepare()` + `buildPipelineForJob()` 非 mock）+ 実 `Pipeline.run()` で駆動する。
- resume が解決する attached state / worktree / sidecar を、実 materialize 経路
  （`LocalRuntime.setupWorkspace({attachCheckpoint})`）が生成した実物にする。
- 6 つの歯（下記 D6）を observable なアサーションで固定する。
- Machine A（#838）を無変更で green のまま保つ。
- 受け入れ基準 / spec の文言を実体に一致させる（看板を実体より大きくしない）。

**Non-Goals**:

- Machine B の STANDARD pipeline を**完走**させること。resume が `resumePoint.step` で開始し、
  実 descriptor 上で fake runner が呼ばれた時点で目的達成。以降は timeout guard-halt で束ねる（awaiting-resume 終端で可）。
- managed runtime の resume（local runtime のみ）。
- attach 後の自動 resume（attach と resume は別コマンドのまま）。
- 新規 production 機能の追加。実 interop gap が判明した場合は proxy で塞がず停止する（D9）。

## Decisions

### D1: Machine B を実 `ResumeCommand.execute()` × 実 `LocalRuntime` で駆動する

Machine B は `new ResumeCommand(localRuntime, events, SLUG, { cwd: machineBDir }).execute()` を呼ぶ。
prepare() → setupWorkspace → buildDeps → `buildPipelineForJob` → `pipeline.run(startStep)` の一連が
production と同一のコード経路で走る。

- **Rationale**: production の resume は `cli/resume.ts:67` がこの形で駆動する。テストが同じ入口を使えば、
  「既存 `job resume` 経路が開始できる」を実体で証明できる。
- **Alternatives considered（却下）**: テスト自前の `transitionJob(running)` + `IMPLEMENTER_ONLY_DESCRIPTOR` +
  `buildPipeline` 直呼び（現 Machine B）。主役の seam（prepare / buildPipelineForJob）を潰す proxy であり、
  「看板 > 実体」の根。

### D2: attach 成果物は実 materialize 経路が生成する

Machine B の worktree + liveness sidecar は、`LocalRuntime.setupWorkspace(SLUG, jobId, { attachCheckpoint: { branch: BRANCH, checkpointRef: verified.checkpointOid }, baseBranch })`
が生成する。手組みの `MaterializerHost`（`makeRealMaterializerHost`）と `WorkspaceMaterializer.materialize` 直呼びは撤去する。

- **Rationale**: production の attach は `cli/attach.ts:137` がこの形で materialize する。resume の resolver
  （`resolveJobStateBySlug` / sidecar / `resolveStateStoreByJobId`）が発見・解決する対象を実物にすることで、
  resolver を迂回しない。`runAttachVerification`（fetch → OID → read → verify）は現行のまま実物を使う。
- **Alternatives considered（却下）**: テストが手で組んだ state / worktree / sidecar。resolver を迂回して穴を隠す。

### D3: 唯一 fake にする seam は agent runner のみ

fake `AgentRunner` を注入するため、`LocalRuntime` を薄く継承し `createAgentRunner()` だけを override する
（他メソッドは実 LocalRuntime のまま）。`buildDeps()` は `this.createAgentRunner()` を呼ぶ（`runtime/local.ts:542`）ため、
override により `deps.runner` が fake になる。

- **Rationale**: 本 request が非 mock を要求するのは prepare() / `buildPipelineForJob()` / `Pipeline.run()`。
  agent runner は要件自体が「fake runner」を求めている。`createAgentRunner` の override は agent 実行のみを fake 化し、
  resume 経路の主役 seam を実物に保つ最小の注入点。fake runner は `ctx.step.name` / `ctx.cwd` / `ctx.state.jobId` を観測でき、
  `completionReason` を直接制御できる。
- **Alternatives considered（却下）**: `LocalRuntimeOptions.queryFn` に fake を渡す方法。SDK メッセージ列で
  `completionReason: "timeout"` を作るのは間接的で脆い。

### D4: fake runner は `timeout` を返し implementer で guard-halt する

fake runner は `completionReason: "timeout"` を返す。STANDARD descriptor 上で implementer が timeout →
guard-halt → `awaiting-resume`（resumePoint=implementer）で終端する。Machine A と同じ挙動。

- **Rationale**: STANDARD descriptor は implementer 成功時 verification 以降へ進み、実 build/test コマンドを走らせてしまう。
  timeout guard-halt で run を implementer の 1 回に束ね、scope 内（awaiting-resume 終端）に収める。
- **Alternatives considered（却下）**: `success` を返して完走を狙う。scope 外であり、verification が実コマンドを起動して破綻する。

### D5: descriptor 選択は `getPipelineId(jobState)` 経由（実体の明示）

`buildPipelineForJob` は `getPipelineDescriptor(getPipelineId(jobState))` で base descriptor を選ぶ
（`pipeline/run.ts:88-97`）。`getPipelineId` は `jobState.pipelineId ?? "standard"`（`state/pipeline-id.ts`）。
checkpoint state に pipelineId は無いため **STANDARD_DESCRIPTOR** が選ばれる。request.type は base descriptor の
選択には使われない（reviewer 起動条件・model 解決には効く）。

したがって観測アサートは「実体」に一致させる:
- descriptor は `buildPipelineForJob` が返す **STANDARD**（テスト定義の `IMPLEMENTER_ONLY_DESCRIPTOR` ではない）。
- 実体の署名 = STANDARD 上の implementer は timeout で guard-halt し `awaiting-resume`（resumePoint=implementer）へ落ちる。
  除去した `IMPLEMENTER_ONLY_DESCRIPTOR` は implementer 成功で `end`→`awaiting-archive` に至る別署名だったため、
  この終端の差が「STANDARD が buildPipelineForJob により実選択された」ことの behavioral な証拠になる。

- **Rationale**: 「request.type から選ぶ」という request の表現を額面通り書くと、実機構（pipelineId 経由）と食い違い、
  再び看板が実体を上回る。spec / assertion は pipelineId 経由の実体で書く。
- **Alternatives considered（却下）**: `buildPipelineForJob` を `vi.mock` して descriptor を差し替える
  （既存 `resume.test.ts:183` のパターン流用）。主役の seam を潰すため禁止。

### D6: 歯 → observable の対応表

| 歯 | observable |
|----|-----------|
| sidecar/worktree 経由の attached state 解決 | どこにも state を seed しない。fake runner が `ctx.state.jobId === attach jobId` / `ctx.slug === SLUG` を観測。加えて attach 直後に worktree の `state.json` を disk 読みし `status === "awaiting-resume"` を確認（resolver が解決した対象がこの実物であること） |
| resumePoint→startStep 解決 | fake runner が `ctx.step.name === STEP_NAMES.IMPLEMENTER === verified.state.resumePoint.step` を観測 |
| running 遷移の永続化 | resume 前: attach worktree の `state.json` を disk 読み → `awaiting-resume`。resume 開始時点: fake runner 内で同じ `state.json` を disk 読み → `running`（prepare が step 実行前に worktree store へ永続化した証拠） |
| existing worktree の再利用 | resume runtime に注入した `manager.create` の spy が **0 回**。かつ fake runner の `ctx.cwd === attachWorkspace.worktreePath`（path 一致） |
| `buildPipelineForJob` の実 descriptor 選択 | pipeline module を mock しない・テストで descriptor を組まない。最終 state = `awaiting-resume` かつ `resumePoint.step === implementer`（D5 の STANDARD 署名） |
| resume の開始 | fake runner の呼び出し回数 = 1、呼ばれた step = implementer |

### D7: 実 resume が要求する前提の充足（config / XDG）

`ResumeCommand.prepare()` は `loadConfig(repoRoot)` を呼ぶ（`command/resume.ts:227`）。`loadConfig` は
user global も project local も無いとき `CONFIG_MISSING` を throw する（`config/store.ts:126`）。fresh clone の
`machineBDir` には config が無いため、テストは resume 前に:

- `machineBDir/.specrunner/config.json` に最小の standalone config（例: `{ "version": 1, "runtime": "local", "agents": {} }`）を書く。
- `XDG_CONFIG_HOME` を空の一時ディレクトリへ隔離し、host の user global config 混入を排除して決定的にする。

これは resume コマンドが正当に読む設定を用意する setup であり、resolver の迂回ではない（project local config は
production でも repo に commit される team 共有物）。config.runtime は既に注入済みの `LocalRuntime` を上書きしないため、
pipeline の実 runtime 選択には影響しない。

### D8: Machine A（#838）は無変更

Machine A 側（`makeMachineAStrategy` + `buildPipeline(STANDARD_DESCRIPTOR)` + `pipeline.run` の guard-halt→checkpoint publish、
アサート a〜d）は一切変更しない。Machine A が publish した checkpoint を Machine B が消費する構造を保つ。

### D9: 実 interop gap は塞ぐか停止（proxy 禁止）

実 attach→resume interop に本物の統合 gap（resolver が worktree/sidecar を発見できない、running 遷移が
worktree へ永続化されない、等）が判明した場合、proxy で回避せず停止し判断を仰ぐ（要件④ = 本 goal の停止条件）。
proxy で穴を隠して看板だけ大きくすることは禁止。

## Risks / Trade-offs

- **[Risk] guard-halt 時の `commitFinalState` が file:// origin へ push する** →
  `commitFinalState`（`step/commit-push.ts:105-146`）は push 失敗を warn するのみで throw しない（best-effort）。
  Machine B の branch は checkpoint OID にあり fast-forward。失敗しても awaiting-resume 終端と歯の観測に影響しない。
- **[Risk] 実 LocalRuntime の副作用（pipeline log / power assertion / exit guard）** →
  power assertion は既定 `noopSpawnBackground`（`runtime/local.ts:144`）で実プロセスを起こさない。exit guard / pipeline log は
  既存 `resume.test.ts` が execute() を駆動して実証済み。tmpDir 配下に閉じる。
- **[Risk] host の user global config 混入で `CONFIG_INVALID`** → D7 の XDG 隔離で排除。
- **[Trade-off] 実 LocalRuntime を使うぶんテストが重い（実 git 操作）** → 既に 60s timeout の E2E。Machine B の追加副作用は
  worktree 再利用（create 無し）+ best-effort push のみで許容範囲。

## Open Questions

- なし。実装で D9 の停止条件に該当する gap が出た場合のみ、その時点で報告する。
