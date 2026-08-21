# Spec: plain archive の状態遷移を merge 境界に合わせる

## Requirements

### Requirement: plain job archive は archive record を作っても awaiting-archive を維持する

PR を持つ job に対する plain `specrunner job archive <slug>`（`--with-merge` なし）は、change folder の archive 配置・archive record commit の作成・feature branch への push に成功しても、job status を `archived` に遷移させては**ならない**。この経路は `markJobArchived` を呼び出してはならず（MUST NOT）、job status は `awaiting-archive` のまま維持されなければならない（SHALL）。

#### Scenario: PR が未merge の状態で plain archive が成功する

**Given** slug `demo` の job が status `awaiting-archive` で、`pullRequest.number` = 42 を持つ
**And** PR #42 の state が `OPEN` である
**When** plain `job archive demo` を実行する
**Then** archive record の記帳（change folder の archive 配置・commit・feature branch への push）が実行される
**And** `archived` への status 遷移（`markJobArchived`）は行われない
**And** コマンドは exit code 0 を返す

#### Scenario: archive record commit が feature branch に push される

**Given** slug `demo` の job が status `awaiting-archive` で、PR #42 が `OPEN` である
**When** plain `job archive demo` を実行する
**Then** archive record commit は base branch ではなく feature branch へ `git push origin <feature-branch>` される
**And** job status は `awaiting-archive` のままである

### Requirement: archive orchestrator は terminal transition を行わない

`runArchiveOrchestrator` は archive record の記帳のみを責務とし、いかなる入力に対しても `awaiting-archive → archived` の遷移を行っては**ならない**（MUST NOT）。`deferArchivedTransition` 入力が省略された場合も、`true` が渡された場合も、記帳の副作用は同一でなければならない（SHALL）。

#### Scenario: deferArchivedTransition を省略して orchestrator を呼ぶ

**Given** slug `demo` の job が status `awaiting-archive` である
**When** `deferArchivedTransition` を渡さずに `runArchiveOrchestrator` を呼ぶ
**Then** `markJobArchived` は呼ばれない
**And** change folder の archive 配置・archive commit・feature branch への push は実行される
**And** 戻り値は exit code 0 で、archive commit の headSha を含む

#### Scenario: deferArchivedTransition: true で orchestrator を呼ぶ

**Given** slug `demo` の job が status `awaiting-archive` である
**When** `deferArchivedTransition: true` を渡して `runArchiveOrchestrator` を呼ぶ
**Then** `markJobArchived` は呼ばれない
**And** 副作用は `deferArchivedTransition` を省略した場合と同一である

### Requirement: archived への terminal transition は PR merge 後にのみ行われる

plain `job archive` は、対象 PR が merge 済み（PR state = `MERGED`）であり、かつ archive record が既に記帳済み（change folder が `specrunner/changes/archive/` 配下にある）である場合に限り、`archived` への遷移と post-merge cleanup を実行しなければならない（SHALL）。PR が merge されていない間は、terminal transition も cleanup も実行しては**ならない**（MUST NOT）。

#### Scenario: out-of-band merge 後の再実行で archived + cleanup が完了する

**Given** slug `demo` の job が status `awaiting-archive` で archive record 記帳済み（change folder が archive/ 配下）である
**And** PR #42 が GitHub UI 上で既に merge され、state が `MERGED` である
**When** plain `job archive demo` を再実行する
**Then** `archived` への status 遷移が実行される
**And** post-merge cleanup（worktree 撤去・branch 削除・sidecar 削除）が実行される
**And** archive record の再記帳（archive orchestrator の実行）は行われない
**And** コマンドは exit code 0 を返す

#### Scenario: PR が未merge の間は cleanup が行われない

**Given** slug `demo` の job が status `awaiting-archive` で、PR #42 の state が `OPEN` である
**When** plain `job archive demo` を実行する
**Then** post-merge cleanup は呼ばれない
**And** feature branch と worktree は削除されない

### Requirement: merge 状態の確認は archive record の記帳より前に行われる

plain `job archive` は、archive record を記帳する前に PR の merge 状態を確認しなければならない（SHALL）。PR が既に `MERGED` の場合、記帳（commit / push）を試みては**ならない**（MUST NOT）。

#### Scenario: merge 済み PR に対して push を試みない

**Given** slug `demo` の job が archive record 記帳済みで、PR #42 の state が `MERGED` である
**When** plain `job archive demo` を実行する
**Then** archive orchestrator は呼ばれず、feature branch への push は試みられない
**And** `archived` への遷移と post-merge cleanup のみが実行される

### Requirement: archive record 前に merge された場合は escalation する

plain `job archive` は、PR が `MERGED` でありながら change folder が active 位置（`specrunner/changes/<slug>/`）に残っている場合、順序エラーとして escalation を返さなければならない（SHALL）。この場合 `archived` への遷移も post-merge cleanup も行っては**ならない**（MUST NOT）。

#### Scenario: 記帳前に merge された job

**Given** slug `demo` の job の change folder が active 位置にある（archive 未記帳）
**And** PR #42 の state が `MERGED` である
**When** plain `job archive demo` を実行する
**Then** コマンドは exit code 1 と、記帳前 merge を示す escalation を返す
**And** `archived` への遷移は行われない
**And** post-merge cleanup は行われない

### Requirement: archive record 済み状態からの再実行は冪等である

archive record が既に記帳済みで PR が未merge の状態から plain `job archive` を再実行した場合、archive commit を重複して作成しては**ならない**（MUST NOT）。change folder の移動と commit はスキップされ、コマンドは成功を返さなければならない（SHALL）。

#### Scenario: 記帳済み・未merge からの再実行

