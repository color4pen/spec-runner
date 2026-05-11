## Purpose

`specrunner` CLI が管理するジョブ状態ファイルの保存先・スキーマ・書き込みアトミシティ・履歴管理・破損耐性を定義する。
## Requirements
### Requirement: ジョブ状態ファイルは固定パスに保存される

ジョブ状態ファイルは MUST `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/<jobId>.json` に保存される。`jobId` は SHALL uuid v4 形式の文字列である。

#### Scenario: XDG_DATA_HOME 未設定

- **WHEN** `XDG_DATA_HOME` が未設定で `HOME=~`
- **THEN** ファイルは `~/.local/share/specrunner/jobs/<uuid>.json` に作成される

#### Scenario: XDG_DATA_HOME 設定済み

- **WHEN** `XDG_DATA_HOME=/tmp/data`
- **THEN** ファイルは `/tmp/data/specrunner/jobs/<uuid>.json` に作成される

### Requirement: 状態ファイル書き込みは atomic に行う

状態ファイルの書き込みは MUST `<path>.tmp.<random>` に書き込んだ後 `fs.rename` で正規パスに rename する。書き込み前に親ディレクトリを SHALL `mkdir -p` で作成する。

#### Scenario: 書き込み中の SIGINT

- **WHEN** CLI が状態ファイルへの書き込み中に SIGINT で終了する
- **THEN** 正規パスのファイルは前回の完全な状態を保持し、temp file が残ることがあっても本体ファイルは破損しない

#### Scenario: 並行 ps と書き込み

- **WHEN** `specrunner run` が状態ファイルを更新中に `specrunner ps` が同じファイルを読む
- **THEN** ps は古い完全な内容か、新しい完全な内容のどちらかを読み、部分書き込みを観測しない

### Requirement: 履歴は append-only で最大 100 entry まで保持する

`history` 配列は MUST append-only で、各 entry は SHALL `{ ts: ISO8601, step: string, status: "ok"|"warning"|"error"|"started", message: string }` の形式である。entry 数が 100 を超えたら先頭から truncate する。

#### Scenario: 通常の append

- **WHEN** 既存の history が 5 entry でステップ完了が記録される
- **THEN** history が 6 entry になる

#### Scenario: 100 entry を超える

- **WHEN** 100 entry の状態で 1 件 append する
- **THEN** 先頭の 1 entry が drop され、結果として 100 entry のままになる（最新が末尾）

### Requirement: 状態ファイルの enumeration は破損に耐える

`specrunner ps` が `jobs/` を走査する際、CLI は MUST JSON パース不可な、または必須フィールド欠落のファイルは skip し、stderr に `Skipping malformed file: <path>` を出力した上で SHALL 残りのファイル処理を継続する。

#### Scenario: 1 ファイルが破損

- **WHEN** ジョブディレクトリに 3 ファイルあり、1 ファイルが JSON パース不可
- **THEN** 残り 2 ファイルが正常に表示され、stderr に skip メッセージが 1 行出力される

### Requirement: 状態ファイルの step フィールドは実行中 step を指す

`state.step` は MUST 現在実行中の step 名を保持する。propose step 実行中は `"propose"`、spec-review step 実行中は `"spec-review"`、spec-fixer step 実行中は `"spec-fixer"` である。step 完了後に runPipeline が次 step を起動する直前に SHALL `state.step` を更新する。loop body 内での spec-fixer → spec-review 切り替えにおいても同様に更新する。

#### Scenario: step 遷移（loop 内含む）

- **WHEN** iter=1 の spec-review が `needs-fix` で完了し iter=2 の spec-fixer 起動直前
- **THEN** state.step が `"spec-review"` から `"spec-fixer"` に更新され、history に `step-transition` entry が append される

### Requirement: `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` は retry 上限到達を示す

`runPipeline` の loop プリミティブが `onExceeded` 経由で書き込む `state.error` は MUST `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` の形式である。ここで `<NNN>` は 3 桁ゼロ埋めの iteration 番号（例: `001`）を示す。`state.steps["spec-review"]` の末尾要素の verdict は SHALL `escalation` に書き換えられている。

#### Scenario: retries exhausted の状態

