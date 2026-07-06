# Spec: job ls を運用一覧にする

This spec defines the observable behavior of `specrunner job ls` (`runPs`) after this
change. It replaces the flat single-table output with a category-grouped operations
view, surfaces the escalation source and the next command per row, and adds a
`--json` machine-readable output. Persistent schema (`state.json`) and the
`JobStatus` union are unchanged; every derived field (category, escalation source,
next action, staleness) is computed at display time only.

## Requirements

### Requirement: job ls SHALL group jobs into fixed operational categories

`job ls` SHALL partition the jobs selected by the active filter into a fixed,
ordered set of operational categories and render each non-empty category as its own
labelled section. Empty categories SHALL NOT be rendered. Every `JobStatus` value
MUST map to exactly one category (total function), so no selected job is ever
dropped from the output.

The categories, their order, and their member statuses are:

| # | Category id        | Label (human)          | Member statuses          |
|---|--------------------|------------------------|--------------------------|
| 1 | `running`          | 実行中                 | `running`                |
| 2 | `awaiting-response`| 対応待ち               | `awaiting-resume`        |
| 3 | `awaiting-archive` | merge・archive 待ち    | `awaiting-archive`       |
| 4 | `failed`           | 失敗・停止             | `failed`, `terminated`   |
| 5 | `terminal`         | 終了済み               | `archived`, `canceled`   |

Within a category, jobs SHALL be ordered by `createdAt` descending (newest first),
matching the pre-change sort.

#### Scenario: mixed jobs are grouped under their category labels

**Given** the store contains one `running`, one `awaiting-resume`, one
`awaiting-archive`, and one `failed` job
**When** `job ls` runs with no flags
**Then** the output contains the section labels 実行中 / 対応待ち / merge・archive 待ち / 失敗・停止 in that order
**And** each job appears under exactly one section

#### Scenario: empty categories are omitted

**Given** the store contains only `running` jobs
**When** `job ls` runs with no flags
**Then** the output contains the 実行中 section
**And** the output does NOT contain the 対応待ち / merge・archive 待ち / 失敗・停止 / 終了済み labels

#### Scenario: no jobs after filtering

**Given** the filter selects zero jobs
**When** `job ls` runs
**Then** the output is `No jobs found.` and the exit code is 0

### Requirement: awaiting-resume rows SHALL show the escalation source step

For a job in the 対応待ち (`awaiting-resume`) category, the row SHALL display the
name of the step that produced the escalation, derived as the step name of the most
recent `StepRun` whose `outcome.verdict === "escalation"` (most recent = greatest
`endedAt`, falling back to `startedAt`). When no such run exists (e.g. the job halted
on a poll timeout), the row SHALL omit the escalation-source annotation. The
escalation reason body is out of scope — the row directs the operator to `job show`.

#### Scenario: escalation-origin awaiting-resume shows the source step

**Given** an `awaiting-resume` job whose `steps["code-review"]` last run has
`outcome.verdict === "escalation"`
**When** `job ls` runs
**Then** the job's row shows the escalation source `code-review`

#### Scenario: non-escalation awaiting-resume shows no source step

**Given** an `awaiting-resume` job with no `StepRun` having
`outcome.verdict === "escalation"`
**When** `job ls` runs
**Then** the job's row shows no escalation-source annotation

### Requirement: each row SHALL show the deterministic next action

Every row SHALL display the recommended next command, uniquely determined by the
job's display state. A merge is never suggested implicitly; only an already-merged PR
yields an archive suggestion. The mapping is:

| Display state                                | Next action              |
|----------------------------------------------|--------------------------|
| `running`, live (not stale)                  | (none)                   |
| `running`, stale                             | `job resume <slug>`      |
| `awaiting-resume`                            | `job resume <slug>`      |
| `awaiting-archive`, PR merged                | `job archive <slug>`     |
| `awaiting-archive`, PR not merged / unknown  | (none)                   |
| `failed`                                     | `job resume <slug>`      |
| `terminated`                                 | `job resume <slug>`      |
| `archived`                                   | (none)                   |
| `canceled`                                   | (none)                   |

`<slug>` MUST be the job's canonical slug as returned by `getJobSlug`.

#### Scenario: awaiting-resume next action is resume

**Given** an `awaiting-resume` job with slug `my-feature`
**When** `job ls` runs
**Then** the job's row shows next action `job resume my-feature`

#### Scenario: stale running next action is resume

**Given** a `running` job detected as stale by `isStaleRunning`
**When** `job ls` runs
**Then** the job's row is marked stale and shows next action `job resume <slug>`

#### Scenario: merged awaiting-archive next action is archive

**Given** an `awaiting-archive` job whose linked PR is merged
**When** `job ls` runs
**Then** the job's row shows the PR-merged note and next action `job archive <slug>`

#### Scenario: live running has no next action

**Given** a `running` job whose runner process is alive
**When** `job ls` runs
**Then** the job's row shows no next-action command

### Requirement: job ls --json SHALL emit a stable grouped machine-readable output

`job ls --json` SHALL print a single JSON document to stdout describing the same
grouped view. The document's top-level key set SHALL be exactly `{ "categories" }`.
`categories` SHALL contain only non-empty categories, in the fixed order above; each
category entry SHALL carry its `category` id, `label`, and a `jobs` array. Each job
entry SHALL include at least `jobId`, `slug`, `status`, `escalationStep`
(string or null), and `nextAction` (string or null). `--json` SHALL suppress the
human table and SHALL apply the same filter as the human view.

#### Scenario: json top-level keys are fixed

**Given** any set of jobs
**When** `job ls --json` runs
**Then** stdout parses as JSON whose top-level keys are exactly `["categories"]`

#### Scenario: json job entry carries state, escalation source, and next action

**Given** an escalation-origin `awaiting-resume` job
**When** `job ls --json` runs
**Then** the job's JSON entry has `status: "awaiting-resume"`, a non-null
`escalationStep`, and `nextAction: "job resume <slug>"`

### Requirement: the --active / --all / --status filter semantics SHALL be preserved

The selection semantics of `--active`, `--all`, `--status`, and the default (no flag)
mode SHALL remain identical to the pre-change behavior — only the rendering of the
selected set changes. Specifically: `--status <value>` selects exactly the jobs with
that status and overrides `--active`/`--all`; `--active` selects `ACTIVE_STATUSES`
(`running`, `awaiting-resume`); `--all` includes archived/terminal jobs; the default
excludes terminal jobs.

#### Scenario: --active selects the active status set

**Given** `running`, `awaiting-resume`, `awaiting-archive`, and `archived` jobs
**When** `job ls --active` runs
**Then** only the `running` and `awaiting-resume` jobs appear
**And** the `awaiting-archive` and `archived` jobs do not appear

#### Scenario: --all includes archived jobs

**Given** a `running` job and an `archived` job
**When** `job ls --all` runs
**Then** both jobs appear (the archived job under the 終了済み section)

#### Scenario: --status overrides --active and --all

**Given** `running`, `archived`, and `awaiting-archive` jobs
**When** `job ls --status running --all` runs
**Then** only the `running` job appears