**Given** slug `demo` の job が status `awaiting-archive` で archive record 記帳済み（change folder が archive/ 配下、staged 差分なし）である
**And** PR #42 の state が `OPEN` である
**When** plain `job archive demo` を再実行する
**Then** change folder の移動はスキップされる
**And** 新しい archive commit は作成されない
**And** job status は `awaiting-archive` のままである
**And** コマンドは exit code 0 を返す

### Requirement: plain archive は CI 結果を観測せず、CI 結果によって状態を変えない

plain `job archive` は check status の問い合わせ・待機・polling を行っては**ならない**（MUST NOT）。archive record push 後に CI が failure / canceled / timeout になっても、job status は `awaiting-archive` のまま変化しないことが保証されなければならない（SHALL）。

#### Scenario: plain archive は check status を問い合わせない

**Given** slug `demo` の job が status `awaiting-archive` で、PR #42 が `OPEN` である
**When** plain `job archive demo` を実行する
**Then** check status の取得（`getCheckStatus`）は一度も呼ばれない
**And** PR の merge も試みられない

#### Scenario: archive record push 後に CI が failure でも状態は変わらない

**Given** plain `job archive demo` が成功して archive record が push され、job status が `awaiting-archive` である
**When** その archive commit に対する CI が failure に終わり、PR が未merge のままである
**And** plain `job archive demo` を再実行する
**Then** job status は `awaiting-archive` のままである
**And** post-merge cleanup は行われない

### Requirement: merge 状態を判定できない場合は awaiting-archive を維持して成功する

GitHub client を構築できない、または PR 状態の取得に失敗した場合、plain `job archive` は archive record の記帳を実行したうえで、`archived` への遷移を行わずに成功（exit code 0）を返さなければならない（SHALL）。判定不能を理由に terminal transition を行っては**ならない**（MUST NOT）。

#### Scenario: GitHub client が利用できない

**Given** slug `demo` の job が status `awaiting-archive` で PR #42 を持つ
**And** GitHub token / origin が解決できず GitHub client を構築できない
**When** plain `job archive demo` を実行する
**Then** archive record の記帳は実行される
**And** `archived` への遷移と post-merge cleanup は行われない
**And** コマンドは exit code 0 を返し、merge 未確認である旨が警告として出力される

#### Scenario: PR 状態の取得が失敗する

**Given** slug `demo` の job が status `awaiting-archive` で PR #42 を持つ
**And** `getPullRequest` が例外を投げる
**When** plain `job archive demo` を実行する
**Then** archive record の記帳は実行される
**And** `archived` への遷移と post-merge cleanup は行われない
**And** コマンドは exit code 0 を返す

### Requirement: PR を持たない job は記帳時点で archived になる

`pullRequest.number` を持たない job には待つべき merge 境界が存在しないため、plain `job archive` は archive record の記帳成功後に `archived` へ遷移させなければならない（SHALL）。この場合でも post-merge cleanup（worktree 撤去・branch 削除）を行っては**ならない**（MUST NOT）。

#### Scenario: PR を持たない job の archive

**Given** slug `demo` の job が status `awaiting-archive` で `pullRequest` を持たない
**When** plain `job archive demo` を実行する
**Then** archive record の記帳が実行される
**And** `archived` への遷移が実行される
**And** post-merge cleanup は行われない
**And** PR 状態の問い合わせは行われない

### Requirement: terminal status の job に対する plain archive は no-op である

status が既に terminal（`archived` / `canceled`）の job に対する plain `job archive` は、記帳・PR 問い合わせ・cleanup のいずれも行わず、成功（exit code 0）で終了しなければならない（SHALL）。

#### Scenario: 既に archived の job

**Given** slug `demo` の job の status が `archived` である
**When** plain `job archive demo` を実行する
**Then** archive record の記帳は行われない
**And** PR 状態の問い合わせは行われない
**And** post-merge cleanup は行われない
**And** コマンドは exit code 0 を返し、既に完了している旨を出力する

### Requirement: --with-merge の既存経路は維持される

`job archive --with-merge` は従来どおり「archive record 記帳 → CI green 待ち → PR merge → `archived` 遷移 → post-merge cleanup」の順で動作しなければならない（SHALL）。CI failure / timeout / merge 失敗の場合は `archived` へ遷移しては**ならない**（MUST NOT）。

#### Scenario: CI green を待って merge 後に archived になる

**Given** slug `demo` の job が status `awaiting-archive` で PR #42 が `OPEN` である
**And** PR の checks が success になる
**When** `job archive --with-merge demo` を実行する
**Then** archive record が記帳され、PR が squash merge される
**And** merge 成功後に `archived` への遷移が実行される
**And** post-merge cleanup が実行される

#### Scenario: CI failure では merge も遷移も行われない

**Given** slug `demo` の job が status `awaiting-archive` で PR #42 が `OPEN` である
**And** PR の checks が failure である
**When** `job archive --with-merge demo` を実行する
**Then** コマンドは exit code 1 と escalation を返す
**And** `archived` への遷移は行われない
**And** post-merge cleanup は行われない

### Requirement: plain archive は次のアクションを操作者に提示する

PR が未merge のまま archive record の記帳に成功した場合、plain `job archive` は「job が `awaiting-archive` のままであること」と「PR merge 後に同じコマンドを再実行すれば完了すること」を標準出力に提示しなければならない（SHALL）。

#### Scenario: 記帳成功時の案内出力

**Given** slug `demo` の job が status `awaiting-archive` で PR #42 が `OPEN` である
**When** plain `job archive demo` を実行する
**Then** 標準出力に archive record を push した旨が含まれる
**And** 標準出力に PR merge 後の再実行で完了する旨の案内が含まれる
