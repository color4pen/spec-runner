# Tasks: `job attach --branch` — remote branch から quiescent job を attach する

実装順は依存順（低リスクの土台 → CLI 配線 → 統合テスト）。各 task は独立の Acceptance Criteria を持つ。
テストは interface 確定後に書く（scenario は spec.md、code は本 tasks で確定）。

---

## T-01: typed error 分類を追加する

`src/errors.ts` に attach 用の error code と factory を追加する（design D6）。

- [ ] `ERROR_CODES` に `CHECKPOINT_NOT_FOUND` / `CHECKPOINT_NOT_ATTACHABLE` / `ATTACH_FETCH_FAILED` / `ATTACH_RUNTIME_UNSUPPORTED` を追加する。
- [ ] factory を追加する:
  - `checkpointNotFoundError(branch: string, detail: string)`（tree に attach 可能な change folder が 0 or 複数）
  - `checkpointNotAttachableError(reason: string, detail: string)`（検証項目 (a)-(e) 不成立。`reason` を hint に載せる）
  - `attachFetchFailedError(branch: string, detail: string)`
  - `attachRuntimeUnsupportedError(runtime: string)`
- [ ] いずれも `SpecRunnerError`（既定 exit code = GENERAL_ERROR=1）。`hint` は運用者が原因を区別できる文言にする。

**Acceptance Criteria**:
- 4 つの error code が `ERROR_CODES` に存在し、`ErrorCode` union に含まれる。
- 4 つの factory が `SpecRunnerError` を返し、`code` が対応する定数に一致する。
- `bun run typecheck` が green。

---

## T-02: 内容ベースの projection compose を追加する

`src/store/job-state-projection.ts` に `composeSplitLayoutFromContent(stateJson, eventsJsonl, slugInject?)` を追加し、既存 `composeSplitLayout` をファイル読み → 内容関数への委譲に振替える（design D2、挙動不変リファクタ）。

- [ ] `composeSplitLayoutFromContent(stateJson: string, eventsJsonl: string, slugInject?: SlugInjectOptions): Promise<{ state: NormalizedJobState; corruption: FoldCorruption | null }>` を実装する。内部ロジック（`_journal` 抽出、slugInject、`fold`、`validateJobState`、resumePoint 復元、legacy migration、compose）は現行 `composeSplitLayout` と同一。ただし `events.jsonl` は文字列で受け、空文字は「events なし」（空 fold）として扱う。
- [ ] `composeSplitLayout(stateJsonPath, eventsPath, slugInject?)` を「`fs.readFile` で state.json を読み、events.jsonl を読み（ENOENT は空文字）、`composeSplitLayoutFromContent(...)` に委譲」に振替える。state.json が ENOENT のときは従来どおり throw（挙動保存）。
- [ ] `loadSplitLayout` は無変更（`composeSplitLayout` 経由のまま）。

**Acceptance Criteria**:
- 既存の `composeSplitLayout` / `loadSplitLayout` / `JobCatalog` 系テストが**無改変で green**（挙動不変）。
- 新規テスト: 正常な state.json + events.jsonl 文字列 → `state` が復元され `corruption === null`。journal 破損文字列 → `corruption !== null`。events 空文字 → 空 fold で state 復元。
- `bun run typecheck && bun test` が green。

---

## T-03: `origin/<branch>` tree から checkpoint を読むリーダを追加する

`src/git/checkpoint-ref.ts` を新規作成する（design D1）。import は `util/git-exec` / `util/paths` / `errors` に限定（src/git/ 層の制約。`remote.ts` / `source-revision.ts` に倣う）。

- [ ] `resolveCheckpointSlug(spawnFn, cwd, ref): Promise<string>`:
  - `git ls-tree --name-only <ref> specrunner/changes/` の entry から `archive` / `canceled` を除外。
  - 各候補 dir について `git cat-file -e <ref>:specrunner/changes/<name>/state.json` の成功可否で「state.json を持つ change folder」を判定。
  - ちょうど 1 件 → その slug。0 件 / 2 件以上 → `checkpointNotFoundError(branch-derived, detail)`。
- [ ] `readCheckpointFromRef(spawnFn, cwd, ref): Promise<{ slug; stateJson; eventsJsonl; treeFiles }>`:
  - slug を解決し、`git show <ref>:specrunner/changes/<slug>/state.json` を読む（失敗 → `checkpointNotFoundError`）。
  - `git show <ref>:specrunner/changes/<slug>/events.jsonl` を読む（不在 → 空文字）。
  - `git ls-tree -r --name-only <ref> -- specrunner/changes/<slug>/` を読み、`treeFiles: string[]`（repo-relative path）に格納。
