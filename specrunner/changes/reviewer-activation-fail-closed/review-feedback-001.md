# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/core/step/executor.ts` | Duplicated comment: the fail-closed rationale appears verbatim both above and inside the `if (step.activation)` block (lines 217–228 vs 231–236). | Remove the inner comment block; the outer one is the natural home. | no |
| 2 | low | maintainability | `tests/unit/step/executor-activation.test.ts` | Inline comment at line 441 says "short-circuits at requestTypes match" but the actual short-circuit is `changedFilesDerivable === false` set from `canDeriveChangedFiles()`. Assertion is correct; explanation is imprecise. | Correct comment to: "not called because canDeriveChangedFiles() returns false, skipping listChangedFiles call". | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.7

## Summary

4-file implementation (activation.ts, executor.ts, managed.ts, runtime-strategy.ts) + 2 test file extensions. All 11 must-priority and 6 should-priority test cases from test-cases.md are covered. Verification passed (415 test files, 5611 tests, typecheck, build, lint all green).

**Correctness**: The core logic is exact. `changedFilesDerivable = deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false` correctly encodes the three-way "absent → derivable, true → derivable, false → non-derivable" contract. The `evaluateActivation` guard `facts.changedFilesDerivable === false` fires only inside `if (cond.paths)` and after the `requestTypes` check, preserving AND semantics and requestTypes priority. The `listChangedFiles` short-circuit is structurally parallel to scope-check.

**Security**: The defect being fixed (silent skip of security reviewers on managed runtime) is resolved. The fail-closed direction (activate, not escalate) is well-reasoned: reviewers see a superset of what the paths-scoped run would have covered, which is strictly safer than skipping.

**Architecture**: D2 (optional field defaulting to derivable) correctly isolates the change to the activation gate and leaves `computeInvalidations` byte-for-byte unaffected. D3 (short-circuit `listChangedFiles`) mirrors scope-check structurally. D4 (doc reframe) eliminates the contradicting "MUST NOT reference this predicate" instruction. The residual "fail-safe" comments in `pipeline.ts` (lines 721, 749) are for the out-of-scope reviewer-invalidation path and are intentionally preserved.

**Testing**: TC-001 through TC-017 all verified. Local-runtime regression pair (paths match / no-match) is locked by explicit tests. The only two non-blocking issues are cosmetic comment problems that do not affect runtime behavior.

