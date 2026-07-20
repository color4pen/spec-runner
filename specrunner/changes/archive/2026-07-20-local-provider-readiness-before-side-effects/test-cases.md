# Test Cases: Local provider readiness before side effects

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 12, should: 5, could: 0

---

### TC-001: Readiness failure on run leaves no side effects

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Local provider readiness is verified before any run/resume side effect > Scenario: readiness failure on run leaves no side effects

---

### TC-002: Readiness failure on resume mutates nothing

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Local provider readiness is verified before any run/resume side effect > Scenario: readiness failure on resume mutates nothing

---

### TC-003: Gate is load-bearing (breakage check)

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Local provider readiness is verified before any run/resume side effect > Scenario: the gate is load-bearing (breakage check)

---

### TC-004: Each failure kind produces a distinct message and prescription

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Readiness failures are classified into four distinguishable kinds > Scenario: each kind produces a distinct message and prescription

---

### TC-005: Auth prescriptions name only real commands

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Readiness failures are classified into four distinguishable kinds > Scenario: auth prescriptions name only real commands

---

### TC-006: Probe invoked exactly once per run/resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Readiness is checked exactly once per run/resume > Scenario: probe invoked once per run

---

### TC-007: Prescriptive first sentence, detail preserved underneath

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Raw provider errors and credential values are not exposed > Scenario: prescriptive first sentence, detail preserved underneath

---

### TC-008: CI reproduces success and each failure kind via injection

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Readiness verification uses an injectable seam requiring no real token > Scenario: CI reproduces success and each failure kind via injection

---

### TC-009: Managed gate is a no-op

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Managed runtime readiness and preflight are unchanged > Scenario: managed gate is a no-op

---

### TC-010: Port module has no import back-edges

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: Add the provider-readiness port types and seam method (Acceptance Criteria)

**GIVEN** `src/core/port/provider-readiness.ts` is implemented
**WHEN** its import graph is inspected
**THEN** it contains no imports from `core/runtime/` or `adapter/`, preserving the port layer boundary

---

### TC-011: LocalRuntime and ManagedRuntime remain assignable to RealRuntimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: Add the provider-readiness port types and seam method (Acceptance Criteria)

**GIVEN** `assertProviderReadiness` is added as a required method on `RealRuntimeStrategy`
**WHEN** the TypeScript compiler checks `LocalRuntime` and `ManagedRuntime` against `RealRuntimeStrategy`
**THEN** both are assignable without type error, confirming neither implementation was missed

---

### TC-012: classifyProviderReadiness returns null for the ready kind

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: Add the pure classifier, recovery-hint map, and error code (Acceptance Criteria)

**GIVEN** the `classifyProviderReadiness` function
**WHEN** called with `{ kind: "ready" }`
**THEN** it returns `null` (no error, gate passes)

---

### TC-013: PROVIDER_NOT_READY error code defaults to exit 1

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: Add the pure classifier, recovery-hint map, and error code

**GIVEN** `PROVIDER_NOT_READY` added to `ERROR_CODES` and absent from `EXIT_CODE_MAP`
**WHEN** the exit-code resolver looks up `PROVIDER_NOT_READY`
**THEN** it returns `1`, matching the `RUNTIME_PREREQ_MISSING` convention

---

### TC-014: Probe timeout is classified as unreachable, not auth failure

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: Add the real adapter-backed readiness probe (Acceptance Criteria) / design.md > D2

**GIVEN** a probe implementation that throws a network timeout while attempting an authenticated connection
**WHEN** the probe's result is classified
**THEN** the returned `ProviderReadinessResult` has `kind: "unreachable"` (never `auth-missing` or `auth-invalid`), ensuring a network blip cannot be misreported as bad credentials

---

### TC-015: Token value never appears in probe detail

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: Add the real adapter-backed readiness probe (Acceptance Criteria)

**GIVEN** a probe that encounters an auth error while a `CLAUDE_CODE_OAUTH_TOKEN` value is present in the environment
**WHEN** the probe produces its `ProviderReadinessResult`
**THEN** the `detail` field contains no substring equal to the token value

---

### TC-016: No RunResultContract JSON emitted on readiness failure

**Category**: integration
**Priority**: should
**Source**: design.md > D5 — Error surfacing and exit code / tasks.md > T-06 (Acceptance Criteria)

**GIVEN** `CommandRunner.execute()` with an injected not-ready probe for `run` or `resume`
**WHEN** the readiness gate catches the `SpecRunnerError` and returns exit code 1
**THEN** no `RunResultContract` JSON object is written to stdout (consistent with existing preflight failures that predate any job)

---

### TC-017: Kind-specific hint is printed to stderr on readiness failure

**Category**: integration
**Priority**: should
**Source**: design.md > D5 — Error surfacing and exit code / tasks.md > T-06

**GIVEN** `CommandRunner.execute()` with an injected not-ready probe returning any non-ready kind
**WHEN** the readiness gate handles the `SpecRunnerError`
**THEN** the matching `PROVIDER_READINESS_HINTS` entry is written to stderr prefixed with `"Hint: "`, and the prescriptive message is written via `logError`

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 12
should: 5
could: 0
blocked_reasons: []
```
