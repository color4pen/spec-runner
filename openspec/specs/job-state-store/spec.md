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

The normalized state SHALL be saved in the new format on the next `persist()` call. Backward writes (saving in legacy format) are NOT supported.

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

### Requirement: JobStateStore is the Sole Persistence Authority
All reads and writes of `JobState` SHALL go through `JobStateStore` methods (`load` / `persist` / `appendHistory` / `appendStepRun`). Direct file I/O against the state path is prohibited outside `JobStateStore`.

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
- **GIVEN** any of the following error conditions: session timeout, branch not registered, spec-review retries exhausted, config incomplete, session terminated
- **WHEN** the error is surfaced through the CLI
- **THEN** the error code string is one of `SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE`
- **AND** the error code matches the pre-refactor behavior verbatim

