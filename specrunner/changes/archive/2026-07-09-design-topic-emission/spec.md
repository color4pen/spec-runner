# Spec: 設計層 topic 排出

## Requirements

### Requirement: The system SHALL collect design-level findings across all step runs

The system SHALL, during the archive phase, walk every step run in `state.steps` and collect each
finding whose `resolution === "decision-needed"` OR `origin === "scope"`, retaining its provenance
(step name, iteration, and finding index). fixable findings without `origin: "scope"` SHALL be excluded.

Collection SHALL deduplicate candidates using the key `step|file|line|title` (line coerced to empty
string when absent), retaining the first occurrence in a deterministic traversal order: step names in
lexicographic order, runs by `attempt` ascending, findings by array index ascending. `iteration` SHALL
be the `StepRun.attempt` (1-origin); `index` SHALL be the 0-origin position of the finding in the run's
`findings` array.

#### Scenario: decision-needed and scope findings are collected

**Given** a job whose step runs contain a `resolution: "decision-needed"` finding and an
`origin: "scope"` finding
**When** the archive phase runs topic emission
**Then** both findings are collected as emission candidates with their step/iteration/index provenance

#### Scenario: fixable-only job yields no candidates

**Given** a job whose step runs contain only `resolution: "fixable"` findings with no `origin: "scope"`
**When** the archive phase runs topic emission
**Then** no candidates are collected and no topic files are written

#### Scenario: duplicate findings are deduplicated deterministically

**Given** the same design-level finding (identical step, file, line, title) appears in two iterations of a step
**When** candidates are collected
**Then** exactly one candidate survives, using the lowest `attempt` as its iteration provenance

### Requirement: The system SHALL derive a deterministic, contract-conformant slug per finding

The system SHALL derive each topic slug from the raw string `<job-slug>-<step>-<iteration>-<index>` by
normalizing it to the contract grammar `^[a-z0-9]+(-[a-z0-9]+)*$`: lowercase, replace every character
outside `[a-z0-9]` with a hyphen, collapse consecutive hyphens to one, and strip leading/trailing hyphens.
The same input SHALL always produce the same slug. The topic `id` SHALL be `top-<slug>`.

#### Scenario: slug matches the contract grammar

**Given** a candidate with job-slug `design-topic-emission`, step `spec-review`, iteration `1`, index `0`
**When** the slug is derived
**Then** the slug is `design-topic-emission-spec-review-1-0` and matches `^[a-z0-9]+(-[a-z0-9]+)*$`
**And** the `id` frontmatter value is `top-design-topic-emission-spec-review-1-0`

### Requirement: The system SHALL write each topic as a flat-frontmatter markdown file

The system SHALL write one file per surviving candidate at `design/topics/<slug>.md` under the record
directory. The frontmatter SHALL be flat (no nesting, no multi-line values) and contain `id: top-<slug>`
and `source: specrunner:<job-slug>/<step>-<iteration>#<index>`. The body SHALL present the finding's
`title` as a heading and `rationale` as the symptom, and SHALL include the finding's `severity`, `step`,
and `file` (with `:line` appended when a line is present) as context.

When the decision ledger (`state.decisions`) contains a decision matching the finding (matched via the
step-scoped deterministic finding key), the body SHALL append a section headed
「暫定裁定（提案であって決定ではない）」 containing the selected option's label and consequence.

#### Scenario: emitted file has contract-conformant frontmatter and body

**Given** a surviving decision-needed candidate from step `spec-review`
**When** the topic file is written
**Then** the file at `design/topics/<slug>.md` starts with flat frontmatter containing `id: top-<slug>`
and `source: specrunner:<job-slug>/spec-review-1#0`
**And** the body contains the finding title, rationale, severity, step, and file

#### Scenario: matching decision is rendered as a provisional ruling

**Given** a candidate finding that has a matching record in `state.decisions`
**When** the topic file is written
**Then** the body contains a 「暫定裁定（提案であって決定ではない）」 section with the selected option's
label and consequence

#### Scenario: candidate without a matching decision omits the ruling section

**Given** a candidate finding with no matching record in `state.decisions`
**When** the topic file is written
**Then** the body contains no 「暫定裁定」 section

### Requirement: The system SHALL be idempotent by skipping existing topic files

