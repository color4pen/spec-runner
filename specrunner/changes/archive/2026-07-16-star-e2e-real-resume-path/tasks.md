# Tasks: 主役 E2E の Machine B を実 `job resume` 経路で通す

対象ファイルは `tests/attach/attach-resume-e2e.test.ts` の **Machine B 側（現行 L382-485）** のみ。
Machine A 側（現行 L244-381）と `IMPLEMENTER_ONLY_DESCRIPTOR` を除く共有ヘルパは、Machine A が使う分は保持する。
production コード（`src/`）は変更しない。ただし実 interop gap が判明したら T-06 の停止条件で停止する。

## T-01: attach 成果物を実 materialize 経路（`LocalRuntime.setupWorkspace({attachCheckpoint})`）で生成する

- [x] Machine B の worktree + liveness sidecar 生成を、手組みの `WorkspaceMaterializer` + `makeRealMaterializerHost`
      直呼び（現行 L404-411, L199-224）から、実 `LocalRuntime.setupWorkspace(SLUG, jobId, { attachCheckpoint: { branch: BRANCH, checkpointRef: verified.checkpointOid }, baseBranch })` に置き換える（production 形は `cli/attach.ts:137`）。
- [x] attach 用の `LocalRuntime` は `machineBDir` を cwd とし、stub GitHubClient（既存 `makeStubGithubClient`）・
      `owner`/`repo`（`EXPECTED_REPO`）・`spawnFn: spawnCommand` を渡す。
- [x] `runAttachVerification`（fetch → OID → read → verify、現行 L392-402）は実物のまま維持する。
- [x] materialize 後、worktree の `state.json` を disk 読みし `status === "awaiting-resume"` / `jobId === attach jobId` を確認する
      アサートは維持する（resolver が解決する対象が実物であることの前提固定）。
- [x] 不要になった import（`WorkspaceMaterializer` / `MaterializerHost` / `makeRealMaterializerHost` の Machine B 用途）を整理する。

**Acceptance Criteria**:
- Machine B の worktree と `.specrunner/local/<slug>/liveness.json`（pid=null）が `LocalRuntime.setupWorkspace({attachCheckpoint})` により生成される。
- attach 生成 worktree の `state.json` が `awaiting-resume` かつ `jobId === attach jobId` であることを disk 読みで確認できる。
- 手組みの `MaterializerHost` / `WorkspaceMaterializer.materialize` 直呼びが Machine B から消えている。

## T-02: Machine B の proxy を撤去する

- [x] テスト自前の `transitionJob(verified.state, "running", ...)` 直呼び（現行 L426-429）を削除する。running 遷移は
      `ResumeCommand.prepare()` に委ねる。
- [x] テスト定義の `IMPLEMENTER_ONLY_DESCRIPTOR`（現行 L178-193）と、それを使う `buildPipeline` + `pipeline.run` 直呼び
      （現行 L468-474）を削除する。
- [x] running state の hand-seed（`machineBStoreFactory(jobId).persist(runningState)`、現行 L450-452）を削除する。
      resume は attach 成果物（worktree state + sidecar）からのみ state を発見しなければならない。
- [x] pipeline module（`core/pipeline/index.js` / `buildPipelineForJob`）を `vi.mock` しない（既存 `resume.test.ts:183` の
      パターンを流用しない）。

**Acceptance Criteria**:
- Machine B から `transitionJob(running)` の直呼び・`IMPLEMENTER_ONLY_DESCRIPTOR`・state の hand-seed・pipeline module の mock が消えている。
- Machine B が resume を開始する唯一の入口が `ResumeCommand.execute()` である。

## T-03: 実 `ResumeCommand` を実 `LocalRuntime` で駆動し、fake runner のみ注入する

- [x] fake `AgentRunner`（`completionReason: "timeout"` を返し、呼び出し回数・`ctx.step.name`・`ctx.cwd`・
      `ctx.state.jobId` を記録する）を用意する。
- [x] `LocalRuntime` を薄く継承し `createAgentRunner()` だけを override して fake runner を返す resume 用 runtime を作る
      （他メソッドは実 LocalRuntime のまま）。cwd=`machineBDir`、stub GitHubClient、`owner`/`repo`、`spawnFn: spawnCommand`、
      および `create` を spy できる `manager`（`createWorktreeManager(...)` を注入）を渡す。
