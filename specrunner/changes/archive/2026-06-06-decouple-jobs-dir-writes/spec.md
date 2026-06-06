# Spec: local runtime の state 書き込みを slug/sidecar に一本化する

## Requirements

### Requirement: 初期 state 永続化は worktree 確立後に slug 正本 + sidecar へ defer する

local runtime の job 起動時、初期 state の永続化は `JobStateStore.create()` ではなく **worktree 確立後**に行う MUST。jobId 採番（＋ branch 名導出）と初期 state 永続化は分離 MUST し、永続化先は slug 正本 + sidecar とする MUST。`RuntimeStrategy.bootstrapJob()` は local では初期 state を**永続化してはならない（MUST NOT）**。managed では従来どおり jobId ストアへ永続化する MUST。

#### Scenario: local run の bootstrap で jobId ストアに書かない

**Given** `specrunner run` で local runtime の job を起動する
**When** `PipelineRunCommand.prepare()` が `bootstrapJob()` を呼ぶ
**Then** `.specrunner/jobs/<jobId>/` は作成・更新されず、jobId と branch 名が in-memory state から導出される

#### Scenario: worktree 確立後に slug 正本 + sidecar へ初期 state が書かれる

**Given** local runtime の job で worktree が新規作成される
**When** `setupWorkspace()` が完了する
**Then** worktree 内 `specrunner/changes/<slug>/state.json` + `events.jsonl` に初期 state が、`.specrunner/local/<slug>/liveness.json` に machine-local フィールドが書かれる

#### Scenario: managed の bootstrap は jobId ストアへ書く（温存）

**Given** managed runtime の job を起動する
**When** `bootstrapJob()` が呼ばれる
**Then** 初期 state が `.specrunner/jobs/<jobId>/` へ永続化される（適用前と同一）

### Requirement: local の updateJobState は slug 正本のみへ書く

`LocalRuntime.updateJobState()` は slug ストアから load → mutate → slug ストアへ persist する MUST。jobId ストアへの persist を**行ってはならない（MUST NOT）**。machine-local フィールド（worktreePath / pid / session）は slug 正本へは書かれず（slug-mode で strip）、sidecar が保持する MUST。

#### Scenario: updateJobState が jobId ストアに書かない

**Given** worktree 確立済みの local job
**When** `updateJobState()` で worktreePath / branch / request.path を更新する
**Then** `.specrunner/jobs/<jobId>/` は更新されず、portable フィールドは slug 正本に反映される

### Requirement: local の全 persist 経路が jobId ストアに書かない

local runtime の終端 / 再開 / 取消 / 退出時 persist（`command/runner.ts` の終端 persist、`command/resume.ts` の遷移 persist、`lifecycle/exit-guard.ts`、`cancel/runner.ts`）は、jobId ストア（`.specrunner/jobs/<jobId>/`）へ**書いてはならない（MUST NOT）**。書き込み可能な slug 正本（active=worktree / archived=`changes/archive/`）が解決できる場合はそこへ portable state を、sidecar へ machine-local を書く MUST。解決できない場合（worktree 破棄済み等）は best-effort skip とする MAY。managed runtime の jobId ストア書き込みは温存する MUST。

#### Scenario: runner の終端 persist が local で jobId ストアに書かない

**Given** local runtime の job で setupWorkspace 後にパイプラインがクラッシュする
**When** `command/runner.ts` の終端 persist が走る
**Then** failed state は slug 正本へ書かれ、`.specrunner/jobs/<jobId>/` は更新されない

#### Scenario: resume の遷移 persist が local で jobId ストアに書かない

**Given** sidecar と worktree を持つ local job を resume する
**When** `command/resume.ts` が running への遷移を persist する
**Then** running state は worktree の slug 正本へ書かれ、`.specrunner/jobs/<jobId>/` は更新されない

#### Scenario: exit-guard の global persist が local で jobId ストアに書かない

**Given** running 状態の local job が `list()` で得られる
**When** `handleGlobalExit` が awaiting-resume へ遷移し persist する
**Then** slug 正本へ書かれ、`.specrunner/jobs/<jobId>/` は更新されない

#### Scenario: cancel の persist が local で jobId ストアに書かない

**Given** sidecar を持つ active local job を cancel する（worktree+branch は cleanup で削除される）
**When** canceled state の persist 段階に達する
**Then** slug 正本が存在しないため persist は best-effort skip され、`.specrunner/jobs/<jobId>/` は作成・更新されず、jobId は sidecar に残る

#### Scenario: managed の persist は jobId ストアへ書く（温存）

**Given** managed runtime の job を cancel / resume / 終端する
**When** 各 persist 経路が走る
**Then** jobId ストアへの書き込み挙動が適用前と同一になる

### Requirement: local の run / resume / cancel は .specrunner/jobs/ を生成・更新しない

local runtime の run / resume / cancel 実行後、`.specrunner/jobs/<jobId>/` が**作成も更新もされてはならない（MUST NOT）**。`create()` の初期書き込みを含め、jobs-dir への書き込みが無いこと。

#### Scenario: local run 実行後に jobs-dir が存在しない

**Given** sidecar を併設した local runtime の run フローを実行する
**When** run（bootstrap → setupWorkspace → step persist → 終端）が完了する
**Then** `.specrunner/jobs/` ディレクトリへの書き込みが一度も発生しない

#### Scenario: local resume / cancel 実行後に jobs-dir が更新されない

**Given** sidecar を持つ local job
**When** resume または cancel を実行する
**Then** `.specrunner/jobs/<jobId>/` は作成・更新されない

### Requirement: R1 の読み取り経路と managed 経路を温存し検証が green

R1 で slug/sidecar 起点へ移行した読み取り経路（`list()` / `resolveId()` / `loadStateByJobId` 等）は引き続き正しく state を取得 MUST する。`load()` の jobs-dir fallback readFile、managed の marker→jobs-dir 経路、`xdg.ts` helper / doctor checks は温存 MUST する。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: 移行済み読み取り経路が引き続き state を取得する

**Given** 本変更適用後の active local job
**When** `job show` / `job ls` / `resume` が state を読む
**Then** slug 正本 / sidecar から正しく state が取得される

#### Scenario: 検証が green

**Given** 本変更適用後
**When** `bun run typecheck && bun run test` を実行する
**Then** typecheck と test がいずれも green になる
