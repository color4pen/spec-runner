# Spec: pr-status.ts PR ステータス確認の振る舞い

## Requirements

### Requirement: fetchPrViewWithRetry は mergeStateStatus を確認し UNKNOWN を retry する

`fetchPrViewWithRetry` SHALL `getPullRequest` で PR を取得し、`mergeStateStatus` が `UNKNOWN` 以外なら成功（`{ ok: true, data }`）を返す。`getPullRequest` が throw した場合 MUST escalation（`{ ok: false, escalation }`）を返す。`mergeStateStatus` が `UNKNOWN` の間は `UNKNOWN_RETRY_COUNT` 回まで retry し、retry 間は注入された `sleepFn` を await する。retry 中に非 UNKNOWN へ解決すれば成功を、全 retry 消尽後も UNKNOWN なら escalation を返す。ただし `state === "MERGED"` かつ `UNKNOWN` の場合は retry せず即成功を返す（bypass）。

#### Scenario: mergeStateStatus が CLEAN なら成功

**Given** `getPullRequest` が `{ state: "OPEN", mergeStateStatus: "CLEAN" }` を返す
**When** `fetchPrViewWithRetry` を呼ぶ
**Then** 戻り値は `ok: true` で `data` に取得値を含み、`sleepFn` は呼ばれない

#### Scenario: getPullRequest が throw なら escalation

**Given** `getPullRequest` が `Error` を throw する
**When** `fetchPrViewWithRetry` を呼ぶ
**Then** 戻り値は `ok: false` で、`escalation` に `getPullRequest` を含む

#### Scenario: UNKNOWN から retry して 2 回目で解決すれば成功

**Given** `getPullRequest` が 1 回目に `mergeStateStatus: "UNKNOWN"`、2 回目に `"CLEAN"` を返す
**When** `fetchPrViewWithRetry` を `sleepFn` 注入で呼ぶ
**Then** 戻り値は `ok: true` で、`sleepFn` は 1 回呼ばれ `getPullRequest` は 2 回呼ばれる

#### Scenario: UNKNOWN のまま全 retry 消尽で escalation

**Given** `getPullRequest` が常に `mergeStateStatus: "UNKNOWN"`（state は OPEN）を返す
**When** `fetchPrViewWithRetry` を `sleepFn` 注入で呼ぶ
**Then** 戻り値は `ok: false` で `escalation` に `UNKNOWN` を含み、`getPullRequest` は `UNKNOWN_RETRY_COUNT` 回呼ばれる

#### Scenario: MERGED + UNKNOWN は retry せず即成功（bypass）

**Given** `getPullRequest` が `{ state: "MERGED", mergeStateStatus: "UNKNOWN" }` を返す
**When** `fetchPrViewWithRetry` を呼ぶ
**Then** 戻り値は `ok: true` で、`sleepFn` は呼ばれず `getPullRequest` は 1 回だけ呼ばれる

### Requirement: checkMergeableForMerge は mergeable を分岐し UNKNOWN を retry する

`checkMergeableForMerge` SHALL `getPullRequest` の `mergeable` を確認し、`MERGEABLE` なら成功（`{ ok: true }`）、`CONFLICTING` なら escalation（`{ ok: false, escalation }`）を返す。`getPullRequest` が throw した場合 MUST escalation を返す。`mergeable` が `UNKNOWN` の間は `MERGEABLE_RETRY_COUNT` 回まで retry し、retry 間は注入された `sleepFn` を await する。retry 中に `MERGEABLE` へ解決すれば成功を、全 retry 消尽後も UNKNOWN なら escalation を返す。CONFLICTING の escalation は `baseBranch` を含む。

#### Scenario: mergeable が MERGEABLE なら成功

**Given** `getPullRequest` が `{ mergeable: "MERGEABLE" }` を返す
**When** `checkMergeableForMerge` を呼ぶ
**Then** 戻り値は `ok: true` で、`sleepFn` は呼ばれない

#### Scenario: mergeable が CONFLICTING なら escalation に baseBranch を含む

**Given** `getPullRequest` が `{ mergeable: "CONFLICTING" }` を返し、`baseBranch` が `"main"`
**When** `checkMergeableForMerge` を呼ぶ
**Then** 戻り値は `ok: false` で、`escalation` に `"main"` を含む

#### Scenario: UNKNOWN から retry して 2 回目で MERGEABLE なら成功

**Given** `getPullRequest` が 1 回目に `mergeable: "UNKNOWN"`、2 回目に `"MERGEABLE"` を返す
**When** `checkMergeableForMerge` を `sleepFn` 注入で呼ぶ
**Then** 戻り値は `ok: true` で、`sleepFn` は 1 回呼ばれ `getPullRequest` は 2 回呼ばれる

#### Scenario: UNKNOWN のまま全 retry 消尽で escalation

**Given** `getPullRequest` が常に `mergeable: "UNKNOWN"` を返す
**When** `checkMergeableForMerge` を `sleepFn` 注入で呼ぶ
**Then** 戻り値は `ok: false` で `escalation` に `UNKNOWN` を含み、`sleepFn` は `MERGEABLE_RETRY_COUNT - 1` 回呼ばれる

#### Scenario: getPullRequest が throw なら escalation

**Given** `getPullRequest` が `Error` を throw する
**When** `checkMergeableForMerge` を呼ぶ
**Then** 戻り値は `ok: false` で、`escalation` に `getPullRequest` を含む

### Requirement: 両関数は sleepFn 注入で wall-clock 待ちなしに retry を実行できる

`fetchPrViewWithRetry` と `checkMergeableForMerge` SHALL `sleepFn` パラメータを受け取り、retry の待機を注入された関数に委譲する。テストは no-op の `sleepFn` を注入することで、実際の待ち時間なしに retry の振る舞いを決定的に検証できる。

#### Scenario: 注入した sleepFn が実待ちを置き換える

**Given** retry を伴う分岐で no-op の `sleepFn` を注入する
**When** いずれかの関数を呼ぶ
**Then** 関数は実待ち（`setTimeout`）を発生させず、注入された `sleepFn` のみを await する
