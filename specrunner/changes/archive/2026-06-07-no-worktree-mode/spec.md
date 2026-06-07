# Spec: `--no-worktree` 実行モード

## Requirements

### Requirement: run / resume は `--no-worktree` フラグを受け付ける

`specrunner run`（および alias `job start`）と `specrunner resume` は `--no-worktree` boolean フラグを受理し MUST。フラグ未指定時は従来の worktree モードで動作し MUST。

#### Scenario: run が --no-worktree を受理する

**Given** base branch の clean checkout 上にいる
**When** `specrunner run --no-worktree <slug>` を実行する
**Then** フラグが解析され、no-worktree モードで pipeline が起動する

#### Scenario: resume が --no-worktree を受理する

**Given** 既存 feature branch を checkout 済みの clean な状態にいる
**When** `specrunner resume --no-worktree <slug>` を実行する
**Then** フラグが解析され、no-worktree モードで pipeline が再開する

### Requirement: --no-worktree の run は worktree を作らず cwd 上で feature branch を作成する

`--no-worktree` 指定の run は `git worktree add` を行わ MUST NOT。base branch の clean checkout 上で `git checkout -b <branchName>` により feature branch を作成・切り替え、cwd を作業ディレクトリとして pipeline を実行し MUST。branch 名は現行規則 `change/<slug>-<jobId8>` を維持し MUST。

#### Scenario: worktree を作らず feature branch を作成する

**Given** base branch の clean checkout 上で `--no-worktree` を指定する
**When** `setupWorkspace` が実行される
**Then** `.git/specrunner-worktrees/` 配下に worktree は作成されず、`git checkout -b change/<slug>-<jobId8>` で feature branch が作成され、pipeline が cwd 上で実行される

### Requirement: --no-worktree の resume は既存 feature branch checkout を再利用する

`--no-worktree` 指定の resume は worktree を作成・再作成し MUST NOT。feature branch が checkout 済みの cwd を作業ディレクトリとして pipeline を再開し MUST。

#### Scenario: 既存 checkout 上で worktree を作らず再開する

**Given** feature branch を checkout 済みの clean な cwd で `--no-worktree` を指定する
**When** `setupWorkspace` が実行される
**Then** worktree は作成されず、cwd を作業ディレクトリとして halted step から pipeline が再開する

### Requirement: --no-worktree は実行前に working tree が clean であることを要求する

`--no-worktree` 指定時、`setupWorkspace` は `git status --porcelain` で working tree を検査し MUST。未コミットの変更または untracked ファイルが存在する場合、pipeline を実行せずエラーで停止し MUST。

#### Scenario: dirty な working tree で停止する

**Given** 未コミット変更または untracked ファイルがある状態で `--no-worktree` を指定する
**When** `setupWorkspace` が clean 検査を行う
**Then** `WORKTREE_DIRTY` エラーで停止し、job は `failed` となり、非ゼロ終了する

#### Scenario: clean な working tree では続行する

**Given** working tree が clean な状態で `--no-worktree` を指定する
**When** `setupWorkspace` が clean 検査を行う
**Then** 検査を通過し、pipeline 実行を続行する

### Requirement: no-worktree モードは state に永続化され archive から判別できる

`--no-worktree` で実行された job は、その事実を JobState の portable フィールドとして永続化し MUST。このフィールドは slug-mode の state.json に書き出され、feature branch に commit され、後続の `job archive`（別プロセス）から読み取り可能で MUST。

#### Scenario: no-worktree フラグが state.json に残る

**Given** `--no-worktree` で run を実行する
**When** job state が slug store に永続化される
**Then** `specrunner/changes/<slug>/state.json` に no-worktree を示すフィールドが含まれる（machine-local strip の対象外）

#### Scenario: archive が no-worktree を判別する

**Given** no-worktree で実行され state に no-worktree フラグを持つ job
**When** `specrunner job archive <slug>` が Phase 0 で state を読む
**Then** その job が no-worktree モードであると判別できる

### Requirement: no-worktree 時の sidecar は worktreePath を null とする

`--no-worktree` 指定時、liveness sidecar の `worktreePath` は null で MUST。`pid` と `jobId` は worktree モードと同様に記録し MUST。

#### Scenario: sidecar に worktreePath: null を書く

**Given** `--no-worktree` で pipeline を起動する
**When** liveness sidecar が書かれる
**Then** sidecar は `{ pid, session: null, worktreePath: null, jobId }` を持つ

### Requirement: no-worktree 時の exit-guard は cwd の state から job を特定する

`--no-worktree` 指定時、`beforeExit` の exit-guard は `.git/specrunner-worktrees/` 走査に依存せ MUST NOT。cwd の slug state（`specrunner/changes/<slug>/state.json`）から直接 job を特定し、running なら `awaiting-resume` へ遷移し MUST。

#### Scenario: 実行中プロセス終了で awaiting-resume へ遷移する

**Given** no-worktree で running 状態の job がある cwd
**When** プロセスが running のまま終了し exit-guard が発火する
**Then** worktree 走査を行わず cwd state から当該 job を特定し、`awaiting-resume` へ遷移する

#### Scenario: awaiting-resume へ遷移した job を再開できる

**Given** no-worktree run の途中でプロセスが終了し job が `awaiting-resume` になった
**When** `specrunner resume --no-worktree <slug>` を実行する
**Then** halted step から pipeline が再開する

### Requirement: no-worktree 時の state store 解決は sidecar に依存しない

`--no-worktree` 指定の resume は、job state の読み書きを machine-local sidecar index に依存せ MUST NOT。cwd の slug store（`{ slug, stateRoot: cwd }`）を直接対象とし MUST。

#### Scenario: sidecar 不在の checkout で resume が状態遷移を永続化する

**Given** sidecar が存在しない fresh checkout（feature branch checkout 済み）で `--no-worktree` resume する
**When** running 遷移を永続化する
**Then** `specrunner/changes/<slug>/state.json` に running 遷移が書き込まれる（sidecar 解決の失敗でスキップされない）

### Requirement: archive は no-worktree 時に worktree remove/prune をスキップし feature branch を削除する

`job archive` は対象 job が no-worktree モードのとき、Phase 2 の worktree remove / prune を実行し MUST NOT。feature branch の削除（local + remote）と sidecar / managed marker の削除は通常通り実行し MUST。worktree モードの job では従来通り worktree remove / prune を実行し MUST。

#### Scenario: no-worktree job の archive で worktree 撤去をスキップする

**Given** no-worktree モードで実行され完了した job
**When** `specrunner job archive <slug>` の Phase 2 が実行される
**Then** worktree remove / prune は行われず、feature branch の local + remote 削除は実行される

#### Scenario: worktree job の archive は従来通り worktree を撤去する

**Given** worktree モード（フラグ無し）で実行され完了した job
**When** `specrunner job archive <slug>` の Phase 2 が実行される
**Then** worktree remove / prune と feature branch 削除がいずれも実行される

### Requirement: worktree モードの挙動は不変

`--no-worktree` 未指定時、run / resume / archive / exit-guard / sidecar / state store 解決は本変更前と同一の挙動で MUST。

#### Scenario: フラグ無し run が worktree を作る

**Given** main worktree から `--no-worktree` を付けずに run する
**When** `setupWorkspace` が実行される
**Then** 従来通り `.git/specrunner-worktrees/<slug>-<jobId8>/` に worktree が作成され、既存テストが全て通る
