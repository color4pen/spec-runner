# Spec: archive 成功時に managed marker / liveness sidecar を削除する

## Requirements

### Requirement: archive 成功時に managed marker を削除する

`archive` が成功した場合、対象 slug の managed marker `.specrunner/local/<slug>/marker.json` を削除 MUST する。削除は Phase 2（worktree teardown）の後に行い、`worktreePath` の有無に依存してはならない MUST（managed job は worktree 実体を持たないため）。

#### Scenario: managed job を archive 後に marker.json が削除される

**Given** `.specrunner/local/<slug>/marker.json` を持つ managed job
**When** `specrunner job archive <slug>` が成功する
**Then** `.specrunner/local/<slug>/marker.json` が削除されている

### Requirement: archive 成功時に local liveness sidecar を削除する

`archive` が成功した場合、対象 slug の local liveness sidecar `.specrunner/local/<slug>/liveness.json` を削除 MUST する。先行実装の `worktreePath: null` repoint（liveness.json への write）は行わず、削除に一本化 MUST する。

#### Scenario: local job を archive 後に liveness.json が削除される

**Given** `.specrunner/local/<slug>/liveness.json` を持つ local job
**When** `specrunner job archive <slug>` が成功する
**Then** `.specrunner/local/<slug>/liveness.json` が削除されている

#### Scenario: liveness.json への worktreePath repoint write が行われない

**Given** `worktreePath` を持つ local job を archive する
**When** archive Phase 2 が実行される
**Then** liveness.json への `worktreePath: null` の write は発生せず、liveness.json は削除される

### Requirement: sidecar 削除は best-effort で archive を失敗させない

marker.json / liveness.json の削除失敗は archive 全体を失敗させてはならない MUST。ファイル不在（ENOENT）は silent な no-op MUST とし、それ以外の削除失敗は stderr に warning を出す MUST。いずれの場合も archive の exit code と最終 status（`archived`）は不変 MUST。

#### Scenario: 削除に失敗しても archive は成功し warning が出る

**Given** archive 対象の sidecar 削除（`fs.unlink`）が ENOENT 以外の error で失敗する
**When** `specrunner job archive <slug>` を実行する
**Then** archive は成功（exit 0）し、最終 status は `archived` のまま、stderr に warning が出力される

#### Scenario: sidecar が存在しなくても archive は成功する

**Given** marker.json も liveness.json も存在しない slug を archive する
**When** `specrunner job archive <slug>` を実行する
**Then** 削除は silent な no-op になり、archive は成功（exit 0）し warning は出力されない

### Requirement: jobs-dir 不可侵と検証 green を保つ

本変更は `.specrunner/jobs/` への read/write を Phase 2 に追加してはならない MUST（先行 change の D5 不変条件を維持）。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: Phase 2 が jobs-dir に触れない

**Given** local job を archive する
**When** archive Phase 2 が実行される
**Then** `.specrunner/jobs/` への read/write は発生しない

#### Scenario: 検証が green

**Given** 本変更適用後
**When** `bun run typecheck && bun run test` を実行する
**Then** typecheck と test がいずれも green になる
