# Spec: no-op 検知に finding 対象 path の免除を導入する

## Requirements

### Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える

The code-fixer no-op detector SHALL treat a change to a file that is named by a finding
routed to the current code-fixer run as real work, even when that file is under an
artifact prefix (`specrunner/changes/` / `.specrunner/`). When the only changed files are
such finding-named paths, `detectNoOp` MUST NOT override the verdict to `needs-fix`.

The exemption MUST be limited to paths that findings actually name for the current run —
it is a point exemption, not a widening of the artifact prefixes.

#### Scenario: finding が change folder doc を名指しし fixer がその doc のみを修正した（#927 実例）

**Given** the active reviewer's latest run reports a `fixable` finding whose `file` is
`specrunner/changes/<slug>/implementation-notes.md`, and the entry is not an approved
findings-routing no-op (so the pre-existing `findingsRoutingApproved` suppression does not apply)
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles`
returns only `specrunner/changes/<slug>/implementation-notes.md`
**Then** `detectNoOp` returns `undefined` (no override) and the recorded code-fixer verdict
is `approved` — the no-op does not fire and the pipeline does not halt

#### Scenario: finding が名指ししない change folder ファイルのみの変更（従来どおり no-op）

**Given** the active reviewer's latest run reports a `fixable` finding whose `file` is
`specrunner/changes/<slug>/implementation-notes.md`
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles`
returns only a different change-folder file (e.g. `specrunner/changes/<slug>/other-doc.md`)
that no finding names
**Then** `detectNoOp` returns `"needs-fix"` (the change-folder file is not exempt) and the
recorded verdict is overridden to `needs-fix`

#### Scenario: finding がソースを名指しし変更もソースのみの通常ケース（免除の影響なし）

**Given** the active reviewer's latest run reports a finding whose `file` is `src/foo.ts`
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles`
returns `src/foo.ts`
**Then** `detectNoOp` returns `undefined` (source change is real work as before) and the
recorded verdict remains `approved`

---

### Requirement: pipelineManagedPaths は finding が名指ししても仕事に数えない

The no-op detector SHALL cap the finding-target exemption so that any path in
`pipelineManagedPaths(slug)` (state.json / events.jsonl / usage.json /
bite-evidence-result.md / pr-create-result.md) is NOT counted as work even when a finding
names it. These files are written by the pipeline itself every step and carry no evidence of
the fixer's work.

#### Scenario: finding が state.json を名指しても needs-fix

**Given** the active reviewer's latest run reports a finding whose `file` is
`specrunner/changes/<slug>/state.json`, and the entry is not an approved findings-routing no-op
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles`
returns only `specrunner/changes/<slug>/state.json`
**Then** `detectNoOp` returns `"needs-fix"` (state.json is a pipeline-managed path, capped out
of the exemption) and the recorded verdict is overridden to `needs-fix`

---

### Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される

The system SHALL derive the finding-target path set from job state using the same routing
precedence that code-fixer uses to select the findings it fixes (conformance-triggered →
coordinator-loop → active-reviewer), reusing existing state seams
(`getConformanceFixContext`, `collectParallelFixerFindings`, `getLatestJudgeFindings`,
`resolveActiveReviewer`, `deriveImplFixerChain`). The derivation MUST be a pure function with
no I/O and MUST NOT take the fixer agent's self-report as input.

The finding-target set MUST be computed only for steps with `noOpDetect === true` (code-fixer);
for all other steps the exemption set is empty.

#### Scenario: 導出は active reviewer の finding を含む

**Given** a job state where the active reviewer's latest run reports findings naming files A and B
**When** the routed finding-target set is derived
**Then** it contains A and B (mapped from each finding's `file`)

#### Scenario: 非 code-fixer step では免除集合が空

**Given** a step whose `noOpDetect` is not `true`
**When** the executor computes the finding-target set for the no-op check
**Then** the set is empty (routing derivation is not run) and no exemption is applied

---

### Requirement: 既存の no-op 挙動を保存する

The change SHALL preserve all pre-existing no-op behaviors. The optional exemption/cap
params of `detectNoOp` default to an empty exemption, so omitting them reproduces the prior
verdict exactly. The `findingsRoutingApproved` suppression path, the
`completionReason !== "success"` early return, the `sourceFiles.length > 0` early
`undefined`, and the `noOpDetect`-only-on-code-fixer scope MUST remain unchanged.

#### Scenario: artifact のみの変更で finding が名指ししない（#734 escalate 維持）

**Given** code-review's latest verdict is `needs-fix` (no approved findings-routing suppression),
no finding names any changed file
**When** the code-fixer completes with `completionReason: "success"` and `listChangedFiles`
returns only pipeline artifacts (state.json / events.jsonl / liveness.json)
**Then** `detectNoOp` returns `"needs-fix"` (unchanged from #734)

#### Scenario: approved findings-routing no-op は従来どおり抑止される

**Given** code-review's latest verdict is `approved` with a `fixable` finding and code-review is
the active reviewer, and `listChangedFiles` returns only pipeline artifacts that no finding names
**When** the code-fixer completes with `completionReason: "success"`
**Then** `detectNoOp` returns `undefined` (the pre-existing `findingsRoutingApproved`
suppression still applies) and the recorded verdict remains `approved`
