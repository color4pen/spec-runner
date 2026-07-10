# Test Cases: claude-code adapter Edit / Write workspace write scope

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 10
- **Manual**: 2
- **Priority**: must: 9, should: 3, could: 0

---

### TC-001: absolute out-of-workspace Write is denied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent denies Edit / Write outside the workspace > Scenario: absolute out-of-workspace Write is denied

---

### TC-002: relative path escaping the workspace is denied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent denies Edit / Write outside the workspace > Scenario: relative path escaping the workspace is denied

---

### TC-003: in-workspace Edit is allowed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: In-workspace writes and all other tools remain allowed > Scenario: in-workspace Edit is allowed

---

### TC-004: non-write tools are allowed regardless of path

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: In-workspace writes and all other tools remain allowed > Scenario: non-write tools are allowed regardless of path

---

### TC-005: step-agent query options include the guard and correct permission mode

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step-agent query options carry the guard and a prompt-free permission mode > Scenario: query options include the guard

---

### TC-006: guard propagates to follow-up turns via queryOptions spread

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Step-agent query options carry the guard and a prompt-free permission mode > Scenario: guard propagates to follow-up turns

---

### TC-007: sandbox settings disable unsandboxed commands

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The dangerouslyDisableSandbox escape hatch is disabled > Scenario: sandbox settings disable unsandboxed commands

---

### TC-008: one-shot query options carry no guard

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: One-shot and codex paths are unchanged > Scenario: one-shot options carry no guard

---

### TC-009: missing or non-string file_path is treated as allow

**Category**: unit
**Priority**: should
**Source**: design.md > D6: Path-containment semantics / tasks.md > T-02

**GIVEN** a workspace guard built for working directory `cwd`
**WHEN** it is consulted for an `Edit` or `Write` tool whose `input.file_path` is absent (`undefined`), `null`, or a non-string value
**THEN** it returns `{ behavior: "allow" }` without synthesizing an error

---

### TC-010: file_path exactly equal to cwd is treated as in-workspace

**Category**: unit
**Priority**: should
**Source**: design.md > D6: Path-containment semantics

**GIVEN** a workspace guard built for working directory `cwd`
**WHEN** it is consulted for a `Write` tool whose `file_path` is exactly `cwd` (resolved relative path is `""`)
**THEN** it returns `{ behavior: "allow" }`

---

### TC-011: guard return type passes typecheck

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria / tasks.md > T-08

**GIVEN** `createWorkspaceToolGuard` is implemented and exported from `agent-runner.ts`
**WHEN** `bun run typecheck` is executed
**THEN** it exits with code 0 — the function signature `(toolName, input, opts) => Promise<PermissionResult>` is assignable to the SDK `CanUseTool` type without error

---

### TC-012: existing tests remain unmodified and green; Branch B edit is bounded

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** the implementation is complete and the empirical branch (A or B) is determined
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** the full suite exits green
**AND** under Branch A: no existing test file is modified
**AND** under Branch B: exactly one assertion in `agent-runner.test.ts` (the TC-023 `permissionMode === "bypassPermissions"` line) is updated to the newly shipped mode; all other existing assertions in all other test files remain unedited

---

## Result

```yaml
result: completed
total: 12
automated: 10
manual: 2
must: 9
should: 3
could: 0
blocked_reasons: []
```
