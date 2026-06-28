# Spec: archive on feature branch, base reached only via merge

## Requirements

### Requirement: Archive recording lands on the feature branch, never on base

merge なしの `job archive <slug>` は、archive 記帳（change folder の移動 + job status 遷移 + `chore: archive <slug>` commit）を feature branch 上で行い、その commit を remote feature branch へ push しなければならない (MUST)。merge なし経路は base ブランチに対する `git checkout` / `git commit` / `git push` を一切実行してはならない (MUST NOT)。記帳 commit は既存の feature PR に含まれる。

#### Scenario: 記帳 commit が feature branch に乗り remote feature branch へ push される

**Given** status `awaiting-archive` の job が feature branch `change/<slug>-<hash>` 上に存在し、change folder `specrunner/changes/<slug>/` が feature branch に保持されている
**When** merge なしの `job archive <slug>` を実行する
**Then** change folder を `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ移動した記帳 commit `chore: archive <slug>` が feature branch 上に作成される
**And** その commit が `git push origin <feature-branch>` で remote feature branch へ push される

#### Scenario: merge なし archive は base に触れない

**Given** status `awaiting-archive` の job
**When** merge なしの `job archive <slug>` を実行する
**Then** base ブランチに対する `git checkout <base>` は呼ばれない
**And** base ブランチに対する `git commit` は呼ばれない
**And** `git push origin <base>` は呼ばれない

### Requirement: Archive completes when base is protected

base が protected で直接 push 不可な環境でも、merge なしの `job archive <slug>` は成功しなければならない (MUST)。記帳は base ではなく feature branch を対象にするため、base の push 拒否は archive の完了を妨げてはならない (MUST NOT)。

#### Scenario: protected base 環境で merge なし archive が成功する

**Given** base ブランチへの直接 push が reject される環境
**And** status `awaiting-archive` の job
**When** merge なしの `job archive <slug>` を実行する
**Then** archive は exit code 0 で成功する
**And** base への push 試行は一度も発生していない

### Requirement: Status finalizes to archived at recording time, independent of merge

job status は archive 記帳実行時点（feature branch 上）で terminal の `archived` に確定しなければならない (MUST)。status の確定は merge の有無に依存してはならない (MUST NOT)。merge 後の cleanup 経路は job status を一切書き換えてはならない (MUST NOT)。

#### Scenario: merge なしでも status が archived に確定する

**Given** status `awaiting-archive` の job
**When** merge なしの `job archive <slug>` を実行する（merge は行わない）
**Then** job status は `archived` に遷移する
**And** 遷移は `awaiting-archive → archived` の直接遷移である

#### Scenario: merge 後の cleanup は status を書き換えない

**Given** 記帳済み（status `archived`）で PR が merge された job
**When** merge 後の cleanup が実行される
**Then** cleanup は job status の書き込みを行わない
**And** base の working tree は dirty にならない

### Requirement: with-merge waits for CI green on the post-archive head, then merges, then cleans up

`--with-merge` は、archive 記帳を feature branch に乗せた後、記帳 commit を push した後の headSha を対象に CI が green になるのを待ってから PR を squash merge しなければならない (MUST)。worktree / feature branch の cleanup は merge 成功後にのみ実行しなければならない (MUST)。

#### Scenario: CI green を待ってから merge し、merge 後に cleanup する

**Given** status `awaiting-archive` の job と open な feature PR
**When** `job archive --with-merge <slug>` を実行する
**Then** 記帳 commit が feature branch へ push される
**And** 記帳 push 後の headSha に対する CI が green になるまで merge は実行されない
**And** CI green 後に PR が squash merge される
**And** worktree 撤去と feature branch 削除は merge 成功後にのみ実行される

#### Scenario: merge が成立しなければ cleanup しない

**Given** CI が green にならない、または branch protection 未充足（`BLOCKED`）の PR
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず escalation で停止する
**And** worktree / feature branch の cleanup は実行されない

### Requirement: No-merge archive preserves the feature branch and worktree

merge を伴わない `job archive <slug>` は、PR がまだ生きているため feature branch（local / remote）を削除してはならない (MUST NOT)。worktree も撤去してはならない (MUST NOT)。

#### Scenario: merge なし archive は feature branch を残す

**Given** open な feature PR を持つ job
**When** merge なしの `job archive <slug>` を実行する
**Then** local feature branch は削除されない
**And** remote feature branch は削除されない
**And** worktree は撤去されない

### Requirement: No intermediate status is introduced

本変更は archive と merge の間に中間 status（`archive-recorded` 等）を新規導入してはならない (MUST NOT)。job status の集合と遷移表は本変更前後で不変でなければならない (MUST)。

#### Scenario: status 集合と遷移が不変である

**Given** 本変更後のコードベース
**When** job status の集合と遷移表を検査する
**Then** status の集合は `running` / `awaiting-resume` / `awaiting-archive` / `archived` / `failed` / `terminated` / `canceled` のみである
**And** `awaiting-archive` から `archived` への直接遷移が存在する
**And** `archive-recorded` 等の新規 status は存在しない

### Requirement: Archive recording and cleanup are idempotent and recoverable

archive 記帳と cleanup は冪等でなければならない (MUST)。中断後の再実行で回復できなければならない (MUST)。

#### Scenario: 記帳済み feature branch への再実行は no-op

**Given** archive 記帳が既に feature branch に存在し status が `archived` の job
**When** merge なしの `job archive <slug>` を再実行する
**Then** 新たな commit は作成されない
**And** archive は exit code 0 で no-op として完了する

#### Scenario: with-merge 再実行で既に merged なら cleanup のみ実行する

**Given** 記帳済みかつ PR が既に MERGED の job
**When** `job archive --with-merge <slug>` を再実行する
**Then** 記帳も merge も再実行されない
**And** cleanup（worktree 撤去 + feature branch 削除）のみが実行される