The system SHALL NOT overwrite an existing `design/topics/<slug>.md`. When the target file already exists,
the system SHALL skip that candidate. Re-archiving the same job SHALL NOT produce duplicate files or
duplicate `id` values.

#### Scenario: re-archive does not overwrite or duplicate

**Given** a job that was already archived once and produced `design/topics/<slug>.md`
**When** the job is archived again
**Then** the existing file is left unchanged and no duplicate file with the same `id` is created

### Requirement: The system SHALL stage emitted files independently of the mark-hook

The system SHALL stage the emitted files into the archive commit using a scoped `git add` limited to the
`design/topics` path (or the `design` directory), independently of the design-layer mark-hook. The
emission SHALL run such that its staging does not depend on the mark-hook's success or failure.

#### Scenario: emitted topics are included in the archive commit

**Given** `designLayer.enabled=true`, `topicEmission` not disabled, and a design-level finding present
**When** `job archive` records the archive commit
**Then** the emitted `design/topics/<slug>.md` files are staged and included in the archive commit

#### Scenario: emission staging is independent of mark-hook outcome

**Given** the mark-hook would error during archive
**When** the archive phase runs
**Then** topic emission still executes and stages its files before the mark-hook is invoked

### Requirement: The system SHALL degrade to a no-op when disabled or when design/ is absent

The system SHALL perform no emission (no file writes, no staging) when `designLayer.enabled` is false, OR
when the resolved `topicEmission` is false, OR when the record directory has no `design/` directory. When
`design/` exists but `design/topics/` does not, the system SHALL create `design/topics/`. Emission failures
(directory checks, mkdir, writeFile, or git add) SHALL NOT fail the archive; they SHALL emit a warning and
allow the archive to continue.

#### Scenario: disabled design layer emits nothing

**Given** `designLayer.enabled` is false
**When** the archive phase runs
**Then** no topic files are written and existing archive behavior is unchanged

#### Scenario: topicEmission=false emits nothing

**Given** `designLayer.enabled=true` and `topicEmission=false`
**When** the archive phase runs
**Then** no topic files are written

#### Scenario: absent design/ emits nothing

**Given** `designLayer.enabled=true`, `topicEmission=true`, and no `design/` directory under the record dir
**When** the archive phase runs
**Then** no topic files are written and no `design/` directory is created

#### Scenario: design/ present but design/topics/ absent creates the directory

**Given** `designLayer.enabled=true`, `topicEmission=true`, a `design/` directory exists, `design/topics/`
does not, and at least one design-level finding is present
**When** the archive phase runs
**Then** `design/topics/` is created and topic files are written into it

### Requirement: The resolved design-layer config SHALL expose topicEmission with a default of true

The `DesignLayerConfig` SHALL accept an optional `topicEmission?: boolean`, and `ResolvedDesignLayer` SHALL
carry a required `topicEmission: boolean`. `resolveDesignLayerConfig` SHALL default `topicEmission` to true.
The config validation schema SHALL accept `topicEmission` as an optional boolean.

#### Scenario: default resolves to true

**Given** a config with `designLayer.enabled=true` and no `topicEmission` field
**When** `resolveDesignLayerConfig` runs
**Then** the resolved `topicEmission` is true

#### Scenario: explicit false is preserved

**Given** a config with `designLayer.topicEmission=false`
**When** `resolveDesignLayerConfig` runs
**Then** the resolved `topicEmission` is false

### Requirement: Emission SHALL run on both archive paths and report a summary when it emits

Topic emission SHALL execute for both `job archive` and `job archive --with-merge`. When one or more topic
files are newly written, the system SHALL write a single stdout line reporting the count and the destination
directory. When nothing is emitted, no such line SHALL be written.

#### Scenario: with-merge path emits topics

**Given** `job archive --with-merge` on a job with a design-level finding and `designLayer.enabled=true`
**When** the merge-then-archive flow records the archive
**Then** topic files are emitted (the with-merge path delegates to the same archive orchestrator)

#### Scenario: summary line printed only when emission occurs

**Given** at least one topic file is newly written
**When** emission completes
**Then** a single stdout line reports the number of emitted files and the `design/topics/` destination
**And** when no files are written, no summary line is printed
