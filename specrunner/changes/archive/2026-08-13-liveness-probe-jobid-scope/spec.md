# Spec: liveness 生存判定の sidecar pid 採用に jobId 照合を追加する

## Requirements

### Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する

`isStaleRunning` の Priority 2（sidecar 経路）は、sidecar の `jobId` フィールドが評価対象 job の `jobId` と一致する場合に限り、sidecar の `pid` を生存 probe に採用しなければならない（MUST）。jobId が不一致または欠落している場合は、pid フィールドが存在しない場合と同様に stale として扱わなければならない（MUST）。

#### Scenario: jobId 一致の sidecar pid を持つプロセスが生存中

**Given** `state.status === "running"`, `state.pid` が null, sidecar に `{ pid: 1234, jobId: "job-A" }` が存在し、プロセス 1234 が生存している
**When** `isStaleRunning(state, sidecarPath)` を呼ぶ（`state.jobId === "job-A"`）
**Then** `false` を返す（stale でない）

#### Scenario: jobId 不一致の sidecar pid

**Given** `state.status === "running"`, `state.pid` が null, sidecar に `{ pid: 9999, jobId: "job-B" }` が存在する
**When** `isStaleRunning(state, sidecarPath)` を呼ぶ（`state.jobId === "job-A"`）
**Then** `true` を返す（stale）。プロセス 9999 の生死は問わない。

#### Scenario: sidecar に jobId フィールドが存在しない（legacy sidecar）

**Given** `state.status === "running"`, `state.pid` が null, sidecar に `{ pid: 9999 }` が存在する（`jobId` フィールドなし）
**When** `isStaleRunning(state, sidecarPath)` を呼ぶ
**Then** `true` を返す（stale）

### Requirement: job wait の sidecar pid 採用も jobId 照合を要求する

`job wait` poll ループが sidecar から pid を読む際、sidecar の `jobId` フィールドが現在の job の `jobId` と一致する場合に限り採用しなければならない（MUST）。jobId が不一致または欠落している場合は pid を採用せず、no-pid パスに進まなければならない（MUST）。

#### Scenario: jobId 一致の sidecar pid でプロセス生存中

**Given** job の `jobId === "job-A"`, `state.pid` が null, sidecar に `{ pid: 5678, jobId: "job-A" }` が存在し、プロセス 5678 が生存中
**When** poll ループが sidecar pid を解決する
**Then** pid 5678 を採用し、`isProcessAlive(5678)` を呼んで待機を継続する

#### Scenario: jobId 不一致の sidecar pid

**Given** job の `jobId === "job-A"`, `state.pid` が null, sidecar に `{ pid: 9999, jobId: "job-B" }` が存在する
**When** poll ループが sidecar pid を解決する
**Then** pid 9999 を採用しない（`isProcessAlive(9999)` は呼ばれない）。no-pid パスに進む。

#### Scenario: jobId フィールドなしの sidecar（legacy）

**Given** job の `jobId === "job-A"`, `state.pid` が null, sidecar に `{ pid: 9999 }` が存在する（`jobId` なし）
**When** poll ループが sidecar pid を解決する
**Then** pid 9999 を採用しない。no-pid パスに進む。

### Requirement: sidecar pid 採用判定を resolveJobPid に集約する

生存判定における sidecar pid の採用可否判断は `resolveJobPid`（`src/core/liveness/resolve-pid.ts`）の規則を経由しなければならない（MUST）。同等の判定ロジックを別箇所に並立実装してはならない（MUST NOT）。

#### Scenario: isStaleRunning が resolveJobPid を経由して jobId 照合を行う

**Given** `isStaleRunning` の Priority 2 コードパスが実行される
**When** sidecar の pid 採用可否を判定する
**Then** `resolveJobPid` を呼ぶことで jobId 照合が行われる（直接比較の並立実装はない）

#### Scenario: job wait poll ループが resolveJobPid を経由して jobId 照合を行う

**Given** poll ループの sidecar pid 解決コードパスが実行される
**When** sidecar の pid 採用可否を判定する
**Then** `resolveJobPid` を呼ぶことで jobId 照合が行われる（直接比較の並立実装はない）
