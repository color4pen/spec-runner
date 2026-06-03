# Spec: finish-respect-branch-protection

## Requirements

### Requirement: finish SHALL detect mergeStateStatus BLOCKED and UNSTABLE before merge

finish の Phase 2 post-push polling で `mergeStateStatus` が BLOCKED または UNSTABLE の場合、Phase 3 の merge API 呼び出しに進まず escalation SHALL する。

#### Scenario: mergeStateStatus is BLOCKED

**Given** feature PR の `mergeStateStatus` が BLOCKED（required check / required review 未充足）
**When** finish が Phase 2 post-push polling を完了する
**Then** Phase 3 merge を試みず escalation が返される
**And** escalation メッセージに "branch protection" と再実行コマンドが含まれる

#### Scenario: mergeStateStatus is UNSTABLE

**Given** feature PR の `mergeStateStatus` が UNSTABLE（required check 失敗）
**When** finish が Phase 2 post-push polling を完了する
**Then** Phase 3 merge を試みず escalation が返される
**And** escalation メッセージに "branch protection" と再実行コマンドが含まれる

#### Scenario: mergeStateStatus is CLEAN

**Given** feature PR の `mergeStateStatus` が CLEAN
**When** finish が Phase 2 post-push polling を完了する
**Then** Phase 3 merge に進む（既存挙動の regression なし）

### Requirement: merge API reject SHALL produce actionable branch-protection hint

branch protection 由来で merge API が reject（`merged: false`）した場合、escalation メッセージに「branch protection を満たしてから再実行」という actionable hint を含める SHALL。

#### Scenario: merge API returns merged:false

**Given** `mergePullRequest` が `{ merged: false, message: "..." }` を返す
**When** finish の Phase 3 が merge 結果を処理する
**Then** escalation の recommendedAction に "branch protection" を含む hint が出力される

### Requirement: isMergeTransientFailure SHALL distinguish pending from failed status checks

`isMergeTransientFailure` は "required status check" メッセージを pending（retry 対象）と failed（escalation 対象）に分離 SHALL する。

#### Scenario: required status check is expected (pending)

**Given** merge API が 405 で `"Required status check \"ci/build\" is expected"` を返す
**When** `isMergeTransientFailure` が判定する
**Then** transient（retry 対象）と判定される

#### Scenario: required status check has failed

**Given** merge API が 405 で `"Required status check \"ci/build\" has failed"` を返す
**When** `isMergeTransientFailure` が判定する
**Then** permanent（retry しない）と判定される

#### Scenario: unknown required status check pattern

**Given** merge API が 405 で "required status check" を含むが "is expected" も "has failed" も含まないメッセージを返す
**When** `isMergeTransientFailure` が判定する
**Then** permanent（retry しない）と判定される（安全側に倒す）

### Requirement: admin bypass intent SHALL be removed from codebase

admin 権限を前提とするコメントおよび設計意図がコードベースから解消される MUST。

#### Scenario: no admin bypass comments remain

**Given** この変更の実装が完了した状態
**When** `src/core/finish/orchestrator.ts` と `src/adapter/github/github-client.ts` を検索する
**Then** "admin bypass" "admin token" を意図するコメントが存在しない

### Requirement: merge gate design premise SHALL be documented

merge gate はプロジェクトの branch protection で構成する設計前提が文書化される MUST。

#### Scenario: rules.md contains merge gate premise

**Given** `specrunner/changes/<slug>/rules.md` テンプレート
**When** agent がルールファイルを参照する
**Then** merge gate 設計前提（branch protection で構成、admin bypass しない）が記載されている

### Requirement: already-merged path SHALL archive change folder before marking archived

既マージ経路（`prAlreadyMerged`）で change folder が存在する場合、archive 移動が完了してから `markJobArchived` を呼ぶ MUST。

#### Scenario: PR already merged, change folder exists

**Given** feature PR が既に MERGED で、`specrunner/changes/<slug>/` が存在する
**When** finish を実行する
**Then** change folder が `specrunner/changes/archive/` に移動されてから `markJobArchived` が呼ばれる

#### Scenario: PR already merged, change folder does not exist

**Given** feature PR が既に MERGED で、`specrunner/changes/<slug>/` が存在しない
**When** finish を実行する
**Then** archive 移動を skip し、正常に `markJobArchived` が呼ばれる

#### Scenario: PR already merged, archive fails

**Given** feature PR が既に MERGED で、change folder の archive 移動が失敗する
**When** finish を実行する
**Then** `markJobArchived` は呼ばれず escalation が返される
