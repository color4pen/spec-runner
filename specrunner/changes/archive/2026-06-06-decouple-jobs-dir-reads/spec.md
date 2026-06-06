# Spec: local runtime job の読み取りを slug/sidecar 起点に移行する

## Requirements

### Requirement: list() / resolveId() は local jobs-dir を readdir しない

`JobStateStore.list()` と `JobStateStore.resolveId()` は、**local runtime job** について `.specrunner/jobs/`（local split-layout / flat file）を **readdir スキャンしてはならない（MUST NOT）**。local job の state 本体は active=worktree 内 slug dir、archived=`changes/archive/`、index=sidecar（`.specrunner/local/<slug>/`）から得る MUST。managed の marker → jobs-dir 経路（`list()` section 4）は温存 MUST し、本要件の対象外とする。

#### Scenario: list() が local jobs-dir を readdir しない

**Given** local runtime job が worktree / archive / sidecar に存在する
**When** `JobStateStore.list(repoRoot)` を実行する
**Then** `fs.readdir` が `.specrunner/jobs/`（jobs-dir）に対して呼ばれず、active local job が一覧に含まれる

#### Scenario: resolveId() が local jobs-dir を readdir しない

**Given** sidecar（`liveness.json`）を持つ local job が存在する
**When** その jobId の短縮 prefix で `JobStateStore.resolveId(repoRoot, prefix)` を実行する
**Then** `fs.readdir` が `.specrunner/jobs/` に対して呼ばれず、full jobId が解決される

### Requirement: jobId / cross-branch 解決は sidecar index を起点にする

`jobId → slug → worktreePath` の解決は sidecar（local の `liveness.json` / managed の `marker.json`、いずれも `jobId` を保持）を index として行う MUST。state 本体は slug dir（active=worktree 内、archived=`changes/archive/`）から読む MUST。worktree 削除済み・未 archive の local job は degrade した表示でよい SHALL が、jobId を失ってはならない MUST。

#### Scenario: 短縮 prefix が sidecar 経由で解決する

**Given** sidecar に jobId を持つ local job が存在する
**When** その jobId の短縮 prefix で `resolveId` を実行する
**Then** sidecar index 由来の候補から full jobId が一意に解決される

#### Scenario: degrade した local job でも jobId を失わない

**Given** worktree が削除済みかつ未 archive で、sidecar（`liveness.json`）のみが残る local job
**When** その jobId の短縮 prefix で `resolveId` を実行する
**Then** sidecar の jobId から full jobId が解決される（一覧表示は degrade してよい）

### Requirement: local runtime state-read caller は slug 経由で読む

local runtime job の状態読み取り caller（`job show`、`job cancel` の load、`resume` の load、archive の `resolve-target` の load）は、`jobId → slug` を sidecar で解決し、その slug dir（active=worktree 内、archived=`changes/archive/`）から state を読む MUST。jobId ストア（`.specrunner/jobs/`）の readdir スキャンに依存してはならない MUST。各 caller の書き込み（dual-write / jobId ストア persist）は不変 MUST。

#### Scenario: job show <jobId> が sidecar 経由で解決する

**Given** active local job の jobId（UUID）
**When** `specrunner job show <jobId>` を実行する
**Then** sidecar（`liveness.json`）で `jobId → slug` を解決し worktree slug dir の state を表示する

#### Scenario: job cancel <jobId> が sidecar 経由で load する

**Given** active local job の jobId
**When** `specrunner job cancel <jobId>` を実行する
**Then** sidecar 経由で slug dir の state を load した上で cancel 処理に進み、jobId ストアへの書き込み挙動は従来どおりになる

#### Scenario: resume <jobId> が sidecar 経由で load する

**Given** slug 解決に失敗し短縮 jobId で再開する local job
**When** `specrunner resume <jobId>` を実行する
**Then** sidecar 経由で `jobId → slug` を解決し slug dir の state から再開する

#### Scenario: archive の resolve-target が slug 経由で load する

**Given** jobId 指定で対象 job を解決する archive / finish 経路
**When** `resolveByJobId(jobId)` が実行される
**Then** sidecar 経由で slug dir の state を load し、jobId ストア readdir に依存しない

### Requirement: cross-branch 可視性と managed 可視性を維持する

`specrunner job ls` / `job show` の cross-branch 可視性は現状維持 MUST。別ブランチ上の local active job も status / step が見え、active managed job も現状どおり可視である MUST。

#### Scenario: 別ブランチの local active job が見える

**Given** 別ブランチで実行中の local active job（worktree が存在する）
**When** `specrunner job ls` を実行する
**Then** その job が status / step とともに一覧に表示される

#### Scenario: active managed job が見える

**Given** marker（`marker.json`）を持つ active managed job
**When** `specrunner job ls` を実行する
**Then** その managed job が現状どおり一覧に表示される

### Requirement: archive Phase 2 の worktreePath クリアは sidecar を更新する

`archive` Phase 2 の worktree teardown 後の worktreePath クリアは、jobId ストアではなく sidecar（`liveness.json`）を更新 MUST する（isolated な読み書きの repoint）。jobId ストアの read/write を Phase 2 で行ってはならない MUST。dual-write 本体には触れない MUST。

#### Scenario: Phase 2 が sidecar の worktreePath をクリアする

**Given** archive 対象の local job の sidecar `liveness.json` に worktreePath が記録されている
**When** archive Phase 2 の worktree teardown が完了する
**Then** sidecar の `worktreePath` が `null` に更新され、jobId ストアの read/write は発生しない

#### Scenario: sidecar 不在でも Phase 2 が失敗しない

**Given** sidecar が存在しない local job を archive する
**When** archive Phase 2 を実行する
**Then** worktreePath クリアは best-effort で no-op になり、archive の exit code・最終 status は不変になる

### Requirement: dual-write と managed 読み取り経路を温存し検証が green

dual-write（jobId ストアへの書き込み）と managed の jobs-dir 読み取り経路（marker → jobs-dir）、および `load()` の jobs-dir fallback readFile は本変更で温存 MUST する。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: dual-write が温存される

**Given** 本変更適用後
**When** local runtime job を run / cancel / resume する
**Then** jobId ストアへの書き込み挙動が適用前と同一になる

#### Scenario: 検証が green

**Given** 本変更適用後
**When** `bun run typecheck && bun run test` を実行する
**Then** typecheck と test がいずれも green になる
