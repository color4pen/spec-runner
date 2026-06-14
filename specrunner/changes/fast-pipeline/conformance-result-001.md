# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All T-01–T-08 checkboxes marked [x]; verified by diff and test results |
| design.md | ✓ | D1–D8 all correctly implemented; see detail below |
| spec.md | ✓ | All 6 Requirements and 12 Scenarios covered by tests; all green |
| request.md | ✓ | All 9 acceptance criteria satisfied; bun run typecheck && bun run test: 5331/5331 passed |

---

## Detail

### Tasks (T-01–T-08)

All checkboxes in tasks.md are marked **[x]**:

- **T-01** (`PIPELINE_IDS.FAST = "fast"`): Added to `src/kernel/pipeline-ids.ts`. `PipelineId` union auto-updated.
- **T-02** (`FAST_TRANSITIONS`): Defined in `src/core/pipeline/types.ts` adjacent to STANDARD_TRANSITIONS. All D2 rows present; spec-review/test-case-gen/adr-gen rows absent; reverification guards ordered correctly (when-guarded rows before unconditional).
- **T-03** (`FAST_DESCRIPTOR` + registry): Defined in `src/core/pipeline/registry.ts`. 9 steps, permissionScope declared, PIPELINE_REGISTRY updated to 3 entries.
- **T-04** (structural tests): `tests/unit/core/pipeline/fast-descriptor.test.ts` — 52 tests covering steps/startStep/checkpoint/surfaces/slim design/loopName constraints. All green.
- **T-05** (scope checkpoint tests): `tests/unit/core/step/fast-scope-checkpoint.test.ts` — 11 tests covering breach→escalation for all 3 surfaces, no-breach→approved, non-checkpoint step skips scope synthesis. All green.
- **T-06** (gate inheritance tests): `tests/unit/core/pipeline/runtime-capability-gate.test.ts` extended (27 tests), `tests/unit/core/command/pipeline-run-gate.test.ts` extended (14 tests, including T-06 block with real "fast" descriptor). bootstrapJob spy not called on gate rejection. Profile-name independence confirmed with multiple fixture ids.
- **T-07** (registry-invariants update): `tests/unit/core/pipeline/registry-invariants.test.ts` T-06-3 updated from "2 entries / 0 scope" to "3 entries / fast is the 1 scope-declaring profile". scope-escalation.test.ts / pipeline-run-gate.test.ts unchanged and green.
- **T-08** (full verification): bun run typecheck ✓, bun run test 5331/5331 ✓, bun run lint ✓. arch invariants verified by cross-boundary-invariants review (approved).

### Design Decisions (D1–D8)

| Decision | Verdict | Evidence |
|----------|---------|----------|
| D1: 9-step spine+fixer layout | ✓ | registry.ts steps array matches D1 table; fixer steps present |
| D2: FAST_TRANSITIONS structure | ✓ | design→implementer direct; conformance→pr-create; no adr-gen; no spec-fixer row; reverification rows ordered before unconditional |
| D3: permissionScope = conformance + 3 globs | ✓ | checkpoint="conformance", forbidden=[{public-types, src/core/port/**}, {persisted-format, src/state/schema.ts}, {state-transitions, src/state/lifecycle.ts}] |
| D4: gate inheritance, no fast-specific branch | ✓ | Only occurrence of "fast" in src/ is `FAST: "fast"` constant; `pipelineId === "fast"` absent |
| D5: slim design structure | ✓ | spec-review absent, test-case-gen absent, implementer present, adr-gen absent |
| D6: roles table | ✓ | Matches D1/D6 specification exactly |
| D7: loopName/loopNames/summaryStep | ✓ | loopName=code-review ∈ loopNames=[verification,code-review,conformance]; summaryStep=code-review ∈ steps |
| D8: registry-invariants flip | ✓ | T-06-3 now asserts 3 entries; fast is the sole scope-declaring profile |

### Spec Requirements

All 6 Requirements with 12 Scenarios are satisfied:

1. **Registry provides `fast` profile** — `getPipelineDescriptor("fast")` returns FAST_DESCRIPTOR; step set matches; excluded steps absent. *T-04-1, T-04-2, T-04-3.*
2. **design→implementer, conformance→pr-create** — Transition table rows confirmed; buildReviewerChainTransitions(["code-review"]) routes chain-end approved to conformance. *FAST_TRANSITIONS structure.*
3. **permissionScope: checkpoint=conformance, 3 surfaces** — T-04-4 (ConformanceStep uses CONFORMANCE_REPORT_TOOL), T-04-5 (globs match in/out of scope). *T-04-4, T-04-5.*
4. **Surfaces evaluated at conformance (canDerive=true)** — All 3 surfaces trigger escalation; non-forbidden paths do not; code-review (non-checkpoint) does not call listChangedFiles. *T-05-1, T-05-2, T-05-3.*
5. **Gate rejection before bootstrap (canDerive=false)** — UnsupportedRuntimeCapabilityError thrown; bootstrapJob spy not called. Gate fires from permissionScope≠undefined not from pipelineId="fast". *T-06 blocks.*
6. **Existing profiles / FindingResolution unchanged** — pipeline absent → pipelineId="standard"; VALID_RESOLUTIONS = {fixable, decision-needed}. *Existing tests all green.*

### Acceptance Criteria (request.md)

| Criterion | Status |
|-----------|--------|
| FAST_DESCRIPTOR in registry, steps without spec-review/test-case-gen/adr-gen | ✓ |
| checkpoint === "conformance" + judge step | ✓ |
| forbidden = 3 surfaces with globs | ✓ |
| canDerive=true → conformance evaluates surfaces | ✓ |
| canDerive=false → gate rejects before bootstrap, no job state | ✓ |
| design slim: design present, no spec-review, test-case-gen in implementer | ✓ |
| standard/design-only/default path/reviewer activation unchanged | ✓ |
| FindingResolution = fixable\|decision-needed | ✓ |
| typecheck + test green, arch invariants green | ✓ (5331/5331 tests, 399 files) |

### Scope Surface Check

This change's own diff does not touch any of the 3 forbidden surfaces:
- `src/core/port/**` — not modified
- `src/state/schema.ts` — not modified
- `src/state/lifecycle.ts` — not modified

src/ changes confined to `src/core/pipeline/registry.ts`, `src/core/pipeline/types.ts`, `src/kernel/pipeline-ids.ts`. No breach.

### Non-blocking Observations

**O-1**: `scope-escalation.test.ts` T-01 describe title reads "PIPELINE_REGISTRY profiles have no permissionScope" — stale now that fast declares scope. Assertions within only test STANDARD/DESIGN_ONLY; still pass. No functional impact.

**O-2**: `pipeline-run-gate.test.ts` afterEach comment says "production registry stays at 2 entries" — should be 3. afterEach behavior is correct. No functional impact.

Neither observation blocks approval.
