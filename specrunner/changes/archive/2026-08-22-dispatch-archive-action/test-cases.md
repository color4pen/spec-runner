# Test Cases: Actions dispatch に archive を追加し、merge 後の head branch 削除に耐える

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 15, should: 2, could: 1

---

### TC-001: action choices contain archive

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The dispatch workflow shall expose an archive action that delegates to the CLI > Scenario: action choices contain archive

---

### TC-002: archive branch delegates to the CLI only

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The dispatch workflow shall expose an archive action that delegates to the CLI > Scenario: archive branch delegates to the CLI only

---

### TC-003: existing start and resume dispatch behavior is unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The dispatch workflow shall expose an archive action that delegates to the CLI > Scenario: existing start and resume dispatch behavior is unchanged

---

### TC-004: post-merge resolution with the head branch deleted

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent > Scenario: post-merge resolution with the head branch deleted

---

### TC-005: record with a mismatched jobId is not resolved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent > Scenario: record with a mismatched jobId is not resolved

---

### TC-006: record with a mismatched issueNumber is not resolved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent > Scenario: record with a mismatched issueNumber is not resolved

---

### TC-007: an active change folder is not treated as an archive record

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent > Scenario: an active change folder is not treated as an archive record

---

### TC-008: local state takes priority over the archive record

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing resolution paths shall retain priority and fallback behavior > Scenario: local state takes priority over the archive record

---

### TC-009: pre-merge falls through to the closing PR path

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing resolution paths shall retain priority and fallback behavior > Scenario: pre-merge falls through to the closing PR path

---

### TC-010: neither path resolves a target

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Existing resolution paths shall retain priority and fallback behavior > Scenario: neither path resolves a target

---

### TC-011: fallback-resolved slug is seen as archive-recorded by the archive run

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The archive-record signal shall have a single definition > Scenario: fallback-resolved slug is seen as archive-recorded by the archive run

---

### TC-012: resolveArchivedSlugByJobId returns null when archive directory does not exist

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** a `cwd` where `specrunner/changes/archive/` does not exist (empty tmpdir)
**WHEN** `resolveArchivedSlugByJobId({ cwd, jobId: "any-id", issueNumber: 42 })` is called
**THEN** `null` is returned without throwing

---

### TC-013: resolveArchivedSlugByJobId receives the exact jobId and issueNumber from runArchiveFromIssue

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `runArchiveFromIssue` is invoked with `issueNumber: 42` and the completed marker resolves `jobId: "test-job-id"`, and local state lookup returns `JOB_NOT_FOUND`
**WHEN** the archive record fallback step executes
**THEN** `resolveArchivedSlugByJobId` is called with arguments containing `{ jobId: "test-job-id", issueNumber: 42 }`

---

### TC-014: archive record fallback emits a diagnostic line to stdout

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** local state lookup returns `JOB_NOT_FOUND` and `resolveArchivedSlugByJobId` returns `"my-slug"`
**WHEN** the fallback path is taken inside `runArchiveFromIssue`
**THEN** a line is written to stdout that identifies the resolution source as a base-borne archive record and includes the resolved slug `"my-slug"`

---

### TC-015: workflow block extraction failure surfaces diagnostic context in the error message

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** the `options:` block under `on.workflow_dispatch.inputs.action` cannot be located (e.g., simulated absent or renamed key in the raw YAML string)
**WHEN** the test helper attempts to extract the block and the assert runs
**THEN** the test fails with an error message that contains the reason for failure and the raw extracted (or empty) content — not a bare `undefined` or empty-string assertion

---

### TC-016: --with-merge path, resume, and attach existing tests remain green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07

verification phase: `bun run test` — `src/cli/__tests__/archive-from-issue.test.ts`（TC-017 / `--with-merge` 経路）、`src/cli/__tests__/attach.test.ts`、`src/cli/__tests__/resume-from-issue.test.ts` がいずれも無変更で pass すること

---

### TC-017: typecheck, test, and lint are all green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-07

verification phase: `bun run typecheck && bun run test && bun run lint` がすべて exit 0 で完了すること

---

### TC-018: changed files are confined to the specified scope

**Category**: gate
**Priority**: could
**Source**: tasks.md > T-07

verification phase: `git diff --stat origin/main` の結果が `.github/workflows/specrunner-dispatch.yml` / `src/core/archive/job-context.ts` / `src/cli/archive-from-issue.ts` / `src/cli/__tests__/archive-from-issue.test.ts` / 新規テスト 2 件（`tests/dispatch-workflow-archive-action.test.ts` / `src/core/archive/__tests__/archived-slug-by-job-id.test.ts`）/ `specrunner/changes/dispatch-archive-action/` 配下のみに収まっており、`package.json` の依存 3 種に差分が無いこと

---

## Result

```yaml
result: completed
total: 18
automated: 15
manual: 0
must: 15
should: 2
could: 1
blocked_reasons: []
```