- [x] resume 前提を用意する: `machineBDir/.specrunner/config.json` に最小 standalone config
      （例 `{ "version": 1, "runtime": "local", "agents": {} }`）を書き、`XDG_CONFIG_HOME` を空の一時ディレクトリへ隔離して
      `loadConfig` を決定的にする（`ResumeCommand.prepare()` は `loadConfig(repoRoot)` を呼び、config 不在時 `CONFIG_MISSING` で失敗するため）。
- [x] `new ResumeCommand(resumeRuntime, events, SLUG, { cwd: machineBDir }).execute()` を await する。
- [x] テスト終了時に worktree を掃除する（既存の best-effort `git worktree remove --force` を維持）。XDG 等の env は afterEach で復元する。

**Acceptance Criteria**:
- Machine B が `new ResumeCommand(...).execute()` を通り、`prepare()` と `buildPipelineForJob()` が mock されずに実行される。
- fake runner は agent runner のみを fake 化し、resume 経路の他 seam（resolver / setupWorkspace / buildDeps / pipeline）は実 LocalRuntime のまま。
- `loadConfig` が `CONFIG_MISSING` を投げずに resume が prepare を完了する。

## T-04: 6 つの歯を observable なアサーションで固定する

- [x] **attached state 解決**: fake runner が `ctx.state.jobId === attach jobId` と `ctx.slug === SLUG` を観測。加えて
      attach 直後の worktree `state.json` disk 読みが `awaiting-resume` であることを確認（state は hand-seed しない）。
- [x] **startStep 解決**: fake runner の `ctx.step.name === STEP_NAMES.IMPLEMENTER === verified.state.resumePoint.step`。
- [x] **running 永続化**: resume 前に worktree `state.json` が `awaiting-resume`。fake runner 内で同じ `state.json` を
      disk 読みして `running`（開始時点で永続化済み）を確認。
- [x] **worktree 再利用**: resume runtime の `manager.create` の spy 呼び出し 0 回。かつ fake runner の
      `ctx.cwd === attachWorkspace.worktreePath`（path 一致）。
- [x] **descriptor 実選択**: pipeline を mock せず descriptor を組まないうえで、`execute()` 後の最終 state が
      `awaiting-resume` かつ `resumePoint.step === implementer`（STANDARD が `buildPipelineForJob` により実選択された
      behavioral 署名）。
- [x] **resume 開始**: fake runner の呼び出し回数 === 1、呼ばれた step === implementer。
- [x]（任意）`execute()` の exit code が 1（awaiting-resume で halted）であることを確認する。

**Acceptance Criteria**:
- 上記 6 項目すべてが観測アサーションとして存在し、proxy 直呼びの証拠でない。
- 開始 step の値は `verified.state.resumePoint.step` から導出し、literal 固定に依存しない。

## T-05: Machine A の不変を保ち、受け入れ基準 / spec 文言を実体に一致させる

- [x] Machine A 側（TC-E2E-001 相当のアサート a〜d、`makeMachineAStrategy`）を一切変更しない。
- [x] 本 change folder の spec.md / 受け入れ基準で「実 `job resume` が開始する」を「実 `ResumeCommand`
      （`prepare()` + `buildPipelineForJob()` 非 mock）経由で開始する」と実体一致の表現にする（本 change の spec.md で反映済み）。
- [x] 「descriptor は request.type から選ぶ」の表現を、実機構（`getPipelineId(jobState)` → 既定 `standard` → STANDARD）に
      一致させ、証明していない範囲（STANDARD 完走 / managed resume / 自動 resume）を主張しない。

**Acceptance Criteria**:
- Machine A のアサーションは #838 と同一で green。
- spec / 受け入れ基準の文言が実体（実 `ResumeCommand` × `buildPipelineForJob` 非 mock、STANDARD の guard-halt 終端）を
  超えて主張していない。

## T-06: 検証と実 gap 停止条件

- [x] `bun run typecheck && bun run test` を green にする。
- [x] 既存 attach / publisher / worktree / guard-halt 関連テスト（`tests/attach/*`, `tests/unit/core/command/resume.test.ts` 等）が
      無変更で green であることを確認する。
- [x] 実 attach→resume interop に本物の統合 gap（resolver が worktree/sidecar を発見できない、running 遷移が worktree へ
      永続化されない、既存 worktree を再利用できない 等）が判明した場合、proxy で回避せず**停止して報告し判断を仰ぐ**
      （要件④ = 本 goal の停止条件）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存 attach / publisher / worktree / guard-halt テストが無変更で green。
- 本物の gap 発生時に proxy で塞がず停止している（塞いだ痕跡がない）。
