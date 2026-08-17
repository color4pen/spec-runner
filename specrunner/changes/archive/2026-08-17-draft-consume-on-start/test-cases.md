# Test Cases: request lifecycle 一本化 — draft consume on start

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 11, should: 2, could: 0

---

### TC-001: directory-format draft is consumed on successful start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds > Scenario: directory-format draft is consumed on successful start

---

### TC-002: flat-format draft is consumed on successful start

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds > Scenario: flat-format draft is consumed on successful start

---

### TC-003: start failure before the materialization commit preserves the draft

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds > Scenario: start failure before the materialization commit preserves the draft

---

### TC-004: a git-tracked draft is warned about, not deleted

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds > Scenario: a git-tracked draft is warned about, not deleted

---

### TC-005: starting from a non-canonical request path does not consume that file

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Job start shall consume the canonical draft after the request.md materialization commit succeeds > Scenario: starting from a non-canonical request path does not consume that file

---

### TC-006: operator-edited request.md survives a subsequent resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Resume shall not recopy the draft into the change folder > Scenario: operator-edited request.md survives a subsequent resume

---

### TC-007: cancel --restore-draft recreates the draft from the worktree request.md

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cancel --restore-draft shall restore the draft from the change-folder request.md > Scenario: cancel --restore-draft recreates the draft from the worktree request.md

---

### TC-008: archiving a job whose draft was consumed at start is a no-op for draft cleanup

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive draft cleanup shall remain as a backstop > Scenario: archiving a job whose draft was consumed at start is a no-op for draft cleanup

---

### TC-009: consumeDraft is a no-op when no draft is present

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 (consumeDraft unit test: draft 不在 → no-op)

**GIVEN** no file exists at `specrunner/drafts/<slug>.md` and no directory at `specrunner/drafts/<slug>/`
**WHEN** `consumeDraft(repoRoot, slug, spawnFn)` is called
**THEN** no error is thrown
**AND** `fs.rm` is not called
**AND** `git ls-files` is not called

---

### TC-010: managed runtime push failure before consume preserves the draft

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs (managed commit 成功後 push 失敗の扱い)

**GIVEN** a canonical draft exists for the slug
**AND** the managed run-path spawnFn returns success for `commit` but non-zero exit for `git push`
**WHEN** the managed run-path materialize is invoked
**THEN** the materialize call rejects with an error
**AND** the canonical draft still exists on disk

---

### TC-011: inbox writeDraft → start path consumes the directory-format draft

**Category**: integration
**Priority**: should
**Source**: request.md > 要件 5 (inbox 経路の整合)

**GIVEN** inbox has written a directory-format draft to `specrunner/drafts/<slug>/request.md`
**AND** the draft is not tracked by git
**WHEN** job start is invoked via the inbox path and the materialization commit succeeds
**THEN** `specrunner/drafts/<slug>/` no longer exists in the repo root

---

### TC-012: recopyDraftToChangeFolder is absent from src/

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 (機械確認: `recopyDraftToChangeFolder` が repo 全体に 0 件)

Verification: `grep -r recopyDraftToChangeFolder src/` returns 0 matches (exit 1 from grep = no match = pass).

---

### TC-013: typecheck && test are green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 (全体検証: `typecheck && test` が green)

Verification: `bun run typecheck && bun test` exits 0.

---

## Result

```yaml
result: completed
total: 13
automated: 11
manual: 0
must: 11
should: 2
could: 0
blocked_reasons: []
```