- **WHEN** maxRetries=2 で iter=1 needs-fix → iter=2 needs-fix が起きる
- **THEN** state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` で、state.steps["spec-review"][1].verdict が `escalation` に書き換えられている。state.status は `success`（pipeline 自体は完走）

### Requirement: JobState.steps Schema is StepRun Array Per Step
`JobState.steps` SHALL be typed as `Record<StepName, StepRun[]>` where `StepRun` records a single execution attempt of a step.

`StepRun` SHALL have the following fields:

- `attempt: number` — 1-based attempt index for this step within the job
- `sessionId: string` — Managed Agents session id used for this attempt
- `outcome: StepOutcome` — parsed verdict / artifact references (existing structure)
- `startedAt: string` — ISO 8601 timestamp at session creation
- `endedAt: string` — ISO 8601 timestamp at session completion or error

#### Field Mapping: Legacy StepResult → StepRun

The following table shows how each field in the existing `job-state-store` spec (StepResult schema) maps to the new `StepRun` fields:

| Legacy field (StepResult) | New field (StepRun) | Notes |
|---------------------------|---------------------|-------|
| `iteration: number` | `attempt: number` | renamed; same 1-based semantics |
| `session: SessionInfo` | `sessionId: string` | flattened; `session.id` becomes `sessionId` |
| `verdict` | `outcome.verdict` | moved into `StepOutcome` |
| `findingsPath: string \| null` | `outcome.findingsPath?: string` | moved into `StepOutcome` |
| `error: ErrorInfo \| null` | `outcome.error?: ErrorInfo` | moved into `StepOutcome` |
| `completedAt: ISO8601 \| null` | `endedAt: string` | renamed |
| _(absent)_ | `startedAt: string` | new field; see derivation rule in Legacy B scenario |

#### Scenario: Multiple attempts append rather than overwrite
- **GIVEN** a job in which `spec-review` was executed twice with verdicts `needs-fix` then `approved`
- **WHEN** the state is persisted
- **THEN** `state.steps["spec-review"]` is an array of length 2 in chronological order
- **AND** the latest attempt is the last element

#### Scenario: StepRun captures lifecycle timestamps
- **WHEN** a step completes successfully
- **THEN** the corresponding `StepRun` has both `startedAt` and `endedAt` set as ISO 8601 strings
- **AND** `endedAt >= startedAt`

### Requirement: Backward Compatibility with Legacy Schemas
`JobStateStore.load()` SHALL accept and normalize legacy `JobState` formats from prior CLI versions:

- **Legacy A** (pre-PR #24): `JobState.steps[name]` is a single `StepResult` object → normalize to `[StepRun]` (attempt = 1)
- **Legacy B** (post-PR #24, pre-this-change): `JobState.steps[name]` is `StepResult[]` → map each element to `StepRun` (attempt = index + 1)
- **Legacy C** (pre-remove-session-timeout): `state.error.code === "SESSION_TIMEOUT"` → normalize to `SESSION_TERMINATED`. The remap SHALL be applied during `validateJobState` (load path); the change is persisted lazily on the next `persist()` call (write-back is not eagerly forced).

The normalized state SHALL be saved in the new format on the next `persist()` call. Backward writes (saving in legacy format) are NOT supported. New jobs SHALL never write `SESSION_TIMEOUT`; the value `SESSION_TIMEOUT` is removed from the set of `state.error.code` values producible by current CLI versions.

#### Scenario: Pre-PR #24 single-result format is normalized on load
- **GIVEN** a state file where `state.steps["propose"] = { sessionId: "s1", verdict: "approved", ... }`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the in-memory state has `state.steps["propose"] = [{ attempt: 1, sessionId: "s1", outcome: { verdict: "approved", ... }, startedAt, endedAt }]`

#### Scenario: Post-PR #24 array format is normalized on load
- **GIVEN** a state file where `state.steps["spec-review"] = [{ session: { id: "s1" }, verdict: "needs-fix", completedAt: "2026-01-01T00:00:00Z", ... }, { session: { id: "s2" }, verdict: "approved", completedAt: "2026-01-02T00:00:00Z", ... }]`
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** each element gains `attempt: 1` and `attempt: 2` respectively
- **AND** `sessionId` is derived from `session.id` of each element
- **AND** `outcome.verdict`, `outcome.findingsPath`, `outcome.error` are derived from the top-level fields of each element
- **AND** `endedAt` is set to `StepResult.completedAt` when present
- **AND** `startedAt` is set to `state.updatedAt` (the job-level timestamp at load time) as a best-effort fallback when no per-entry start time is available

#### Scenario: Subsequent persist writes new format only
- **GIVEN** a legacy state was loaded and normalized
- **WHEN** `JobStateStore.persist()` is called
- **THEN** the on-disk JSON uses `StepRun[]` shape with all required fields
- **AND** the legacy fields (`iteration`, `session`, `completedAt` at top level) are NOT written back

#### Scenario: Legacy SESSION_TIMEOUT is lazy-migrated to SESSION_TERMINATED on load
- **GIVEN** a state file where `state.error = { code: "SESSION_TIMEOUT", message: "Session timed out after 30m." }`
- **WHEN** `JobStateStore.load()` (delegating to `validateJobState`) is invoked
- **THEN** the in-memory `state.error.code` equals `"SESSION_TERMINATED"`
- **AND** no warning or error is surfaced to the user
- **AND** the on-disk file is unchanged until the next `persist()` call

#### Scenario: Persisted state after lazy migration drops SESSION_TIMEOUT
- **GIVEN** a legacy state with `error.code === "SESSION_TIMEOUT"` was loaded and normalized in memory
- **WHEN** any subsequent `JobStateStore.persist()` is invoked (resume / status touch / cancel)
- **THEN** the on-disk JSON has `error.code === "SESSION_TERMINATED"`
- **AND** the string `SESSION_TIMEOUT` no longer appears in the file

### Requirement: JobStateStore is the Sole Persistence Authority
All reads and writes of `JobState` SHALL go through `JobStateStore` methods (`load` / `persist` / `appendHistory` / `appendStepRun`). Direct file I/O against the state path is prohibited outside `JobStateStore`.

`JobStateStore` SHALL be invoked exclusively by `StepExecutor` for step-level state persistence. `AgentRunner` adapters (including `ManagedAgentRunner` and `ClaudeCodeRunner`) SHALL NOT import, instantiate, or call any method of `JobStateStore`. This eliminates the dual state-management paths where both the adapter and the executor independently persisted state.

The `_updatedState` internal extension (previously used by `ManagedAgentRunner` to return full `JobState` piggy-backed on `AgentRunResult`) SHALL NOT exist. `AgentRunResult` SHALL contain only the fields defined in its interface (`completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`).

**Canonical `state.error.code` values** — This is the normative definition of `state.error.code`; all other specs (e.g. `propose-pipeline`) reference this list as the single source of truth:

| Code | Meaning |
|------|---------|
| `SESSION_TERMINATED` | Session was forcibly terminated (Anthropic-side or user cancel). Terminal, not resumable. |
| `BRANCH_NOT_REGISTERED` | idle+end_turn detected without `register_branch` tool call. |
| `SPEC_REVIEW_RETRIES_EXHAUSTED` | `maxIterations` reached in spec-review / code-review loop. |
| `CONFIG_INCOMPLETE` | Required config fields missing at startup. |

`SESSION_TIMEOUT` is NOT a valid value for new jobs. Legacy state files containing `SESSION_TIMEOUT` are lazy-migrated to `SESSION_TERMINATED` on load (see Backward Compatibility Requirement above).

This MODIFIED Requirement replaces the following Requirements from the existing `job-state-store` spec:
- `Requirement: 状態ファイルは固定スキーマに従う` — schema shape is superseded by StepRun[] above
- `Requirement: getLatestStepResult は最新 iteration の StepResult を返す` — replaced by `JobStateStore.appendStepRun` / `getLatestStepRun` returning `StepRun`
- `Requirement: StepResult への push は iteration 番号を自動採番する` — replaced by `appendStepRun` which auto-increments `attempt`

All other Requirements in `job-state-store` spec (file path, atomic writes, history append-only, enumeration resilience, `state.step` current-step field, `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` format) remain unchanged.

#### Scenario: appendStepRun is atomic with respect to readers
- **WHEN** `JobStateStore.appendStepRun(state, stepName, stepRun)` is called
- **THEN** the on-disk file is updated atomically (write-and-rename)
- **AND** a concurrent reader observes either the pre-call state or the post-call state, never a partial write

#### Scenario: Error codes preserved across schema migration
- **GIVEN** any of the following error conditions: branch not registered, spec-review retries exhausted, config incomplete, session terminated
- **WHEN** the error is surfaced through the CLI
- **THEN** the error code string is one of `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`
- **AND** the error code matches the pre-refactor behavior verbatim
- **AND** `SESSION_TIMEOUT` is NOT a valid value (legacy state files containing it are lazy-migrated to `SESSION_TERMINATED` on load — see the Backward Compatibility Requirement)

#### Scenario: ManagedAgentRunner does not use JobStateStore
- **WHEN** `src/adapter/managed-agent/agent-runner.ts` is inspected
- **THEN** it does NOT import `JobStateStore`
- **AND** it does NOT import `pushStepResult`
- **AND** it does NOT call `store.update`, `store.appendHistory`, `store.fail`, or `store.persist`

#### Scenario: _updatedState does not exist in codebase
- **WHEN** `grep -r "_updatedState" src/` is executed
- **THEN** zero matches are returned

### Requirement: JobState.pullRequest holds the GitHub PR reference after pr-create

`JobState` SHALL include an optional `pullRequest` field with the shape:

```ts
pullRequest?: {
  url: string;        // full GitHub PR URL (e.g. https://github.com/owner/repo/pull/42)
  number: number;     // PR number (positive integer)
  createdAt: string;  // ISO 8601 timestamp at PR creation or detection
};
```

The field SHALL be set by `PrCreateStep.run` via `JobStateStore` (no direct file I/O) when the runner returns either `status: "created"` or `status: "existing-open"`. When the runner returns `status: "error"`, `pullRequest` SHALL remain at its prior value (undefined for the first attempt).

`pullRequest` SHALL be persisted by `JobStateStore.persist()` alongside the existing fields. Legacy state files lacking the field SHALL load successfully with `pullRequest === undefined`.

`specrunner ps` MAY consult `state.pullRequest.url` for display purposes, but the display layer is out of scope for this requirement (covered separately).

#### Scenario: PR creation persists url, number, createdAt

- **GIVEN** `PrCreateStep.run` invokes the runner and the runner returns `{ status: "created", url: "https://github.com/owner/repo/pull/42", number: 42 }`
- **WHEN** `run` finishes
- **THEN** `state.pullRequest.url === "https://github.com/owner/repo/pull/42"`
- **AND** `state.pullRequest.number === 42`
- **AND** `state.pullRequest.createdAt` is an ISO 8601 timestamp

#### Scenario: Existing OPEN PR detection persists pullRequest

- **GIVEN** `PrCreateStep.run` invokes the runner and the runner returns `{ status: "existing-open", url: "<u>", number: 12 }`
- **WHEN** `run` finishes
- **THEN** `state.pullRequest` is set as if the PR had been newly created
- **AND** subsequent `JobStateStore.load()` reads back the same `pullRequest` object

#### Scenario: PR creation failure does not modify pullRequest

- **GIVEN** `state.pullRequest` is undefined and `PrCreateStep.run` is invoked
- **WHEN** the runner returns `{ status: "error", reason: "gh-failure" }`
- **THEN** `state.pullRequest` is still undefined after `run` returns

#### Scenario: Legacy state files load with pullRequest undefined

- **GIVEN** a state file written by a prior CLI version that lacks the `pullRequest` field
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `pullRequest === undefined`
- **AND** no error is thrown

### Requirement: JobStateStore.appendStepRun supports pr-create step name

`JobStateStore.appendStepRun` SHALL accept `"pr-create"` as a valid `StepName`. The `state.steps["pr-create"]` array SHALL store `StepRun[]` for pr-create attempts in the same shape as other steps.

Because pr-create is a single-shot step (no retry loop), the array typically contains exactly one element on success and one element on failure. The cardinality is not enforced by `JobStateStore` itself; enforcement is the pipeline's responsibility (no `pr-create ↔ fixer` transition exists).

#### Scenario: appendStepRun records pr-create attempts

- **GIVEN** an empty `state.steps["pr-create"]`
- **WHEN** `JobStateStore.appendStepRun(state, "pr-create", { attempt: 1, sessionId: "(none)", outcome: { verdict: "success", ... }, startedAt, endedAt })` is invoked
- **THEN** `state.steps["pr-create"]` is `[{ attempt: 1, ... }]`
- **AND** the on-disk file is updated atomically

### Requirement: `RequestInfo.slug` field stores the canonical change slug

`JobState.request: RequestInfo` SHALL include a `slug: string | null` field that stores the canonical change slug. The field is populated by `specrunner run` at job startup from `path.basename(<request-path>)` where `<request-path>` is the directory containing `request.md` (typically `specrunner/requests/active/<slug>/`).

The schema:

```ts
export interface RequestInfo {
  path: string;
  title: string;
  type: string;
  slug: string | null;  // null only for legacy state files migrated on load
}
```

The `slug` field is the **canonical source** for slug consumers (`specrunner finish`, `specrunner ps`, archive operations). Consumers SHALL NOT compute slug from `request.path` basename or `state.branch` directly; they SHALL go through `getJobSlug(state)` helper.

When `specrunner run` is invoked with a `request.md` path that resolves to a directory matching the canonical layout (`<repo>/specrunner/requests/active/<slug>/request.md` or worktree-relative variant), `slug` SHALL be set to the parent directory name. When the path is non-canonical (e.g., `/tmp/dogfooding-001-request.md` or a flat file), `slug` SHALL be set to `null` and the `getJobSlug` fallback chain takes over.

#### Canonical Pattern

The CANONICAL_PATTERN regex used in `src/cli/run.ts` SHALL be:

```typescript
const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/;
```

This pattern matches paths of the form:
- `<any-prefix>/specrunner/requests/active/<slug>/<filename>.md`

The pattern does NOT include alternation for other directories (e.g., `awaiting-merge`). Only the `active/` directory is a valid invocation point for `specrunner run`.

#### Scenario: Canonical request path populates slug

- **GIVEN** `specrunner run specrunner/requests/active/readme-status-section/request.md` is invoked
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === "readme-status-section"` and is persisted on the first save

