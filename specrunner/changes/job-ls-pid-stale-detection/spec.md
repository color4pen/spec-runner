# Spec: `job ls` のプロセス死亡検出

## Requirements

### Requirement: `job ls` SHALL detect process death via pid/sidecar and mark running jobs stale

`job ls`（`runPs`）は各 `running` job について、`resume` コマンドと同一の `isStaleRunning`
判定（pid 生存確認 → liveness sidecar の pid → `updatedAt` 経過時間 fallback の 3 段）を用いて
job が生きているかを判定し、stale と判定した job の STATUS 列を `running (stale?)` と表示
SHALL する。`ls` は表示のみを行い、job の状態（status / pid）を書き換えては MUST NOT。

#### Scenario: pid のプロセスが死亡している running job

**Given** status が `running` で `pid` が記録された job があり、その pid のプロセスが存在しない
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列に `running (stale?)` が表示される

#### Scenario: pid のプロセスが生存している running job

**Given** status が `running` で `pid` が記録された job があり、その pid のプロセスが生存している
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列は素の `running` で表示され、`(stale?)` は付かない

#### Scenario: pid 不在・sidecar の pid が死亡している running job

**Given** status が `running` で `state.pid` は不在だが、liveness sidecar に死亡済み pid が記録されている
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列に `running (stale?)` が表示される

### Requirement: 経過時間 fallback は 15 分閾値を継承する

pid も sidecar も取得できない `running` job について、`job ls` は `updatedAt` からの経過時間が
`isStaleRunning` の `STALE_RUNNING_THRESHOLD_MS`（15 分）を超えた場合に stale と判定 SHALL する。
`ps.ts` 固有の 1 時間閾値は撤去 MUST される。

#### Scenario: pid / sidecar なしで 15 分を超過した running job

**Given** status が `running` で `pid` も liveness sidecar も存在せず、`updatedAt` が 15 分より前
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列に `running (stale?)` が表示される

#### Scenario: pid / sidecar なしで 15 分以内の running job

**Given** status が `running` で `pid` も liveness sidecar も存在せず、`updatedAt` が 15 分以内
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列は素の `running` で表示され、`(stale?)` は付かない

### Requirement: stale 表示は running status に限定される

`running` 以外の status の job には `(stale?)` を付与 MUST NOT。`isStaleRunning` は
非 `running` status で常に `false` を返すため、`awaiting-resume` 等は経過時間に関わらず
素の status で表示される。

#### Scenario: 古い awaiting-resume job

**Given** status が `awaiting-resume` で `updatedAt` が 24 時間前の job
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列に `(stale?)` は付かない
