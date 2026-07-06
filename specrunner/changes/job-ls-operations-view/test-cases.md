# Test Cases: job ls を運用一覧にする

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 34
- **Manual**: 0
- **Priority**: must: 22, should: 10, could: 2

---

### TC-001: mixed jobs are grouped under their category labels

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job ls SHALL group jobs into fixed operational categories > Scenario: mixed jobs are grouped under their category labels

---

### TC-002: empty categories are omitted

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: job ls SHALL group jobs into fixed operational categories > Scenario: empty categories are omitted

---

### TC-003: no jobs after filtering outputs "No jobs found." with exit code 0

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job ls SHALL group jobs into fixed operational categories > Scenario: no jobs after filtering

---

### TC-004: escalation-origin awaiting-resume shows the source step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-resume rows SHALL show the escalation source step > Scenario: escalation-origin awaiting-resume shows the source step

---

### TC-005: non-escalation awaiting-resume shows no source step

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: awaiting-resume rows SHALL show the escalation source step > Scenario: non-escalation awaiting-resume shows no source step

---

### TC-006: awaiting-resume next action is resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: each row SHALL show the deterministic next action > Scenario: awaiting-resume next action is resume

---

### TC-007: stale running next action is resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: each row SHALL show the deterministic next action > Scenario: stale running next action is resume

---

### TC-008: merged awaiting-archive next action is archive

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: each row SHALL show the deterministic next action > Scenario: merged awaiting-archive next action is archive

---

### TC-009: live running has no next action

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: each row SHALL show the deterministic next action > Scenario: live running has no next action

---

### TC-010: json top-level keys are fixed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job ls --json SHALL emit a stable grouped machine-readable output > Scenario: json top-level keys are fixed

---

### TC-011: json job entry carries state, escalation source, and next action

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job ls --json SHALL emit a stable grouped machine-readable output > Scenario: json job entry carries state, escalation source, and next action

---

### TC-012: --active selects the active status set

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the --active / --all / --status filter semantics SHALL be preserved > Scenario: --active selects the active status set

---

### TC-013: --all includes archived jobs

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the --active / --all / --status filter semantics SHALL be preserved > Scenario: --all includes archived jobs

---

### TC-014: --status overrides --active and --all

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: the --active / --all / --status filter semantics SHALL be preserved > Scenario: --status overrides --active and --all

---

### TC-015: categorizeStatus maps all 7 JobStatus values without error

**Category**: unit
**Priority**: must
**Source**: design.md > D2: 区分は status → 区分の全域写像 / tasks.md > T-01

**GIVEN** a `JobStatus` value for each of the 7 variants: `running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`, `archived`, `canceled`
**WHEN** `categorizeStatus` is called for each value
**THEN** each value returns a non-null `JobCategoryId` with no throws, and the mapping is: `running`→`running`, `awaiting-resume`→`awaiting-response`, `awaiting-archive`→`awaiting-archive`, `failed`→`failed`, `terminated`→`failed`, `archived`→`terminal`, `canceled`→`terminal`

---

### TC-016: deriveEscalationSourceStep picks the step with the greatest endedAt when multiple escalations exist

**Category**: unit
**Priority**: should
**Source**: design.md > D3: escalation 発生元は steps 走査で「最も新しい escalation run の step 名」 / tasks.md > T-01

**GIVEN** a `JobState` with two step runs that both have `outcome.verdict === "escalation"`, one with `endedAt: "2025-01-01T10:00:00Z"` (step `"analyze"`) and one with `endedAt: "2025-01-01T11:00:00Z"` (step `"code-review"`)
**WHEN** `deriveEscalationSourceStep` is called with that state
**THEN** the result is `"code-review"` (the step with the later `endedAt`)

---

### TC-017: deriveEscalationSourceStep falls back to startedAt when endedAt is absent

**Category**: unit
**Priority**: should
**Source**: design.md > D3: escalation 発生元は steps 走査 / tasks.md > T-01

