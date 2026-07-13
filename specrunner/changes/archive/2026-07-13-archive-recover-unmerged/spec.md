# Spec: `--with-merge` の archive-record 後 merge 失敗からの回復

## Requirements

### Requirement: 記帳後・merge 前は job が再解決可能な非 terminal 状態を保つ

`job archive --with-merge <slug>` は、archive 記帳（change folder の archive/ への移動 + feature branch への commit・push）を行った後、merge が成立するまで job status を `awaiting-archive` に保たなければならない (MUST)。記帳フェーズは merge 前に status を `archived` へ遷移させてはならない (MUST NOT)。

#### Scenario: 記帳後・merge 前の status は awaiting-archive

**Given** status `awaiting-archive` の job と open な feature PR
**When** `job archive --with-merge <slug>` の記帳が完了し、merge がまだ行われていない
**Then** job status は `awaiting-archive` のままである
**And** change folder は feature branch 上で `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ移動して commit・push されている

### Requirement: 記帳後・merge 失敗時に job が再解決でき merge を retry できる

記帳が完了した後に merge が失敗（escalation）しても、`job archive --with-merge <slug>` の再実行は job を解決しなければならない (MUST)。再実行は idempotent な記帳（移動済 folder は再移動しない、staged 変更が無ければ commit しない）を経て CI 待ち・merge へ進めなければならない (MUST)。再実行が「No job found」で失敗してはならない (MUST NOT)。

#### Scenario: merge 失敗後の再実行が job を解決し merge へ進む

**Given** worktree モードで記帳が完了し（folder は worktree の archive/ 配下、status `awaiting-archive`）、直前の merge が escalation で失敗した job
**When** `job archive --with-merge <slug>` を再実行する
**Then** job が解決され、「No job found」を返さない
**And** 記帳は idempotent に再実行され新規 commit を作らない
**And** CI 待ち・squash merge へ進む

#### Scenario: worktree の archive/ 配下の状態が includeArchived 走査で発見される

**Given** worktree `.git/specrunner-worktrees/<wt>/specrunner/changes/archive/<YYYY-MM-DD>-<slug>/state.json` に status `awaiting-archive` の state が存在する
**When** `includeArchived: true` で job 一覧を走査する
**Then** その job が一覧に含まれ、その source change dir が当該 worktree の archive dated dir を指す
**And** `includeArchived: false` の走査ではその job は含まれない

### Requirement: 「archive 記録済み」判定を change folder の位置で行い crash-resume と順序エラーを区別する

`--with-merge` の初回 PR 判定は、PR が MERGED のとき「archive 記録済みか否か」を **change folder が archive/ 配下にあるか** で判定しなければならない (MUST)。記録済み（archive/ 配下）かつ MERGED は merge 後 resume（`archived` への遷移 + post-merge cleanup）として扱わなければならない (MUST)。未記録（active `<slug>/`）かつ MERGED は順序エラー escalation として扱わなければならない (MUST)。

#### Scenario: 記録済み + PR merged の crash resume

**Given** 記帳済み（folder は archive/ 配下、status `awaiting-archive`）かつ PR が既に MERGED の job
**When** `job archive --with-merge <slug>` を実行する
**Then** 記帳・merge は再実行されない
**And** job status が `archived` へ遷移する
**And** post-merge cleanup（worktree 撤去 + branch 削除）が実行される

#### Scenario: 未記録 + PR merged は順序エラー

**Given** change folder が active `specrunner/changes/<slug>/` のまま（未記帳）で PR が既に MERGED の job
**When** `job archive --with-merge <slug>` を実行する
**Then** 順序エラーの escalation を返す
**And** post-merge cleanup は実行されない

### Requirement: merge 成功後に status を archived へ遷移させ cleanup を実行する

`--with-merge` が PR を merge した後、post-merge cleanup を実行するすべての経路で、cleanup の直前に job status を `awaiting-archive → archived` へ遷移させなければならない (MUST)。この遷移は idempotent（既 `archived` なら no-op）でなければならない (MUST)。

#### Scenario: fresh merge 成功後に archived へ遷移し cleanup する

**Given** status `awaiting-archive` の job と CI green な open feature PR
**When** `job archive --with-merge <slug>` が記帳 → CI green 待ち → squash merge を成功させる
**Then** merge 成功後に job status が `archived` へ遷移する
**And** post-merge cleanup が実行される

### Requirement: `--with-merge` なしの `job archive` は挙動不変

`--with-merge` を伴わない `job archive <slug>` は、記帳時点（feature branch 上）で status を `archived` に確定させる既存挙動を保たなければならない (MUST)。本変更は plain 経路の記帳・status 遷移 timing・cleanup を呼ばない構造を変更してはならない (MUST NOT)。

#### Scenario: plain archive は記帳時に archived を確定する

**Given** status `awaiting-archive` の job
**When** `--with-merge` なしの `job archive <slug>` を実行する
**Then** 記帳フェーズで job status が `archived` へ遷移する
**And** post-merge cleanup（worktree 撤去 / branch 削除）は呼ばれない

### Requirement: 中間 status を新設しない

本変更は job status の集合と遷移表を変更してはならない (MUST NOT)。`archive-recorded` 等の中間 status を導入してはならない (MUST NOT)。

#### Scenario: status 集合と遷移が不変

**Given** 本変更後のコードベース
**When** job status の集合と遷移表を検査する
**Then** status 集合は `running` / `awaiting-resume` / `awaiting-archive` / `archived` / `failed` / `terminated` / `canceled` のみである
**And** `awaiting-archive → archived` の直接遷移が存在する
**And** 新規 status は存在しない
