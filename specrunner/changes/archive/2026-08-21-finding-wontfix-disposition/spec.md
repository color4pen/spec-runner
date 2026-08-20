# Spec: fixable finding への operator 不採用裁定を decisions 台帳の一般化で機械尊重する

## Requirements

### Requirement: DecisionRecord は option / disposition の 2 arm を後方互換で保持する

`DecisionRecord` SHALL be a discriminated union of an **option** arm (`kind?: "option"`, legacy —
`kind` 省略時も option として読める) and a **disposition** arm (`kind: "disposition"`).
The persisted field name `decisions` MUST remain unchanged, and existing records lacking a `kind`
field MUST load and behave as option records with no observable change.

#### Scenario: kind 無しの既存 decisions が option として読める

**Given** a persisted `JobState.decisions` containing a record with no `kind` field, a `selectedOption`,
and `source: "issue-comment"`
**When** the state is loaded and used by decision / inbox / round-context logic
**Then** the record is treated as an option decision
**And** existing decisions / inbox / round-context behavior is unchanged (existing tests green without modification)

#### Scenario: disposition record が必須 field を持つ

**Given** an operator records a wontfix disposition for a fixable finding produced by reviewer step `S`
**When** the disposition record is created
**Then** the record has `kind: "disposition"`, `step` = `S` (the step that produced the finding),
`findingKey` computed from `S`'s actual finding, a `finding` snapshot, `disposition: "wontfix"`,
a non-empty `reason`, `decidedAt`, and `source: "operator"`

### Requirement: `job resume --wontfix` は disposition record を decisions へ記録してから resume する

`job resume` SHALL accept `--wontfix <numbers>` (comma-separated 1-based indices, e.g. `1,3`) and
`--wontfix-reason <text>`. The numbers MUST be resolved against the enumeration order of the findings
reported by the latest regression-gate StepRun. At record time each selected finding MUST be
reverse-mapped by fingerprint (`file|line|title`) to its source step(s) within the impl reviewer chain,
producing one disposition record per matching source step, and these records MUST be appended to
`JobState.decisions` before the pipeline resumes.

#### Scenario: --wontfix が発生 step 由来の disposition record を永続する

**Given** a job whose latest regression-gate StepRun reported a finding at enumeration index 1,
and that finding's fingerprint matches a fixable finding produced by reviewer step `code-review`
**When** the operator runs `job resume <slug> --wontfix 1 --wontfix-reason "accepted risk"`
**Then** `JobState.decisions` gains a disposition record with `step: "code-review"`,
`source: "operator"`, `reason: "accepted risk"`, and `findingKey` computed from the `code-review` finding
**And** the job resumes

#### Scenario: 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record

**Given** the selected finding's fingerprint matches fixable findings produced by both `code-review` and a custom reviewer `security`
**When** the operator records the wontfix
**Then** two disposition records are appended — one with `step: "code-review"` and one with `step: "security"` —
each with `findingKey` computed from that step's own finding

#### Scenario: --prompt と --wontfix は併用できる

**Given** the operator passes both `--prompt "<text>"` and `--wontfix 1 --wontfix-reason "<r>"`
**When** the job resumes
**Then** an operatorAdjudication is recorded from `--prompt` AND a disposition record is recorded from `--wontfix`

### Requirement: 解決不能な --wontfix は exit code 2 で停止し decisions を変更しない

When `--wontfix` cannot be fully resolved, the command MUST exit with code 2 and MUST NOT record any
disposition into `decisions` (all-or-nothing). Unresolvable cases include: `--wontfix-reason` missing or
empty, the regression-gate has no StepRun, a number is out of range or non-integer, the number list
contains empty elements or duplicate indices, and a selected finding's fingerprint matches no step in
the impl reviewer chain.

Note: the regression-gate StepRun may report both fixable (regression) findings and decision-needed
(contradiction) findings. Only fixable findings can be wontfix'd via `--wontfix`. If the operator
selects the index of a decision-needed finding, its fingerprint will match no step in the impl reviewer
chain (which only contains fixable findings), so the command will exit with code 2 with an unresolvable
fingerprint error. This is intentional: decision-needed findings are resolved through the decision
workflow, not through `--wontfix`.

#### Scenario: regression-gate 未実行

**Given** a job with no regression-gate StepRun
**When** the operator runs `job resume <slug> --wontfix 1 --wontfix-reason "r"`
**Then** the command exits with code 2
**And** `JobState.decisions` is unchanged

#### Scenario: 番号が範囲外

**Given** the latest regression-gate StepRun reported 2 findings
**When** the operator runs `job resume <slug> --wontfix 3 --wontfix-reason "r"`
**Then** the command exits with code 2
**And** `JobState.decisions` is unchanged

#### Scenario: reason 欠落

**Given** a job whose latest regression-gate StepRun reported at least one finding
**When** the operator runs `job resume <slug> --wontfix 1` without `--wontfix-reason`
**Then** the command exits with code 2
**And** `JobState.decisions` is unchanged

### Requirement: disposition 済み finding は regression-gate の active 入力から除外される

`collectFindingsLedger` MUST exclude any fixable finding that matches a decision record (by step +
findingKey) during its per-step collection stage (before dedupe). This exclusion MUST be match-only:
the underlying StepRun findings and the event journal MUST remain unchanged.
`deriveRegressionGateVerdict` MUST NOT be modified.

#### Scenario: wontfix 済み finding が computeRegressionLedger から消える

**Given** a job state where reviewer step `code-review` produced fixable findings F1 and F2,
and `decisions` contains a disposition record for F1 (step `code-review`)
**When** `computeRegressionLedger` is computed for the job
**Then** the result contains F2 but not F1

#### Scenario: wontfix 1 件で livelock が解消する

**Given** a regression ledger of findings where every finding except F1 is already fixed in the final code,
and F1 is the only finding the gate keeps reporting as regressed
**When** a disposition record for F1 is recorded and the gate input is recomputed
**Then** F1 is absent from the gate's active input
**And** the remaining findings are all fixed, so the gate has nothing to flag (verdict passed)

#### Scenario: 除外は照合のみで履歴を変えない

**Given** a disposition record excludes F1 from the gate input
**When** the exclusion is applied
**Then** the StepRun that originally reported F1 still contains F1
**And** the event journal is unchanged

### Requirement: 同一 findingKey の再報告は verdict を needs-fix にしない

When a reviewer re-reports a finding with the same `findingKey` as an existing disposition record,
the judge / conformance verdict derivation MUST suppress it via the existing `filterUndecidedFindings`
mechanism, so the verdict does not become needs-fix on account of that finding.

#### Scenario: reviewer が wontfix 済み finding を再報告

**Given** `decisions` contains a disposition record for a finding produced by reviewer step `S`
(step `S`, findingKey `K`)
**When** reviewer step `S` re-reports a finding whose computed findingKey equals `K`
**Then** the re-reported finding is filtered out before verdict derivation
**And** the verdict is not needs-fix on account of that finding

### Requirement: --wontfix を指定しない resume は挙動不変

A `job resume` invocation without `--wontfix` (including `--prompt`-only resumes) MUST behave exactly as
before this change, recording no disposition and leaving `decisions` untouched.

#### Scenario: --wontfix 無しの resume

**Given** the operator runs `job resume <slug>` or `job resume <slug> --prompt "<text>"`
**When** the job resumes
**Then** no disposition record is added
**And** existing resume behavior (including the `--prompt` operatorAdjudication path) is unchanged
