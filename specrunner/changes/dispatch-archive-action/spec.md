# Spec: dispatch archive action と PR head 経由の archive 経路

## Requirements

### Requirement: dispatch workflow は archive action を提供する

`.github/workflows/specrunner-dispatch.yml` の `workflow_dispatch` は `action` input に `archive` を選択肢として提供し、選択時は `specrunner job archive --from-issue "$ISSUE"` **のみ** を実行しなければならない（MUST）。archive 分岐は `--with-merge` を渡してはならず（MUST NOT）、merge 可否・CI 状態・record 有無の判定を workflow 側で行ってはならない（MUST NOT）。`start` / `resume` の分岐は変更してはならない（MUST NOT）。

#### Scenario: archive を選んで dispatch する

**Given** issue #N に completed marker が付いており、対応する PR が merge 済みである
**When** dispatch workflow を `action=archive`, `issue=N` で実行する
**Then** "Run pipeline" step は `bun ./bin/specrunner.ts job archive --from-issue "N"` を実行し、`--with-merge` を含まない

#### Scenario: start / resume の挙動は変わらない

**Given** dispatch workflow が `archive` choice を持つ
**When** `action=start` または `action=resume` で実行する
**Then** それぞれ従来と同じ `job start --from-issue` / `job resume --from-issue`（`--from` / `--prompt` / `--force` の受け渡しを含む）が実行される

### Requirement: locator は head branch 削除時に pull ref へ fallback する

`resolveArchiveBranchFromIssue` は、候補 PR の `git fetch origin <headRefName>` が失敗した場合、その PR を skip する前に `git fetch origin refs/pull/<prNumber>/head` を試みなければならない（MUST）。fallback が成功した場合は `FETCH_HEAD` から確定した commit OID を用い、head branch 経路と同一の 4 点 identity 検証（`state.jobId` / `state.issueNumber` / `state.branch === headRefName` / `state.pullRequest.number === PR.number`）を適用しなければならない（MUST）。identity 検証の項目・比較対象を fallback 経路で緩めてはならない（MUST NOT）。

#### Scenario: head branch 削除済み PR を pull ref で特定する

**Given** issue #N の closing PR #P の head branch が merge 時に削除されている
**And** PR head tree に active な change folder の state.json が存在し 4 点 identity が一致する
**When** `job archive --from-issue N` を local state 無しの環境で実行する
**Then** locator は `refs/pull/P/head` を fetch して候補を確定し、その branch / slug / checkpointOid を返す

#### Scenario: fallback 経路でも identity 不一致は skip される

**Given** issue #N の closing PR #P の head branch が削除されている
**And** `refs/pull/P/head` は fetch できるが、state.json の jobId が completed marker の jobId と一致しない
**When** `job archive --from-issue N` を実行する
**Then** PR #P は warning とともに skip され、他に確定候補が無ければ `ARCHIVE_FROM_ISSUE_UNCONFIRMED` で終了する

#### Scenario: head branch が生きている場合は fallback を使わない

**Given** issue #N の closing PR #P の head branch が remote に存在する
**When** `job archive --from-issue N` を実行する
**Then** `git fetch origin <headRefName>` が成功し、`refs/pull/P/head` の fetch は実行されない

### Requirement: attach 検証は検証済み OID を受け取れる

`runAttachVerification` は任意入力 `checkpointOid` を受け取り、指定された場合は `git fetch` と `git rev-parse` を実行せず、その OID から checkpoint を読み込んで `verifyCheckpoint` のみを実行しなければならない（MUST）。`checkpointOid` が未指定の場合は現行どおり branch を fetch して OID を解決しなければならない（MUST）。`job resume --from-issue` および `job attach --branch` の呼び出しは `checkpointOid` を渡してはならない（MUST NOT）。

#### Scenario: archive 経路は locator の OID をそのまま検証する

**Given** locator が PR head の commit OID を identity 検証済みで返した
**When** `runArchiveFromIssue` が `runAttachVerification` を呼ぶ
**Then** `checkpointOid` が渡され、`git fetch` は実行されず、checkpoint はその OID から読まれる

#### Scenario: 削除済み branch でも attach 検証が通る

**Given** locator が `refs/pull/P/head` fallback で OID を確定し、head branch は remote に存在しない
**When** `runArchiveFromIssue` が attach 検証へ進む
**Then** `ATTACH_FETCH_FAILED` は発生せず、`awaiting-archive` policy による検証が実行される

#### Scenario: resume / attach の既存経路は現行動作を保つ

**Given** `job resume --from-issue` または `job attach --branch` を実行する
**When** attach 検証が走る
**Then** 従来どおり `git fetch origin <branch>` と `git rev-parse origin/<branch>^{commit}` が実行される

### Requirement: merge 後の archive は completeAfterMerge に到達し exit 0 で終わる

archive record 済みの job について、PR が MERGED であり base branch の checkout に archive record が存在する場合、`job archive --from-issue <n>` は `completeAfterMerge`（`markJobArchived` + `runPostMergeCleanup`）を実行し exit 0 を返さなければならない（MUST）。この完了のために新しい status / marker / main への commit を導入してはならない（MUST NOT）。local state（sidecar index / active change folder）が存在しない環境でも同じ結果にならなければならない（MUST）。

#### Scenario: ephemeral runner で merge 後 archive が完了する

**Given** local state を持たない checkout に merge 済みの archive record（`specrunner/changes/archive/<date>-<slug>/state.json`, status `awaiting-archive`）がある
**And** PR #P は MERGED で head branch は削除済み
**When** `job archive --from-issue N` を実行する
**Then** `completeAfterMerge` が実行され、job は `archived` になり exit 0 で終了する
**And** 新しい archive record commit は push されない

#### Scenario: cleanup の空振りは失敗にしない

**Given** merge 済み archive record の `worktreePath` が現在のマシンに存在しない
**And** remote の head branch は既に削除されている
**When** merge 後 archive を実行する
**Then** post-merge cleanup の warning が出ても exit 0 を維持する

#### Scenario: record 前に merge された場合は escalation のまま

**Given** PR #P は MERGED だが archive record が存在しない
**When** `job archive --from-issue N` を実行する
**Then** 順序エラーの escalation が出力され、exit 0 にはならない

### Requirement: 既存の archive 契約を変更しない

本変更は `--with-merge` 経路の挙動、および archive record 後に `awaiting-archive` へ留まる状態機械を変更してはならない（MUST NOT）。`resolveCheckpointSlug` が `archive` / `canceled` を active checkpoint 候補から除外する規則も変更してはならない（MUST NOT）。

#### Scenario: PR が open のうちは awaiting-archive に留まる

**Given** PR #P が OPEN である
**When** `job archive <slug>` を実行する
**Then** archive record が feature branch に push され、job は `awaiting-archive` のまま exit 0 で終了する

#### Scenario: --with-merge の挙動は不変

**Given** `job archive <slug> --with-merge` を実行する
**When** merge → archive の一連の処理が走る
**Then** 従来と同一の順序・出力・終了コードになる