**GIVEN** a `JobState` with two step runs having `outcome.verdict === "escalation"`, one with `endedAt` absent and `startedAt: "2025-01-01T11:00:00Z"` (step `"spec-review"`), and one with `endedAt: "2025-01-01T09:00:00Z"` (step `"analyze"`)
**WHEN** `deriveEscalationSourceStep` is called
**THEN** the result is `"spec-review"` (startedAt 11:00 > endedAt 09:00)

---

### TC-018: deriveEscalationSourceStep returns null when steps is undefined or empty

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-01

**GIVEN** a `JobState` with `steps` being `undefined` or `{}` (no step runs)
**WHEN** `deriveEscalationSourceStep` is called
**THEN** the result is `null`

---

### TC-019: deriveNextAction returns resume for failed and terminated statuses

**Category**: unit
**Priority**: must
**Source**: design.md > D4: 次アクションは表示状態からの決定的テーブル / tasks.md > T-01

**GIVEN** `{ status: "failed", isStale: false, prMerged: null, slug: "my-task" }` and `{ status: "terminated", isStale: false, prMerged: null, slug: "my-task" }`
**WHEN** `deriveNextAction` is called for each
**THEN** both return `"job resume my-task"`

---

### TC-020: deriveNextAction returns null for archived and canceled statuses

**Category**: unit
**Priority**: must
**Source**: design.md > D4 / tasks.md > T-01

**GIVEN** `{ status: "archived", isStale: false, prMerged: null, slug: "my-task" }` and `{ status: "canceled", isStale: false, prMerged: null, slug: "my-task" }`
**WHEN** `deriveNextAction` is called for each
**THEN** both return `null`

---

### TC-021: deriveNextAction returns null for awaiting-archive when PR is not merged

**Category**: unit
**Priority**: must
**Source**: design.md > D5: merge を促す next action は「PR 既 merged」時のみ / tasks.md > T-01

**GIVEN** `{ status: "awaiting-archive", isStale: false, prMerged: false, slug: "my-task" }`
**WHEN** `deriveNextAction` is called
**THEN** the result is `null`

---

### TC-022: deriveNextAction returns null for awaiting-archive when PR merge state is unknown

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-01

**GIVEN** `{ status: "awaiting-archive", isStale: false, prMerged: null, slug: "my-task" }`
**WHEN** `deriveNextAction` is called
**THEN** the result is `null`

---

### TC-023: buildOperationsView produces categories in the fixed display order

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** a `ViewEntry[]` containing one job for each of `running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`, `archived`, `canceled`
**WHEN** `buildOperationsView` is called
**THEN** the resulting `categories` array is in the order: `running`, `awaiting-response`, `awaiting-archive`, `failed`, `terminal` (5 entries, `failed` and `terminal` each aggregate their member statuses)

---

### TC-024: buildOperationsView orders jobs within a category by createdAt descending

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: job ls SHALL group jobs into fixed operational categories (within-category ordering) / tasks.md > T-01

**GIVEN** two `failed` jobs: one with `createdAt: "2025-01-01T09:00:00Z"` (older) and one with `createdAt: "2025-01-02T09:00:00Z"` (newer)
**WHEN** `buildOperationsView` is called
**THEN** within the `failed` category, the newer job appears first

---

### TC-025: buildOperationsView sets escalationStep only for awaiting-resume jobs

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 (buildOperationsView: escalationStep は awaiting-resume のときのみ設定)

**GIVEN** a `ViewEntry[]` with one `failed` job that has an escalation step verdict in its steps, and one `awaiting-resume` job that also has an escalation step verdict
**WHEN** `buildOperationsView` is called
**THEN** the `failed` job's row has `escalationStep: null` and the `awaiting-resume` job's row has a non-null `escalationStep`

---

### TC-026: formatOperationsViewHuman renders escalation annotation in STATUS column

**Category**: unit
**Priority**: must
**Source**: design.md > D6: 人間出力は区分セクション + 行、STATUS 列に注記を畳む / tasks.md > T-02

