# Test Cases: doctor-reads-project-config

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 9
- **Manual**: 1
- **Priority**: must: 8, should: 2, could: 0

---

### TC-001: project-local designLayer.enabled overlays user-global config

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL run all checks against project-local overlay config > Scenario: project-local designLayer.enabled overlays user-global config

---

### TC-002: project-local runtime key overlays user-global config

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL run all checks against project-local overlay config > Scenario: project-local runtime key overlays user-global config

---

### TC-003: outside a git repo — falls back to user-global only

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL run all checks against project-local overlay config > Scenario: outside a git repo — falls back to user-global only

---

### TC-004: no config file — configLoadError propagates

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor SHALL run all checks against project-local overlay config > Scenario: no config file — configLoadError propagates

---

### TC-005: project-local enables designLayer — aozu binary absent → fail

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: aozu-cli check SHALL verify binary existence when designLayer.enabled is true in project-local config > Scenario: project-local enables designLayer — aozu binary absent → fail

---

### TC-006: project-local enables designLayer — aozu binary present → pass

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: aozu-cli check SHALL verify binary existence when designLayer.enabled is true in project-local config > Scenario: project-local enables designLayer — aozu binary present → pass

---

### TC-007: designLayer disabled (default) — aozu check passes without binary check

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: aozu-cli check SHALL verify binary existence when designLayer.enabled is true in project-local config > Scenario: designLayer disabled (default) — aozu check passes without binary check

---

### TC-008: custom designLayer.command is used in aozu-cli binary invocation

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a DoctorContext where `config.get("designLayer.enabled")` returns `true`
**And** `config.get("designLayer.command")` returns `"my-aozu"`
**And** `execFile` resolves successfully
**WHEN** the `aozu-cli` check runs
**THEN** `execFile` is called with the command `"my-aozu"` (not the default `"aozu"`)
**And** the check returns `status: "pass"` with a message referencing `"my-aozu"`

---

### TC-009: malformed project-local config degrades gracefully via configLoadError

**Category**: integration
**Priority**: should
**Source**: design.md > D2

**GIVEN** the project-local `.specrunner/config.json` contains malformed JSON
**And** `loadConfigWithOverlay` throws a `SpecRunnerError` with `CONFIG_INVALID`
**WHEN** `runDoctor` is executed
**THEN** the thrown error is captured in `configLoadError`
**And** `buildDoctorConfig` receives the error
**And** `runDoctor` returns exit code 1 (not an unhandled crash)

---

### TC-010: build and quality gate passes after the change

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** the implementation of T-01 through T-03 is complete
**WHEN** `bun run build && bun run typecheck && bun run test && bun run lint` is executed
**THEN** all four commands exit 0 with no errors or lint violations

---

## Result

```yaml
result: completed
total: 10
automated: 9
manual: 1
must: 8
should: 2
could: 0
blocked_reasons: []
```