#### Scenario: Non-canonical request path leaves slug null

- **GIVEN** `specrunner run /tmp/dogfooding-001-request.md` is invoked (legacy / ad-hoc invocation)
- **WHEN** the job state is initialized
- **THEN** `state.request.slug === null` and `getJobSlug` falls back to other sources

Note: The previous requirement referenced `openspec-workflow/requests/active/<slug>/` and allowed `awaiting-merge/` paths. This delta spec updates the canonical layout to `specrunner/requests/active/<slug>/` only.

### Requirement: `getJobSlug(state)` helper resolves slug via fallback chain

`getJobSlug(state: JobState): string` is a pure helper exported from the state module. It SHALL resolve slug via the following ordered fallback:

1. If `state.request.slug` is a non-empty string, return it.
2. Else if `state.branch` is set, strip the conventional prefix (`feat/`, `fix/`, `change/`, `refactor/`, `chore/`) and if the remainder is non-empty, return it.
3. Else, return `path.basename(state.request.path)` with any trailing `.md` extension stripped.

The helper SHALL NOT throw; if all sources are absent (extremely degenerate state), it SHALL return an empty string and the caller is expected to error out via Phase 0 pre-flight in `specrunner finish` (slug 解決不可で escalation)。

All slug consumers (`specrunner finish` の入力解決 / `specrunner ps` の SLUG 列 / archive 操作の slug 引数 / `register_branch` custom tool handler) SHALL use this helper. Direct access to `state.request.slug` or ad-hoc derivation from `state.branch` / `request.path` SHALL be avoided.