**GIVEN** an `OperationsView` with one `awaiting-resume` job whose `escalationStep` is `"code-review"`
**WHEN** `formatOperationsViewHuman` is called with `isTty: true`
**THEN** the output contains `awaiting-resume (escalation: code-review)` in the STATUS column of that row

---

### TC-027: formatOperationsViewHuman renders stale annotation in STATUS column and resume in NEXT

**Category**: unit
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-02

**GIVEN** an `OperationsView` with one `running` job where `stale: true` and `slug: "my-task"`
**WHEN** `formatOperationsViewHuman` is called
**THEN** the STATUS column shows `running (stale?)` and the NEXT column shows `job resume my-task`

---

### TC-028: formatOperationsViewHuman renders PR merged annotation in STATUS column and archive in NEXT

**Category**: unit
**Priority**: must
**Source**: design.md > D6 / tasks.md > T-02

**GIVEN** an `OperationsView` with one `awaiting-archive` job where `prMerged: true` and `slug: "my-task"`
**WHEN** `formatOperationsViewHuman` is called
**THEN** the STATUS column shows `awaiting-archive (PR merged)` and the NEXT column shows `job archive my-task`

---

### TC-029: formatOperationsViewHuman uses TAB separator in non-TTY mode

**Category**: unit
**Priority**: could
**Source**: design.md > D6 (TTY は固定幅 pad、非 TTY は TAB 区切り) / tasks.md > T-02

**GIVEN** an `OperationsView` with at least one job
**WHEN** `formatOperationsViewHuman` is called with `isTty: false`
**THEN** each row's fields are separated by TAB characters (`\t`) rather than fixed-width padding

---

### TC-030: formatOperationsViewJson produces the exact job entry field set

**Category**: unit
**Priority**: must
**Source**: design.md > D7: --json は top-level `{ categories }` の安定形 / tasks.md > T-03

**GIVEN** an `OperationsView` with one `awaiting-resume` job with all fields populated
**WHEN** `formatOperationsViewJson` is called and the result is parsed as JSON
**THEN** the top-level keys are exactly `["categories"]`, each category entry has keys `category`, `label`, `jobs`, and each job entry has at least `jobId`, `slug`, `step`, `status`, `stale`, `prMerged`, `escalationStep`, `nextAction`, `branch`, `createdAt`

---

### TC-031: runPs with --json and 0 matching jobs outputs `{"categories":[]}` with exit code 0

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 (JSON かつ 0 件のときは `{ "categories": [] }` を出す)

**GIVEN** a job store that is empty (or whose active filter matches no jobs)
**WHEN** `runPs` is called with `{ json: true }`
**THEN** stdout is `{ "categories": [] }` (parseable JSON, `categories` is an empty array) and exit code is 0

---

### TC-032: runPs calls checkPrMerged only for awaiting-archive jobs

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04 (prMerged の照会は awaiting-archive の job にのみ行う既存の rate-limit 配慮を維持)

**GIVEN** a job store containing one `running` job, one `awaiting-resume` job, and one `awaiting-archive` job
**WHEN** `runPs` is called
**THEN** `checkPrMerged` is invoked exactly once (for the `awaiting-archive` job) and is never invoked for `running` or `awaiting-resume` jobs

---

### TC-033: formatJobRow is absent from the codebase after T-05

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-05 (formatJobRow を import している箇所を全て解消する)

**GIVEN** the implementation after T-04 and T-05 are complete
**WHEN** the codebase is searched for references to `formatJobRow`
**THEN** zero occurrences are found in any source or test file

---

### TC-034: help output still contains "job ls"

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06 (help-output-tc.test.ts は `USAGE.toContain("job ls")` を検証している)

**GIVEN** the `USAGE` string in `command-registry.ts` after the `--json` flag addition
**WHEN** `USAGE` is inspected (or `help-output-tc.test.ts` is run)
**THEN** `USAGE` still contains the substring `"job ls"`

---

## Result

```yaml
result: completed
total: 34
automated: 34
manual: 0
must: 22
should: 10
could: 2
blocked_reasons: []
```
