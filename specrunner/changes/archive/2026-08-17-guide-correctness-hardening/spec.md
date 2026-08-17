# Spec: guide 正本の正確性硬化

## Requirements

### Requirement: review topic SHALL describe request.md as the canonical reference post-pipeline-start

The review topic body SHALL NOT contain language canonizing the originating issue over request.md.
It SHALL contain a statement that the normative reference after pipeline start is request.md / spec,
and that issue-vs-request.md comparison is only relevant for transcription auditing (see: audit topic).

#### Scenario: review topic does not contain issue-as-canon language

**Given** the guide `review` topic body
**When** it is inspected for the string "起点 issue の正典を canon とする"
**Then** the string is absent

#### Scenario: review topic contains request.md as the post-pipeline canonical reference

**Given** the guide `review` topic body
**When** it is inspected for pipeline normative reference
**Then** it contains language indicating request.md / spec as the normative reference

---

### Requirement: audit topic SHALL position issue comparison as a transcription-audit concern only

The audit topic body SHALL NOT state that review uses the originating issue as the canonical reference.
Issue vs. request.md comparison SHALL be described as an audit concern for detecting silent weakening
during request.md authoring, not as the primary review axis.

#### Scenario: audit topic does not contain issue-as-canon language

**Given** the guide `audit` topic body
**When** inspected for "起点 issue の正典と照合する"
**Then** the string is absent

#### Scenario: audit topic describes issue comparison as transcription-audit concern

**Given** the guide `audit` topic body
**When** inspected
**Then** it contains language associating issue vs. request.md comparison with detecting transcription-time requirement weakening

---

### Requirement: escalation topic cancel guidance SHALL use jobId, not slug

The escalation topic SHALL describe a two-step cancellation flow:
1. Run `specrunner job show <slug>` to retrieve the Job ID
2. Run `specrunner job cancel <jobId> --restore-draft` using the retrieved Job ID

The cancel argument SHALL be expressed as `<jobId>`, not `<slug>`, matching `job cancel args: [{name: "jobId"}]`.

#### Scenario: escalation topic provides job show step before cancel

**Given** the guide `escalation` topic body
**When** inspected for the cancel guidance
**Then** it contains `specrunner job show` before `specrunner job cancel`

#### Scenario: escalation topic cancel uses jobId argument

**Given** the guide `escalation` topic body
**When** inspected for the cancel command argument
**Then** it contains `<jobId>` (not `<slug>`) as the argument to `job cancel`

---

### Requirement: merge topic worktree path SHALL specify the 8-character jobId prefix

The merge topic SHALL describe the worktree directory as `<slug>-<jobIdの先頭8文字>` (or equivalent 8-char expression),
matching the actual behavior of `manager.ts` (`jobId.slice(0, 8)`).

#### Scenario: merge topic uses 8-char jobId prefix notation

**Given** the guide `merge` topic body
**When** inspected for the worktree path
**Then** the worktree path notation reflects an 8-character prefix of jobId (e.g. contains "先頭8" or "8文字")
**And** does not describe the path as the full `<jobId>`

---

### Requirement: jobs topic SHALL NOT contain the stale job-ls pre-check step

The jobs topic SHALL NOT contain the instruction to run `job ls` before monitoring to confirm running state.
It SHALL treat detach parent exit 0 as sufficient confirmation of registration and process liveness.

#### Scenario: jobs topic has no stale pre-check instruction

**Given** the guide `jobs` topic body
**When** inspected for the deprecated pre-confirmation step
**Then** it does not contain "job ls で running を確認"

---

### Requirement: setup topic init description SHALL reflect global config + repository scaffold

The setup topic SHALL describe `specrunner init` as creating:
- user-global config (`~/.config/specrunner/config.json`)
- per-repo scaffold (`specrunner/drafts/`, `specrunner/changes/`, `.gitignore` update)

It SHALL NOT describe or imply that a project-local `.specrunner/config.json` is scaffolded.
The heading SHALL NOT read "2 層 config scaffold".

#### Scenario: setup topic init heading reflects actual behavior

**Given** the guide `setup` topic body
**When** inspected for the init section heading
**Then** it does not contain "2 層 config scaffold"

---

### Requirement: runner.ts halt output SHALL include a guide escalation link

When the pipeline halts at a step (awaiting-resume), the runner SHALL output a hint line
directing the operator to `specrunner guide escalation` immediately after the resume instruction.

#### Scenario: halt output contains guide link

**Given** `runner.ts` source code
**When** inspected for the halt output section (around "Pipeline halted at step")
**Then** the source contains the string `specrunner guide escalation` within the halt output block

---

### Requirement: invocation contract SHALL cover triple-backtick code blocks

The guide test suite SHALL extract `specrunner ...` lines from triple-backtick code blocks
AND from inline backtick references, and SHALL apply the same invocation contract to both
(TC-013 additionally keeps path-only resolution for inline command paths).
For each extracted line not matching an explicit skip pattern, the test SHALL verify:
(a) the command path resolves in the CLI registry
(b) every `--flag` used exists in the CommandSpec flags
(c) every positional `<placeholder>` name matches the corresponding `args[i].name`
    OR one of the pipe-separated alternatives in `args[i].name`

Lines skipped for mechanical reasons MUST be listed in an explicit named constant
with a `reason` field explaining why each pattern is excluded.
Skip patterns MUST be tested against the line with `<placeholder>` tokens stripped,
so placeholder angle brackets / in-placeholder pipes are never mistaken for shell
metacharacters — otherwise every placeholder example is excluded and the
placeholder-name check (c) never runs against guide content.

#### Scenario: code block specrunner lines are extracted and validated

**Given** a guide topic body containing triple-backtick code blocks with `specrunner ...` lines
**When** the invocation contract test runs
**Then** each non-excluded `specrunner ...` line is validated against the CLI registry

#### Scenario: skip patterns are explicitly documented

**Given** the invocation contract test implementation
**When** inspected
**Then** there exists a named constant (e.g. `INVOCATION_CONTRACT_SKIP_PATTERNS`) whose entries
       each carry a `reason` string — no pattern silently drops lines without explanation

---

### Requirement: invocation contract SHALL fail on placeholder name mismatch

The invocation contract validation logic SHALL produce a violation when a positional placeholder
name does not match any alternative in the corresponding `args[i].name`.
This MUST be verified by a test using a known-bad example independent of guide content.

#### Scenario: job cancel <slug> is detected as a violation

**Given** the invocation string `specrunner job cancel <slug> --restore-draft`
**When** the invocation contract validator runs on it
**Then** it reports a positional name mismatch (placeholder "slug" vs args.name "jobId")

---

### Requirement: acceptance-and-issue-audit SKILL.md SHALL NOT mention parallel-request-workflow

The `acceptance-and-issue-audit/SKILL.md` description frontmatter SHALL NOT contain
a reference to `parallel-request-workflow`.

#### Scenario: SKILL.md has no parallel-request-workflow reference

**Given** `.claude/skills/acceptance-and-issue-audit/SKILL.md`
**When** inspected for the string "parallel-request-workflow"
**Then** the string is absent

---

### Requirement: ADR SHALL reflect actual state of parallel-request-workflow deletion

The ADR `2026-08-17-cli-operational-knowledge-registry.md` SHALL describe the
`parallel-request-workflow` skill disposal as directory deletion (not tombstone placement).

#### Scenario: ADR does not describe tombstone approach

**Given** `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md`
**When** inspected for the parallel-request-workflow disposal description
**Then** it does not say "tombstone を置いて実質削除する"
**And** describes the actual state: directory deletion
