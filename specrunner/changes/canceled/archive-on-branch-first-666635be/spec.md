# Spec: archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する

## Requirements

### Requirement: merge なしの archive 記帳は feature branch 上で行い base に触れない

merge を伴わない `job archive <slug>` は、archive 記帳（change folder の `changes/<slug>` → `changes/archive/<YYYY-MM-DD>-<slug>` への移動 + status 遷移 + `chore: archive <slug>` commit）を **feature branch がチェックアウトされた作業ディレクトリ上で commit し、remote feature branch へ push** しなければならない（MUST）。base ブランチに対する `git checkout` / `git commit` / `git push` を一切行ってはならない（MUST NOT）。

#### Scenario: base に対する git 操作を行わない

**Given** status が `awaiting-archive` の job がある
**When** `job archive <slug>`（`--with-merge` なし）を実行する
**Then** base ブランチを対象とする `git checkout <base>` / `git commit`（base 上）/ `git push origin <base>` がいずれも呼ばれない

#### Scenario: 記帳コミットが feature branch に乗り remote へ push される

**Given** status が `awaiting-archive` の job がある
**When** `job archive <slug>` を実行する
**Then** `chore: archive <slug>` 相当の記帳コミットが feature branch 上に作られ、`git push origin <featureBranch>` で remote feature branch へ push される

#### Scenario: protected base 環境でも成功する

**Given** base ブランチが protected で直 push が reject される環境を模す
**When** `job archive <slug>`（`--with-merge` なし）を実行する
**Then** base への push を行わないため archive 記帳は成功し exit code 0 を返す

### Requirement: base への到達経路を PR merge のみに限定する

archive 記帳が base へ届く経路は feature PR の merge のみでなければならない（MUST）。記帳を base へ直 push する経路、および merge 以外で base を変更する経路を撤去しなければならない（MUST）。

#### Scenario: 記帳は merge を通じてのみ base に入る

**Given** feature branch に archive 記帳コミットが push されている
**When** `--with-merge` で PR が squash merge される
**Then** feature 変更と archive 記帳が同一 merge で base に入る（base への直接 commit/push は発生しない）

### Requirement: `--with-merge` は記帳 → CI green 待ち → merge → cleanup の順で実行する

`--with-merge` は archive 記帳を feature branch に乗せた後に CI が green になるのを待ち、PR を squash merge し、merge 成功後にのみ cleanup を実行しなければならない（MUST）。

#### Scenario: 記帳が merge の前に push される

**Given** status が `awaiting-archive` の job と open な feature PR がある
**When** `job archive --with-merge <slug>` を実行する
**Then** archive 記帳コミットが feature branch へ push された後に CI green を待ち、その後 PR が squash merge される

#### Scenario: cleanup は merge 成功後にのみ走る

**Given** `--with-merge` で PR の merge が成功した
**When** merge 完了後の処理に進む
**Then** worktree 撤去・feature branch 削除（local/remote）が実行される

#### Scenario: merge を伴わない archive は cleanup しない

**Given** status が `awaiting-archive` の job がある
**When** `job archive <slug>`（`--with-merge` なし）を実行する
**Then** PR が open のため worktree 撤去・feature branch 削除を行わない

### Requirement: status lifecycle は記帳段階と terminal 段階を区別する

status lifecycle は「archive 記帳を feature branch に乗せた段階（`archive-recorded`）」と「merge 完了で terminal になる段階（`archived`）」を区別しなければならない（MUST）。`archived` には merge が事実になった後にのみ到達しなければならず、`archived` かつ未 merge の状態を作ってはならない（MUST NOT）。

#### Scenario: 記帳のみでは archived にならない

**Given** status が `awaiting-archive` の job がある
**When** `job archive <slug>`（`--with-merge` なし）を実行する
**Then** job の status は `archive-recorded` になり、`archived` にはならない

#### Scenario: merge 完了後にのみ archived へ遷移する

**Given** status が `archive-recorded` の job がある
**When** `--with-merge` で PR の merge が成功する
**Then** job の status が `archived`（terminal）へ遷移する

#### Scenario: 遷移規則が archived を merge 経路に限定する

**Given** lifecycle の遷移テーブル
**When** `archive-recorded` からの遷移先を参照する
**Then** `archived` および `canceled` のみが許可される

### Requirement: archive は冪等であり中断後に再実行で回復できる

archive 処理は冪等でなければならない（MUST）。記帳が既に feature branch に存在すれば再実行は no-op であり、`--with-merge` で既に merged かつ記帳済み（`archive-recorded`）なら cleanup のみを実行し、中断後の再実行で回復できなければならない（MUST）。

#### Scenario: 記帳済み feature branch への再実行は no-op

**Given** archive 記帳が既に feature branch に存在し status が `archive-recorded` の job がある
**When** `job archive <slug>`（`--with-merge` なし）を再実行する
**Then** change folder 移動・commit が skip され status は `archive-recorded` のまま、exit code 0 を返す

#### Scenario: 既に merged なら cleanup のみ実行する

**Given** feature PR が既に MERGED であり、status が `archive-recorded`（記帳済み）の job がある
**When** `job archive --with-merge <slug>` を実行する
**Then** 記帳・wait・merge を skip し cleanup（worktree 撤去・branch 削除・`archived` 遷移）のみを実行する

#### Scenario: 記帳未実施のまま外部 merge 済みの PR で `--with-merge` を実行する

**Given** feature PR が既に MERGED であり、status が `awaiting-archive`（記帳未実施）の job がある
**When** `job archive --with-merge <slug>` を実行する
**Then** feature branch がまだ存在する場合は `recordArchiveOnBranch` を実行してから `cleanupAfterMerge` に進む。feature branch が削除済みの場合は escalation を返しユーザーに手動対応ガイダンスを提示する

#### Scenario: terminal status は no-op

**Given** status が `archived` または `canceled` の job がある
**When** `job archive <slug>` を実行する
**Then** 何もせず exit code 0 を返す
