# Spec: `job archive --with-merge` を check 解決まで待つ wait ループにする

## Requirements

### Requirement: --with-merge は check が terminal に達するまで待ち続ける

`job archive --with-merge <slug>` SHALL poll the PR's checks until they reach a terminal state. While any check is pending or running, the command MUST keep waiting and MUST NOT escalate. The command MUST NOT use a fixed short poll count (the previous ~12 秒 budget) as the wait limit.

#### Scenario: check が pending の間は待ち続ける

**Given** PR head commit の check に pending / running のものが含まれる
**When** `job archive --with-merge <slug>` を実行する
**Then** 即 escalation せず、poll 間隔ごとに check を読み直して待ち続ける

#### Scenario: pending が success に変わったら merge へ進む

**Given** 最初の poll では check が pending で、後続の poll ですべて success になる
**When** `job archive --with-merge <slug>` を実行する
**Then** pending の間は待機し、すべて success になった時点で squash merge を実行する

### Requirement: green / pending / failure を check run / combined status で区別する

The command SHALL determine green / pending / failure from the PR head commit's check runs and combined status, NOT from a `mergeStateStatus` `UNSTABLE` lump judgment. Pending and failure MUST be distinguished. green MUST be defined as "all existing checks are success" (neutral / skipped count as non-blocking), so it works regardless of branch protection.

#### Scenario: すべて success → merge

**Given** PR head commit の check / status がすべて success（または neutral / skipped）
**When** `job archive --with-merge <slug>` を実行する
**Then** squash merge が実行され、続けて archive が実行される

#### Scenario: いずれか failure → 待たずに escalation

**Given** PR head commit の check / status に確定 failure が一つ以上ある
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず、失敗した check を含む escalation メッセージを出力し exit code 1 で終了する

#### Scenario: いずれか pending → 待機

**Given** PR head commit の check に pending / running があり、failure は無い
**When** `job archive --with-merge <slug>` を実行する
**Then** merge も escalation もせず、待ち続ける

#### Scenario: branch protection 無し（check が存在しない）repo で merge できる

**Given** PR head commit に check run も commit status も一つも存在しない
**When** `job archive --with-merge <slug>` を実行する
**Then** 「存在する check がすべて success」を満たすものとして squash merge が実行される

### Requirement: GitHubClient に check 取得メソッドを追加する

The `GitHubClient` port SHALL expose a method that returns the aggregated check rollup for a commit ref. The adapter SHALL aggregate check runs and combined statuses and normalize GitHub's values into one of `success` / `pending` / `failure` / `none`, where `none` means no checks exist for the ref.

#### Scenario: failure と pending が混在する場合は failure が優先される

**Given** ある check が failure、別の check が pending である
**When** check rollup を取得する
**Then** rollup の state は `failure` になる

#### Scenario: check が一つも無い場合は none を返す

**Given** ref に対する check run も commit status も 0 件である
**When** check rollup を取得する
**Then** rollup の state は `none` になる

### Requirement: 待ち上限は config で設定可能で null は無制限

The merge wait timeout SHALL be configurable in `.specrunner/config.json`. A `null` value MUST mean unlimited (wait until checks resolve). An absent value MUST fall back to a finite default that is sufficiently longer than ~12 秒 to cover typical CI completion. No literal keyword such as `unlimited` SHALL be introduced; unlimited is expressed only by `null`.

#### Scenario: config が null のとき無制限に待つ

**Given** config の merge 待ち上限が `null` に設定されている
**When** check が pending のまま長時間経過する
**Then** timeout による escalation は発生せず、check が解決するまで待ち続ける

#### Scenario: config 未設定のとき有限 default で待つ

**Given** config に merge 待ち上限の設定が無い
**When** `job archive --with-merge <slug>` を実行する
**Then** ~12 秒より十分長い有限の default 上限まで待つ

### Requirement: timeout / failure / conflict は merge せず escalation する

When the configured wait limit is exceeded, the command SHALL escalate (hand-off) and MUST NOT attempt a merge. Confirmed failure and merge conflict MUST likewise escalate without merging. The previous "poll exhausted → attempt merge" fall-through MUST be removed.

#### Scenario: 待ち上限超過で escalation

**Given** check が pending のまま config の有限上限を超過する
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず、timeout の escalation メッセージを出力し exit code 1 で終了する

#### Scenario: merge conflict で escalation

**Given** PR が merge conflict 状態（DIRTY / CONFLICTING）である
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず、conflict の escalation メッセージを出力し exit code 1 で終了する

### Requirement: archive 本体は GitHubClient port に依存しない（client-closed 維持）

The archive orchestrator (`src/core/archive/orchestrator.ts`) MUST NOT depend on the `GitHubClient` port. Check reading, waiting, and merge SHALL be confined to the opt-in merge path (`src/core/archive/merge-then-archive.ts`).

#### Scenario: plain archive で GitHub API 呼び出しが発生しない

**Given** `--with-merge` を指定せずに `job archive <slug>` を実行する
**When** archive orchestrator が完了する
**Then** GitHubClient のメソッド（`getPullRequest` / `getCheckStatus` / `mergePullRequest` 等）は一度も呼ばれない