- [ ] git object 読みは `gitExec` / `runSubprocess`（`util/git-exec.ts`）経由。`ref` は呼び出し側が `origin/<branch>` を渡す。

**Acceptance Criteria**:
- 注入した spawn stub（canned git 出力）で: 単一 change folder → slug 導出成功、state/events/treeFiles を返す。0 件 / 複数 → `CHECKPOINT_NOT_FOUND`。events 不在 → `eventsJsonl === ""`。
- `checkpoint-ref.ts` は `src/adapter/` / `src/core/` を import しない（層制約）。
- `bun run typecheck && bun test` が green。

---

## T-04: checkpoint 検証述語を追加する

`src/core/attach/verify-checkpoint.ts` を新規作成する（design D3）。materialize 系 I/O を行わない純粋な判定関数。

- [ ] `verifyCheckpoint(input): Promise<VerifiedCheckpoint>` を実装する。入力 = `{ slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo: { owner, name } }`。
- [ ] 検証順（いずれか不成立で `checkpointNotAttachableError(reason, detail)` を throw）:
  - (b) `composeSplitLayoutFromContent(stateJson, eventsJsonl)` → state.json 不正 / `corruption !== null` → throw。以降 `state` を使う。
  - (a) `state.status === "awaiting-resume"` でなければ throw（`running` を含む非 quiescent を拒否）。
  - (c) `getPipelineDescriptor(getPipelineId(state))` が throw しない、かつ `resolveResumeStep(undefined, state.resumePoint ?? null, state.step, buildAllowedStepSet(state.reviewers), state.reviewers)` が throw しないこと。
  - (d) `treeFiles` が `specrunner/changes/<slug>/request.md`（`requestMdPath(slug)`）を含むこと。
  - (e) `state.repository.owner === expectedRepo.owner && state.repository.name === expectedRepo.name`、`state.jobId` が非空文字列、`state.branch === branch`、`getJobSlug(state) === slug`。
- [ ] 成功時 `{ state, slug, jobId: state.jobId, branch }` を返す。
- [ ] この関数は fetch / worktree / sidecar / persist を一切行わない。

**Acceptance Criteria**:
- 受け入れ基準を固定する単体テスト:
  - status が `awaiting-resume` 以外（`running` を含む）→ `CHECKPOINT_NOT_ATTACHABLE`。
  - `request.md` が `treeFiles` に無い → `CHECKPOINT_NOT_ATTACHABLE`。
  - repository / jobId / branch / slug identity 不一致 → `CHECKPOINT_NOT_ATTACHABLE`。
  - journal 破損 → `CHECKPOINT_NOT_ATTACHABLE`。
  - すべて満たす valid checkpoint → `VerifiedCheckpoint` を返す。
- テストは `verifyCheckpoint` の呼び出し前後で filesystem に一切書き込みがないことを担保する（純関数、I/O なし）。
- `bun run typecheck && bun test` が green。

---

## T-05: feature branch HEAD 起点の materialization plan variant と arm を追加する

`src/core/runtime/workspace-materializer.ts` に新 variant と arm を追加し、`writeLivenessSidecar` を pid 指定可能にする（design D4/D5）。

- [ ] `WorktreeMaterializationPlan` に `| { kind: "attach-from-checkpoint"; checkpointRef: string; branchName: string }` を追加する。
- [ ] `MaterializerHost.writeLivenessSidecar` の型に optional `pid?: number | null` を追加する。
- [ ] `WorkspaceMaterializer.materialize` に `case "attach-from-checkpoint"` arm を追加する:
  - `setupPlan = host.resolveSetupPlan()`。
  - `worktreePath = host.manager.create(host.cwd, slug, jobId, plan.checkpointRef, plan.branchName, setupPlan)`。
  - `workspace = { cwd: worktreePath, worktreePath, branch: plan.branchName }`、`host.registerWorkspace(workspace)`。
  - `host.writeLivenessSidecar(slug, jobId, worktreePath, null)`（pid=null）。
  - `bootstrapState` seed / `updateJobState` / `recopyDraftToChangeFolder` / request.md stage・commit は**行わない**（checkpoint tree が既に含む）。
  - `workspace` を返す。
