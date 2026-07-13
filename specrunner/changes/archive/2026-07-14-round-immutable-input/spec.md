# Spec: 並列 round の入力を immutable にする（共有 deps 不変・resume 配布）

## Requirements

### Requirement: Member execution shall not mutate the shared orchestration input

The parallel review round SHALL construct a readonly per-round execution input
and pass it to each pending member. Member execution MUST NOT write to the shared
`deps` object across the execution seam (no `deps.resumePrompt =` /
`deps.resumeContext =` assignment during member execution). After a coordinator
round completes, the shared `deps` object it received MUST retain its original
`resumePrompt` and `resumeContext` values.

#### Scenario: shared deps unchanged after a parallel round

**Given** a coordinator round with two pending members
**And** the round is entered with `deps.resumePrompt` and `deps.resumeContext` set
**When** the round fans out and both members execute
**Then** the shared `deps.resumePrompt` retains its original value after the round completes
**And** the shared `deps.resumeContext` retains its original value after the round completes

#### Scenario: consumption order does not decide distribution

**Given** a coordinator round with pending members A and B whose completion order is non-deterministic
**When** the round fans out
**Then** the resume inputs each member receives do not depend on which member completed first

---

### Requirement: Human resume note shall reach every pending member of the round

When resume supplies a human note (`resumePrompt`), the round SHALL make that note
available to every pending member of the round as readonly input, independent of
member execution order.

#### Scenario: human note distributed to all pending members

**Given** a resumed coordinator round with pending members A and B
**And** a human resume note is supplied
**When** the round fans out
**Then** member A's agent context resume prompt contains the human note
**And** member B's agent context resume prompt contains the human note

#### Scenario: human note reaches non-target members without automatic context

**Given** a resumed round where `resumeContext.resumePoint.step = "A"`
**And** pending members A and B, with a human note supplied
**When** the round fans out
**Then** member B's resume prompt contains the human note
**And** member B's resume prompt does not contain the automatic resume context block

---

### Requirement: Automatic resume context shall expand only for the target member

The automatic resume context SHALL expand only for the member whose name equals
`resumeContext.resumePoint.step`. All other members MUST NOT receive the automatic
resume context block.

#### Scenario: automatic context only for the target member

**Given** a resumed round where `resumeContext.resumePoint.step = "A"`
**And** pending members A and B
**When** the round fans out
**Then** member A's resume prompt contains the automatic resume context block
**And** member B's resume prompt does not contain the automatic resume context block

---

### Requirement: member→coordinator resume shall preserve the automatic resume context

When `resolveResumeStep` maps a member `resumePoint.step` to the coordinator
(`custom-reviewers`), the resume command SHALL still provide `resumeContext`
carrying the **original** `resumePoint` (with the member step name), so the
automatic context is not dropped by the coordinator mapping. The context is
preserved when the resolved start step equals
`mapMemberToCoordinator(resumePoint.step, reviewers)`.

#### Scenario: member resumePoint mapped to coordinator keeps context

**Given** `resumePoint.step` is a reviewer member name and reviewers are present
**And** no `--from` is supplied
**And** `resolveResumeStep` returns the coordinator step `custom-reviewers`
**When** `prepare()` builds the resume result
**Then** `resumeContext` is defined
**And** `resumeContext.resumePoint.step` equals the original member name

#### Scenario: static step resume context unchanged

**Given** `resumePoint.step` is a static step (e.g. `spec-review`) and no `--from`
**When** `prepare()` builds the resume result
**Then** `resumeContext.resumePoint.step` equals that static step name (behavior identical to before)

#### Scenario: --from redirect to a different position drops context

**Given** `--from` is supplied and redirects to a step that is not the resumePoint position
**And** the resolved start step does not equal `mapMemberToCoordinator(resumePoint.step, reviewers)`
**When** `prepare()` builds the resume result
**Then** `resumeContext` is `undefined`

---

### Requirement: Sequential resume distribution shall be unchanged

Sequential (non-parallel) resume SHALL continue to deliver the human note and the
automatic context to the resumed step only. Steps executed after the resumed unit
MUST NOT receive resume inputs. The one-shot consumption MUST NOT be implemented by
in-place mutation of the shared `deps` object.

#### Scenario: human note reaches only the resumed step

**Given** a sequential resume starting at step X with a human note supplied
**When** the pipeline executes X and then the next step Y
**Then** X's resume prompt contains the human note
**And** Y's resume prompt does not contain the human note

#### Scenario: automatic context reaches only the resumed step

**Given** a sequential resume starting at step X with `resumeContext.resumePoint.step = "X"`
**When** the pipeline executes X and then the next step Y
**Then** X's resume prompt contains the automatic resume context block
**And** Y's resume prompt does not contain the automatic resume context block

#### Scenario: non-resume run receives no resume input

**Given** a run started with no `resumePrompt` and no `resumeContext`
**When** the pipeline executes its steps
**Then** no step's resume prompt contains a human note or automatic context block