#### Scenario: Primary source (slug field present)

- **GIVEN** `state.request.slug === "readme-status-section"` and `state.branch === "feat/readme-status-section"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `"readme-status-section"` from the slug field

#### Scenario: Branch fallback when slug is null

- **GIVEN** `state.request.slug === null` and `state.branch === "feat/readme-status-section"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it strips the `feat/` prefix and returns `"readme-status-section"`

#### Scenario: request.path basename fallback

- **GIVEN** `state.request.slug === null`, `state.branch === ""`, `state.request.path === "/tmp/dogfooding-001-request.md"`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `"dogfooding-001-request"` (basename with `.md` stripped)

#### Scenario: All sources absent returns empty string

- **GIVEN** `state.request.slug === null`, `state.branch === ""`, `state.request.path === ""`
- **WHEN** `getJobSlug(state)` is called
- **THEN** it returns `""` (Phase 0 of `specrunner finish` will escalate on this empty slug)

### Requirement: `JobStatus` includes `archived` as a terminal status

`JobStatus` SHALL be typed as `"running" | "success" | "failed" | "terminated" | "archived"`. The `archived` status indicates that `specrunner finish` has completed Phase 4 (markJobArchived after `git pull --ff-only`) for this job. No intermediate `merged` status is introduced; the 1-PR model means feature PR merge and archive land in the same commit, so `success → archived` is the canonical transition.

Legacy state files with `status: "success"` SHALL load successfully; transition to `archived` happens only via `specrunner finish` Phase 4.

#### Scenario: New status value `archived` persists across load/save

- **WHEN** `state.status` is set to `archived` and `JobStateStore.persist()` is called, then `JobStateStore.load()` reads the same file
- **THEN** the loaded state has `state.status === "archived"`

#### Scenario: Legacy `success` state loads without migration

- **GIVEN** a state file with `status: "success"` written by a prior CLI version
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `state.status === "success"` (no automatic migration to `archived`)

#### Scenario: No intermediate `merged` status

- **WHEN** `specrunner finish` Phase 3 (`gh pr merge`) succeeds but Phase 4 (markJobArchived) has not yet executed
- **THEN** `state.status` remains `success`. After Phase 4 completes, it transitions directly to `archived`. There is no observable `merged` intermediate value.

