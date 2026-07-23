# Implementation Notes: spec-fixer tasks.md writable

## Tests whose expectations were updated

### `src/core/step/__tests__/spec-review-fixer-routing.test.ts`

- **`makeCanonScope()` fixture**: `spec-fixer` entry updated from `{SPEC_MD, DESIGN_MD}` to `{SPEC_MD, DESIGN_MD, TASKS_MD}` to mirror the real `buildCanonWriteScope` after the write-set expansion.
- **TC-013 first sub-test** ("fixable finding on tasks.md ... escalates"): expectation changed from `"escalation"` to `"needs-fix"`. tasks.md is now routable to spec-fixer.
- **TC-013 describe title**: updated to "routes to spec-fixer" to reflect new behavior.
- **TC-013 new sub-test**: added `deriveStepCompletion` call with a fixable finding on test-cases.md asserting `verdict === "escalation"` and `escalationReason` contains `CANON_FINDING_ESCALATION` and references `test-cases.md` (preserved boundary).

### `tests/unit/core/step/canon-write-scope.test.ts`

- **TC-019** ("spec-fixer writable は {spec.md, design.md}"): replaced the assertion that `tasks.md` is excluded from spec-fixer's writable set with a positive assertion that it IS included. `request.md` and `test-cases.md` exclusion assertions are preserved.
- **TC-029 spec-fixer sub-test title**: updated from `{spec.md, design.md}` to `{spec.md, design.md, tasks.md}`. The assertion body is dynamic (compares `writes() ∩ canonPaths` to D5 map entry) and stays green automatically.

### `tests/unit/core/step/judge-verdict-canon.test.ts`

- **`makeFullCanonScope()` fixture**: `spec-fixer` entry updated from `{spec.md, design.md}` to `{spec.md, design.md, tasks.md}` to mirror the real `buildCanonWriteScope` after the write-set expansion.
- **TC-006 second sub-test** ("tasks.md fixable fixTarget:spec-fixer → escalation"): expectation changed from `"escalation"` to `"needs-fix:spec-fixer"`. spec-fixer can now write tasks.md, so the finding routes to spec-fixer instead of escalating.

### `tests/unit/step/step-io-contracts.test.ts`

- **SpecFixerStep writes() test**: strengthened to also assert `${folder}/tasks.md` is in the declared output paths, pinning the new writable path.

### `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts`（operator 追補）

- **TC-015 追加**: design.md D3 Consequence が約束した FAST-profile の pin テスト。`FAST_TRANSITIONS` に `needs-fix:spec-fixer` 行が無いこと（escalate fallback 契約）と、`STANDARD_TRANSITIONS` には conformance の当該行があること（対照）を固定する。