- [ ] 既存 4 arm（resume-existing / resume-recreated / resume-without-recorded-worktree / new-run）のコードは無変更。
- [ ] `src/core/runtime/local.ts` の `writeLivenessSidecar(slug, jobId, worktreePath, pid: number | null = process.pid)` に optional `pid` を追加し、`JSON.stringify({ pid, session: null, worktreePath, jobId }, ...)` で `pid` を書く。既存呼び出し（resume-existing arm / new-run arm / setupWorkspaceNoWorktree）は引数を変えず default `process.pid` を使う。

**Acceptance Criteria**:
- stub host + stub manager での単体テスト: `attach-from-checkpoint` arm が `manager.create` を `(cwd, slug, jobId, checkpointRef, branchName, setupPlan)` で呼ぶ（第 4 引数 = checkpointRef、第 5 引数 = branchName）。`writeLivenessSidecar` が第 4 引数 `null` で呼ばれる。`updateJobState` / bootstrap seed / recopy が呼ばれない。
- 既存の materializer / resume-plan テストが**無改変で green**（挙動不変）。
- `bun run typecheck && bun test` が green。

---

## T-06: `WorkspaceOptions.attachCheckpoint` と setupWorkspace の attach 分岐を追加する

`src/core/port/runtime-strategy.ts` と `src/core/runtime/local.ts` を配線する（design D4）。

- [ ] `WorkspaceOptions` に `attachCheckpoint?: { branch: string; checkpointRef: string }` を追加する。
- [ ] `LocalRuntime.setupWorkspace` の冒頭（`this.currentSlug = slug` と transport-auth pre-warm の後、noWorktree / existingWorktreePath / new-run の分岐より**前**）に early-return を追加する:
  ```ts
  if (opts?.attachCheckpoint) {
    const plan = {
      kind: "attach-from-checkpoint",
      checkpointRef: opts.attachCheckpoint.checkpointRef,
      branchName: opts.attachCheckpoint.branch,
    } as const;
    return this.materializeWorktree(slug, jobId, plan, opts);
  }
  ```
  attach 分岐は fetch を行わない（fetch は orchestrator 済み）。
- [ ] 既存の plan 解決分岐は無変更。

**Acceptance Criteria**:
- `attachCheckpoint` が指定されたとき setupWorkspace が `attach-from-checkpoint` plan で `materializeWorktree` を呼ぶ（stub materializer / 部分 stub での単体テスト or T-09 の統合で確認）。
- `attachCheckpoint` 未指定時の setupWorkspace 挙動は不変（既存テスト無改変 green）。
- `bun run typecheck && bun test` が green。

---

## T-07: attach orchestrator を追加する

`src/core/attach/orchestrator.ts` を新規作成する（design D7 の fetch → read → verify、副作用は fetch のみ）。

- [ ] `runAttachVerification(input): Promise<VerifiedCheckpoint>` を実装する。入力 = `{ cwd, branch, spawnFn（transport-auth-wrapped）, expectedRepo }`。
  - `git fetch origin <branch>` を実行（失敗 → `attachFetchFailedError(branch, detail)`）。
  - `readCheckpointFromRef(spawnFn, cwd, "origin/" + branch)`（T-03）。
  - `verifyCheckpoint({ slug, stateJson, eventsJsonl, treeFiles, branch, expectedRepo })`（T-04）を呼び、`VerifiedCheckpoint` を返す。
- [ ] この関数は worktree / sidecar / job state を作らない（fetch と git object 読みのみ）。materialize は呼び出し側（CLI）が検証成功後に行う。

**Acceptance Criteria**:
- 注入 spawn stub での単体テスト: fetch 失敗 → `ATTACH_FETCH_FAILED`。checkpoint 読み失敗 → `CHECKPOINT_NOT_FOUND`。検証失敗 → `CHECKPOINT_NOT_ATTACHABLE`。valid → `VerifiedCheckpoint`。
- 検証失敗パスで filesystem に worktree / sidecar / state が作られないことをテストで担保する。
- `bun run typecheck && bun test` が green。

---

## T-08: `job attach` CLI を追加し command-registry に登録する

`src/cli/attach.ts` を新規作成し、`src/cli/command-registry.ts` に登録する（design D7）。

