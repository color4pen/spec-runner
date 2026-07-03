# Conformance Review: spec-exempt-design-contract — Iteration 1

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ yes | All T-01 through T-06 checkboxes marked [x] |
| design.md | ✅ yes | D1–D4 fully reflected in implementation |
| spec.md | ✅ yes | All Requirements and Scenarios satisfied |
| request.md | ✅ yes | All 5 acceptance criteria met |

---

## Judgment Item 1: tasks.md — Checkbox Completeness

All task checkboxes in `tasks.md` are marked `[x]`.

| Task | Status |
|------|--------|
| T-01: `specRequired` attribute + `isSpecRequired()` helper | ✅ complete |
| T-02: `SPEC_EXEMPT_MARKER` / `SPEC_EXEMPT_NOTE` + scaffold replacement | ✅ complete |
| T-03: design `writes()` contract opt-out (`verify: isSpecRequired`) | ✅ complete |
| T-04: local / managed runtime consistency test | ✅ complete |
| T-05: downstream prompt updates (spec-review / conformance / design) | ✅ complete |
| T-06: build / typecheck / lint / test green | ✅ complete |

---

## Judgment Item 2: design.md — Design Decisions

### D1 — `specRequired` boolean in `type-config`

`TypeConfigEntry` (`src/config/type-config.ts:14-26`) has the new `specRequired: boolean` field. All five types are set correctly:

- `chore` → `false`
- `new-feature`, `spec-change`, `bug-fix`, `refactoring` → `true`

`isSpecRequired(type: string): boolean` is exported with `?? true` fallback (fail-closed for unknown types), consistent with the `getBranchPrefix` / `getSpecReviewMode` convention specified in D1.

`src/config/__tests__/type-config.test.ts` adds tests for all five types plus unknown and empty-string cases.

### D2 — Contract exemption at `writes()` layer; runtime code unchanged

`DesignStep.writes()` (`src/core/step/design.ts:90`) now sets:

```typescript
{ path: `${folder}/spec.md`, verify: isSpecRequired(deps.request.type) }
```

For `chore`, `verify` is `false`; `producedContractsFromWrites()` (`src/core/step/output-verify.ts:72`) already skips entries with `verify === false`, so no spec.md produced contract enters the gate.

`src/core/runtime/local.ts` and `src/core/runtime/managed.ts` are **unchanged**, satisfying requirement 5 (runtime-non-dependent) and D2 rationale.

`src/core/step/__tests__/design-spec-exempt-contract.test.ts` verifies:
- `chore`: spec.md absent from produced contracts; design.md / tasks.md present
- `bug-fix`: spec.md produced contract present with scaffold = `SPEC_TEMPLATE`

### D3 — `SPEC_EXEMPT_NOTE` replaces scaffold for exempt types

`src/templates/step-output-templates.ts` exports:
- `SPEC_EXEMPT_MARKER = "SPEC-EXEMPT"` (single source of truth)
- `SPEC_EXEMPT_NOTE`: non-empty, contains `SPEC_EXEMPT_MARKER`, states exemption reason, does not include an empty `## Requirements` scaffold, instructs downstream reviewers to treat as vacuously satisfied

`getOutputTemplates("design", slug, state)` branches on `isSpecRequired(state.request.type)` and returns `SPEC_EXEMPT_NOTE` for chore; `SPEC_TEMPLATE` is unchanged for spec-required types.

`src/templates/__tests__/step-output-templates.test.ts` tests chore / spec-change / new-feature template selection and SPEC_EXEMPT_NOTE content constraints.

### D4 — Downstream prompts recognize `SPEC_EXEMPT_MARKER`

- **spec-review-system.ts**: "Spec-Exempt Detection" section before semantic review; if `SPEC_EXEMPT_MARKER` is found, spec.md is vacuously satisfied and `findings: []` is instructed. Existing Requirement / Scenario / normative-keyword guidance is preserved for non-exempt types.
- **conformance-system.ts**: judgment item 3 conditionally checks for `SPEC_EXEMPT_MARKER` and treats spec.md as vacuously satisfied (conforms) when found.
- **design-system.ts**: Completion Checklist adds a `chore` branch instructing the agent to leave the pre-placed exemption note untouched; existing spec-change/new-feature and bug-fix/refactoring branches are unchanged.
- `SPEC_EXEMPT_MARKER` is imported in all three prompt modules from the single constant in `step-output-templates.ts`.

`src/prompts/__tests__/spec-exempt-prompt.test.ts` pins all three prompts for marker presence and key guidance text.

---

## Judgment Item 3: spec.md — Requirements Satisfied

### Requirement: Request type declares spec requirement as a declarative attribute

- `chore` → `isSpecRequired` returns `false` ✅
- `new-feature`, `spec-change`, `bug-fix`, `refactoring` → `true` ✅
- Unknown type → `true` (fail-closed) ✅
- Determination is type-driven at request creation, not agent runtime judgment ✅

### Requirement: Design step omits the spec.md output contract for spec-exempt types

- `chore` design contracts: no spec.md produced contract → gate cannot halt on spec.md ✅
- `bug-fix` design contracts: spec.md produced contract retained, scaffold-equality check active ✅
- Exemption applied in contract-building layer (`writes()`) → both runtimes see same contract list → same result ✅

### Requirement: Spec-exempt spec.md carries an explicit, machine-recognizable exemption note

- `SPEC_EXEMPT_NOTE` is non-empty and self-contained ✅
- Contains `SPEC_EXEMPT_MARKER` ✅
- States exemption reason in human-readable text ✅
- Does not include empty `## Requirements` scaffold ✅
- Instructs downstream reviewers not to flag absence as finding ✅
- Spec-required types still receive `SPEC_TEMPLATE` (unchanged) ✅

### Requirement: Downstream review treats an exempt spec.md as vacuously satisfied

- spec-review prompt: detects marker, sets `findings: []`, does not fabricate findings ✅
- conformance prompt: detects marker, treats as vacuously satisfied, does not flag Requirement absence as non-conformity ✅
- Same `SPEC_EXEMPT_MARKER` constant used in note and both prompts ✅

---

## Judgment Item 4: request.md — Acceptance Criteria

| Acceptance Criterion | Status | Evidence |
|----------------------|--------|----------|
| AC1: chore design with zero Requirements does not halt with STEP_OUTPUT_MISSING | ✅ | `design-spec-exempt-contract.test.ts`: chore produced contracts exclude spec.md |
| AC2: bug-fix with unmodified scaffold still halts (regression guard) | ✅ | `design-spec-exempt-contract.test.ts`: bug-fix spec.md contract present with scaffold detection |
| AC3: local / managed both produce same exemption result | ✅ | `spec-exempt-runtime.test.ts`: both runtimes inherit same contract list; ManagedRuntime tested with SPEC_EXEMPT_NOTE content producing no spec.md violation |
| AC4: spec-review (lightweight) and conformance pass on exempt spec.md without errors | ✅ | `spec-exempt-prompt.test.ts`: prompts contain marker guidance; no CLI-side spec.md parsing that could fail on zero Requirements |
| AC5: existing tests green / typecheck green / lint green / build green | ✅ | `verification-result.md`: all 4 phases passed (5791 tests, 428 test files) |

---

## Observations (non-blocking)

The Completion Checklist third branch in `design-system.ts` is labelled "bug-fix / refactoring 等（= spec.md 不要）". This label is slightly misleading for types where `isSpecRequired` returns `true`, but the branch is **pre-existing** (not introduced by this PR). The contract gate remains the authoritative enforcement mechanism for those types; the label does not weaken it. This observation is outside the scope of this change.
