# Spec: finish を分解し archive を client-closed な最終片づけコマンドにする

## Requirements

### Requirement: archive orchestrator は GitHubClient port に依存しない

ArchiveOrchestrator の入力型 (`ArchiveInput`) MUST NOT contain `githubClient` / `owner` / `repo` fields. The orchestrator module MUST NOT import `src/core/port/github-client.ts` or `src/kernel/github-client.ts`. The archive execution path SHALL NOT make any GitHub API calls (PR status queries or merge).

#### Scenario: archive 単体実行時に GitHub API 呼び出しが発生しない

**Given** `--with-merge` を指定せずに `job archive <slug>` を実行する
**When** archive orchestrator が完了する
**Then** GitHubClient の メソッド（getPullRequest / mergePullRequest 等）は一度も呼ばれない

### Requirement: job archive は change folder を main に commit + push する

`job archive <slug>` SHALL move `specrunner/changes/<slug>/` to `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` via git mv and commit + push on the main branch.

#### Scenario: change folder が存在する場合

**Given** `specrunner/changes/<slug>/` が存在する
**When** `job archive <slug>` を実行する
**Then** `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ移動され、main branch に `chore: archive <slug>` コミットが作成され、origin main に push される

#### Scenario: change folder が存在しない場合

**Given** `specrunner/changes/<slug>/` が存在しない
**When** `job archive <slug>` を実行する
**Then** archive folder 移動はスキップされ、worktree 撤去と status 更新は実行される

### Requirement: job archive は worktree を撤去する

archive SHALL remove the target job's worktree via `WorktreeManager.remove` + `prune` when `worktreePath` is set, and MUST clear `worktreePath` to null in the persisted state.

#### Scenario: worktree が存在する job を archive する

**Given** job state に `worktreePath` が設定されている
**When** `job archive <slug>` を実行する
**Then** worktree が削除され、state の `worktreePath` が null になる

### Requirement: job archive は status を archived に遷移する

archive SHALL transition the job status to `archived` using `transitionJob` with trigger `"archive"`.

#### Scenario: awaiting-archive の job を archive する

**Given** job status が `awaiting-archive` である
**When** `job archive <slug>` を実行する
**Then** job status が `archived` に遷移し、history に遷移記録が追加される

### Requirement: job finish コマンドは削除され、deprecation メッセージを返す

The CLI SHALL output a deprecation message to stderr and MUST return exit code 2 when `specrunner job finish` is invoked.

#### Scenario: job finish を実行する

**Given** ユーザーが `specrunner job finish <slug>` を実行する
**When** コマンドが処理される
**Then** stderr に deprecation メッセージが出力され、exit code 2 で終了する

### Requirement: --with-merge オプションで merge → archive を一気通貫で実行する

`job archive --with-merge <slug>` SHALL wait for the PR to become mergeable (CLEAN), perform a squash merge, and then execute archive. If the PR is BLOCKED / UNSTABLE / DIRTY, the CLI MUST NOT merge and SHALL stop with an escalation.

#### Scenario: PR が CLEAN で merge 成功 → archive 実行

**Given** PR の mergeStateStatus が CLEAN である
**When** `job archive --with-merge <slug>` を実行する
**Then** PR が squash merge され、続けて archive が実行され、status が archived になる

#### Scenario: PR が BLOCKED で merge 停止

**Given** PR の mergeStateStatus が BLOCKED である
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず、escalation メッセージを出力し exit code 1 で終了する

### Requirement: awaiting-merge は awaiting-archive に rename される

The `JobStatus` type SHALL replace `"awaiting-merge"` with `"awaiting-archive"`. `VALID_TRANSITIONS` MUST keep the same transition shape (rename only). The pipeline completion target MUST be `"awaiting-archive"`.

#### Scenario: pipeline 完了時に awaiting-archive に遷移する

**Given** pipeline が正常完了した
**When** transitionJob が呼ばれる
**Then** status は `"awaiting-archive"` に遷移する

### Requirement: 旧 status は load 時に awaiting-archive へ remap される

`validateJobState` SHALL remap persisted job state status `"success"` and `"awaiting-merge"` to `"awaiting-archive"` on load.

#### Scenario: legacy success status を load する

**Given** job state JSON の status が `"success"` である
**When** `validateJobState` で読み込まれる
**Then** status は `"awaiting-archive"` に正規化される

#### Scenario: legacy awaiting-merge status を load する

**Given** job state JSON の status が `"awaiting-merge"` である
**When** `validateJobState` で読み込まれる
**Then** status は `"awaiting-archive"` に正規化される
