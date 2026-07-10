# Test Cases: write-scope-guard-redo

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 11
- **Manual**: 6
- **Priority**: must: 10, should: 6, could: 1

---

### TC-FW-01: Out-of-workspace absolute Write is denied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent denies Edit / Write outside the workspace > Scenario: absolute out-of-workspace Write is denied

---

### TC-FW-02: Relative path escaping the workspace is denied

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step agent denies Edit / Write outside the workspace > Scenario: relative path escaping the workspace is denied

---

### TC-FW-03: In-workspace Edit is allowed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: In-workspace writes, non-write tools, and malformed input remain allowed > Scenario: in-workspace Edit is allowed

---

### TC-FW-04: Non-write tools are allowed regardless of path

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: In-workspace writes, non-write tools, and malformed input remain allowed > Scenario: non-write tools are allowed regardless of path

---

### TC-FW-05: Malformed file_path on Write is allowed

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: In-workspace writes, non-write tools, and malformed input remain allowed > Scenario: malformed file_path is allowed

---

### TC-FW-06: Step-agent query options carry the measured `default` configuration

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step-agent query options carry the measured `default` configuration > Scenario: options set default mode, exclude Edit/Write, carry the guard; spec.md > Requirement: The report_result MCP tool is pre-approved when configured > Scenario: no MCP entry when no report tool is configured; spec.md > Requirement: The dangerouslyDisableSandbox escape hatch is disabled > Scenario: sandbox settings disable unsandboxed commands

---

### TC-FW-07: Report tool MCP name is added to allowedTools when configured

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The report_result MCP tool is pre-approved when configured > Scenario: report tool name is pre-approved when configured

---

### TC-FW-08: canUseTool guard propagates to follow-up turns via options spread

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Step-agent query options carry the measured `default` configuration > Scenario: the guard propagates to follow-up turns

---

### TC-FW-09: Probe script exists and raw execution log is recorded in design.md

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: A runnable probe exists and its raw log is recorded in design.md > Scenario: probe script exists and its log is recorded

---

### TC-FW-10: src/adapter/** is present in cross-boundary-invariants reviewer paths

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: cross-boundary-invariants covers the adapter layer > Scenario: adapter path is in the reviewer paths

---

### TC-FW-11: One-shot options remain bypassPermissions with no guard or sandbox

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: One-shot, LocalRuntime.query, and codex paths are unchanged > Scenario: one-shot options carry no guard

---

### TC-FW-12: createWorkspaceToolGuard is exported and typed as CanUseTool

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `agent-runner.ts` exports `createWorkspaceToolGuard(cwd: string)` with its return type declared as `CanUseTool` (imported from `@anthropic-ai/claude-agent-sdk`)
**WHEN** `bun run typecheck` is executed
**THEN** no type error is emitted, confirming the return type conforms to `CanUseTool`

---

### TC-FW-13: disallowedTools remains ["Agent", "Task"] in step-agent query options

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** the step-agent runner with the new query options, configured with any policy
**WHEN** query options are captured via an injected `_queryFn`
**THEN** `queryOptions.disallowedTools` equals `["Agent", "Task"]` exactly and is unmodified from the pre-change value

---

### TC-FW-14: sandbox.network, denyRead, and allowRead remain unset

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `buildWorkspaceSandbox(cwd)` is called with any `cwd`
**WHEN** the returned sandbox settings object is inspected
**THEN** `sandbox.network` is `undefined`, `denyRead` is `undefined`, and `allowRead` is `undefined`

---

### TC-FW-15: TC-023 update is bounded to exactly two assertion lines

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria / design.md > D7

**GIVEN** the diff of `tests/unit/adapter/claude-code/agent-runner.test.ts` after the change is applied
**WHEN** the changed lines within the TC-023 options case (`query() is called with allowedTools, permissionMode, and model`) are counted
**THEN** exactly two assertion lines changed — the `allowedTools` expectation (updated to `["Read","Bash","Grep","Glob"]`) and the `permissionMode` expectation (updated to `"default"`) — and every other assertion and test case in the file is unedited

---

### TC-FW-16: Probe file is excluded from all verification gate globs

**Category**: manual
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-04 Acceptance Criteria

**GIVEN** `scripts/probes/write-scope-guard-probe.ts` exists in the repository
**WHEN** `tsconfig.json` include paths, eslint config globs, vitest config include patterns, and tsup entry point are inspected
**THEN** none of those patterns match the probe file path, confirming it does not enter build, typecheck, lint, or test gates

---

### TC-FW-17: typecheck and test pass green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-09 Acceptance Criteria

**GIVEN** all changes (T-01 through T-08) applied on the branch
**WHEN** `bun run typecheck && bun run test` is executed
**THEN** both commands exit with code 0, TC-FW-01..TC-FW-13 are green, and the one-shot / `LocalRuntime.query` / codex paths remain behaviorally unchanged

---

## Result

```yaml
result: completed
total: 17
automated: 11
manual: 6
must: 10
should: 6
could: 1
blocked_reasons: []
```
