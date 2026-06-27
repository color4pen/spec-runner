# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Clarity | tasks.md / design.md | `changedFilesDerivable: true` + `changedFiles: []` (no runtime strategy) still returns `activated: false` with "no changed files matched paths". This is correct behavior (verified) but the tasks don't include a test for the `deps.runtimeStrategy === undefined` path. | No spec change required; implementer may add this edge-case test to T-06 as a safety net if desired. |

## Review Notes

### Code verification

All code references in request.md were verified against the worktree:

- `executor.ts:221-233` — confirmed: activation gate calls `listChangedFiles` directly, no `canDeriveChangedFiles()` check.
- `managed.ts:514` — confirmed: `listChangedFiles` returns `[]` unconditionally.
- `managed.ts:527` — confirmed: `canDeriveChangedFiles()` returns `false`.
- `managed.ts:506-512` — confirmed: comment frames `[]` as "fail-safe: under-activate rather than evaluate against stale or fabricated data".
- `scope-check.ts:49` — confirmed: checks `canDeriveChangedFiles?.() === false` first, short-circuits to `synthesizeScopeUnverifiableFinding`.
- `runtime-strategy.ts:385-387` — confirmed: comment says "Reviewer activation consumers MUST NOT reference this predicate".
- `reviewer-status.ts:205` — confirmed: `computeInvalidations` calls `evaluateActivation` without `changedFilesDerivable`, so the optional-default-derivable design correctly leaves this call site unchanged.

### Design soundness

**D1 (activate, not skip)** is the right call. Escalation on every managed run with a `paths` reviewer would be operationally untenable for a condition that is structural to the managed runtime (not an anomaly). Over-activation is strictly safer than silent skip, and the reviewer's purpose-criteria already focus it regardless of file scope.

**D2 (`changedFilesDerivable?: boolean` on `ActivationFacts`)** is the cleanest extension point: optional with default "derivable" keeps `computeInvalidations` byte-for-byte unchanged and confines the behavior change to the executor → `evaluateActivation` path alone.

**D3 (short-circuit `listChangedFiles`)** mirrors `scope-check.ts` and makes the "not consulted" property directly testable (spy on `listChangedFiles`, assert not called).

**D4 (reframe docs)** is essential. The existing "MUST NOT reference this predicate" instruction in `runtime-strategy.ts:385-387` would cause regression if read by a future contributor. Correcting it in the same change is correct.

### Security posture

This change strictly improves the security posture: it converts a fail-open path (security reviewer silently dropped on managed runtime) to fail-closed (reviewer runs against the full change). No new attack surface, no user-facing input handling, no authentication changes. The OWASP security-misconfiguration risk (misconfigured pipeline silently omitting security review) is the exact defect being fixed.

### Acceptance criteria completeness

All five acceptance criteria from request.md map directly to testable behaviors in T-05 and T-06. The `typecheck && test` gate in T-07 closes the loop. The `skipReason` distinction requirement is satisfied by the non-derivable case producing activation (no skip at all) rather than a misleading "no changed files matched paths" skip.

### ADR coverage

The request marks `adr: true`. The design documents the reversal of a previously deliberate decision (managed `[]` = "under-activate is fail-safe") and the correction of the port-level `canDeriveChangedFiles` consumer mandate. This is precisely the kind of decision that warrants an ADR — the subject matter is clear and the rationale is fully documented in design.md D4.