- [ ] `runAttach({ branch, cwd, logLevel })`:
  1. worktree guard: `detectSpecrunnerWorktree(cwd)` が worktree なら `worktreeGuardError("job attach", mainPath)` で拒否（resume と同型、exit 2）。
  2. repoRoot 解決 → `loadConfig` → github host 解決 → `resolveGitHubToken` → `getOriginInfo(cwd, host)` で `expectedRepo`。
  3. `config.runtime !== "local"` → `attachRuntimeUnsupportedError(config.runtime)`。
  4. transport-auth-wrapped spawn を作る（`createTransportAuth({ token, cwd }).wrapSpawn(spawnCommand)`）。
  5. `runAttachVerification({ cwd, branch, spawnFn, expectedRepo })`（T-07）→ `VerifiedCheckpoint`。
  6. `bootstrap(cwd, expectedRepo)` で `LocalRuntime` を得る（or `createRuntime`）。`runtime.setupWorkspace(slug, jobId, { attachCheckpoint: { branch, checkpointRef: "origin/" + branch }, baseBranch })` を呼ぶ（materialize + sidecar pid=null）。`baseBranch` は検証済み state から（`state.request.baseBranch ?? "main"`）。
  7. `pipeline.run` は呼ばない。成功メッセージ（attached、`specrunner job resume <slug>` を案内）を出す。
- [ ] `SpecRunnerError` は `err.message` / `err.hint` / `err.exitCode` で表示（resume / archive と同型）。
- [ ] command-registry の `job` サブコマンドに `attach` を追加:
  - `flags: { branch: { type: "string" }, verbose, quiet }`、`--branch` 必須（未指定は arg error）。
  - `guardedSubcommands` に `"attach"` を追加。
  - `USAGE` の Job commands に `job attach --branch <branch>` を追記。

**Acceptance Criteria**:
- `specrunner job attach --branch <b>` が registry に存在し、`--branch` 未指定でエラー（exit 2）。
- worktree 内からの `job attach` が guard で拒否される（resume と同型）。
- managed runtime で `ATTACH_RUNTIME_UNSUPPORTED`。
- `bun run typecheck && bun test` が green。

---

## T-09: 実 git fixture による end-to-end 統合テスト

bare origin ＋ feature branch checkpoint を用いた統合テストで受け入れ基準を固定する（precedent: `tests/core/worktree/manager.test.ts` の実 git 利用）。

fixture 構築（テスト内）:
- テンポラリに bare repo（origin）と作業 clone を作る。
- 作業 clone で feature branch `feat/x-<id>` に `awaiting-resume` の branch-borne checkpoint（`specrunner/changes/<slug>/{state.json, events.jsonl, request.md}` を commit）を作り、origin に push する。
- 別のローカル環境を模す clone（attach 対象マシン）を用意し、そこで `runAttach` を実行する。

- [ ] **自己整合でない checkpoint の拒否**: status を `running` にした checkpoint / `request.md` を欠いた checkpoint / repository 不一致 checkpoint に対し attach が typed error で失敗し、`.git/specrunner-worktrees/` に worktree が作られず `.specrunner/local/<slug>/liveness.json` が存在しないことを確認する。
- [ ] **feature branch HEAD からの materialize**: valid checkpoint に対し attach が worktree を作り、その worktree の `specrunner/changes/<slug>/state.json` と `events.jsonl` が checkpoint（feature HEAD）の内容と一致することを確認する（base branch tip ではない ―― worktree HEAD が feature branch checkpoint commit と一致）。
- [ ] **sidecar 形状**: attach 後の `liveness.json` が `jobId`（branch-borne 由来）/ `worktreePath`（`<slug>-<jobId8>` 規約導出）/ `pid === null` を持つ。
- [ ] **awaiting-resume のみ**: `running` checkpoint は拒否、`awaiting-resume` は受理。
- [ ] **attach → resume**: valid checkpoint を attach した後、`resolveJobStateBySlug(slug, cwd)` が当該 state を発見し、`awaiting-resume → running` への遷移が成立する経路を確認する（resume 経路の無改変性を含む。必要なら resume の prepare 相当まで、または `resolveJobStateBySlug` + sidecar からの existingWorktreePath 解決を確認）。

**Acceptance Criteria**:
- 上記 5 つの statement がすべて green。
- 検証失敗パスで worktree / sidecar / job state が一切作られていないことを filesystem で確認する。
- `bun test` にこの統合テストが含まれ green。

---

## T-10: 全体品質ゲート

- [ ] `bun run typecheck` が green。
- [ ] `bun test`（全スイート）が green。
- [ ] 既存の resume 系 materialization plan テスト（base branch 起点）が**無改変**で green（挙動不変）。
- [ ] `src/git/checkpoint-ref.ts` が `src/core/` / `src/adapter/` を import していない（層制約）。

**Acceptance Criteria**:
- `bun run typecheck && bun test` が green。
- 既存テストの変更が「無関係な回帰修正」ではなく、attach 追加による意図的なもののみであることを diff で確認できる（resume 系 plan テストは無改変）。
