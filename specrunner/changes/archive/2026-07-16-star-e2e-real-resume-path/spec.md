# Spec: 主役 E2E の Machine B を実 `job resume` 経路で通す

主役 E2E `tests/attach/attach-resume-e2e.test.ts` の Machine B 側を、実 `ResumeCommand`
（`prepare()` + `buildPipelineForJob()` 非 mock）× 実 `Pipeline.run()` で駆動し、attach→resume interop を
実体で固定する。受け入れ基準の文言を実体に一致させ、看板を実体より大きくしない。

## Requirements

### Requirement: 主役 E2E は Machine B を実 `ResumeCommand` 経由で resume 開始する

主役 E2E は、実 attach（materialize）で Machine B に worktree と liveness sidecar を生成したのち、実
`ResumeCommand`（`prepare()` と `buildPipelineForJob()` を mock せず駆動）を通して実 `Pipeline.run()` を
`resumePoint.step` から開始させ、fake agent runner がその step で呼ばれることを 1 本の統合テストで
固定 MUST する。テスト自前の `transitionJob(running)` 直呼び・テスト定義 descriptor 直呼び・pipeline module の
`vi.mock`・state の hand-seed のいずれでも代替しては MUST NOT ならない。

#### Scenario: 実 attach 成果物から実 resume が開始する

**Given** Machine A が publish した awaiting-resume checkpoint が origin/BRANCH にあり、別 clone（Machine B）で
`runAttachVerification` を通し、`LocalRuntime.setupWorkspace({ attachCheckpoint })` が worktree と
liveness sidecar（pid=null）を実物として生成している
**When** `new ResumeCommand(localRuntime, events, slug, { cwd: machineBDir }).execute()` を呼ぶ
**Then** 実 `Pipeline.run()` が `resumePoint.step`（implementer）から開始し、fake agent runner が implementer で
ちょうど 1 回呼ばれる

#### Scenario: resume が sidecar/worktree 経由で attached state を解決する

**Given** どこにも job state を hand-seed していない（唯一の state は attach 生成 worktree の `state.json` と
liveness sidecar）
**When** resume が実行される
**Then** resume が解決した job の jobId は attach の jobId と一致し、slug は request の slug と一致し、
解決時点の disk state.json は `awaiting-resume` である

#### Scenario: 解決された開始 step は resumePoint.step と一致する

**Given** checkpoint state の `resumePoint.step` が implementer である
**When** resume が開始 step を解決する
**Then** fake agent runner が呼ばれた step は `resumePoint.step`（implementer）と一致する

#### Scenario: running 遷移が worktree の state.json へ永続化される

**Given** attach 直後の worktree の `state.json` が `awaiting-resume` である
**When** resume が開始し fake agent runner が implementer で呼ばれる
**Then** その時点で worktree の `state.json` は `running` へ更新・永続化されている（`ResumeCommand.prepare()` が
step 実行前に `resolveStateStoreByJobId` 経由で worktree store へ書いた結果である）

#### Scenario: existing worktree を再利用し新規 worktree を作らない

**Given** attach が worktree を生成済みで、その path が liveness sidecar に記録されている
**When** resume が setupWorkspace を実行する
**Then** resume runtime の `manager.create` は 0 回呼ばれ、fake agent runner の `ctx.cwd` は attach 生成 worktree の
path と一致する

#### Scenario: descriptor は buildPipelineForJob が実選択する

**Given** checkpoint state の pipelineId が未設定（既定 `standard`）である
**When** `CommandRunner.execute()` が `buildPipelineForJob(jobState, deps, events)` を呼ぶ
**Then** 選択される descriptor は STANDARD であり、テスト定義の descriptor でも mock でもない。implementer が
timeout で guard-halt し、最終 state は `awaiting-resume`（`resumePoint.step === implementer`）に落ちる
（STANDARD 実選択の behavioral 署名）

### Requirement: Machine A（#838）の挙動は不変

Machine A 側の実 pipeline guard-halt→checkpoint publish のアサーション（status=awaiting-resume,
resumePoint=implementer, runner 1 回, checkpoint commit `checkpoint: <slug>`, tree に state.json/events.jsonl/request.md）は
無変更で green MUST である。

#### Scenario: Machine A のアサーションは #838 と同一で green

**Given** 本 change は Machine B 側のみを書き換える
**When** テストを実行する
**Then** Machine A（TC-E2E-001 相当）のアサーションは #838 と同一の内容で通る

### Requirement: 受け入れ基準の文言は実体に一致する

change folder の spec / 受け入れ基準は、Machine B の resume 開始を「実 `ResumeCommand`
（`prepare()` + `buildPipelineForJob()` 非 mock）経由で開始する」と、実装した実体に一致する表現で記述 SHALL する。
「既存 resume（`job resume`）を開始できる」を、実 `ResumeCommand` 経由で開始する意味へ具体化し、看板を実体より
大きくしては MUST NOT ならない。

#### Scenario: 主役 E2E 受け入れ基準が実体を表す

**Given** Machine B が実 `ResumeCommand` × `buildPipelineForJob` 非 mock で resume を開始する
**When** 受け入れ基準 / spec の該当文言を読む
**Then** 文言は「実 `ResumeCommand`（prepare + buildPipelineForJob 非 mock）で開始する」ことを表し、
証明していない範囲（STANDARD pipeline の完走・managed resume・自動 resume）を主張しない
