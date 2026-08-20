# Test Cases: job resume --from-issue

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 29, should: 3, could: 0

---

## Spec Scenario TCs

### TC-001: linked branch form resolves through the full chain

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: locate a resumable job from an issue number via marker and Development links > Scenario: linked branch form resolves through the full chain

### TC-002: linked PR head form resolves through the full chain

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: locate a resumable job from an issue number via marker and Development links > Scenario: linked PR head form resolves through the full chain

### TC-003: getIssue is never called during resolution

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the issue body MUST NOT be read on the resume-from-issue path > Scenario: getIssue is never called during resolution

### TC-004: newest escalation comment selects the jobId

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: the latest escalation marker wins when multiple are present > Scenario: newest escalation comment selects the jobId

### TC-005: issueNumber mismatch is rejected fail-closed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: confirm the target only by matching all three checkpoint identity fields > Scenario: issueNumber mismatch is rejected fail-closed

### TC-006: jobId mismatch is rejected fail-closed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: confirm the target only by matching all three checkpoint identity fields > Scenario: jobId mismatch is rejected fail-closed

### TC-007: multiple simultaneously-confirmed candidates are rejected fail-closed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: confirm the target only by matching all three checkpoint identity fields > Scenario: multiple simultaneously-confirmed candidates are rejected fail-closed

### TC-008: no marker present stops with no side effects

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: absent escalation marker stops with zero side effects > Scenario: no marker present

### TC-009: zero linked branches guides to job attach

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: absent Development links stop fail-closed and guide to manual attach > Scenario: zero linked branches guides to job attach

### TC-010: existing local state short-circuits to resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: local job state for the marker jobId skips rebind and resumes directly > Scenario: existing local state short-circuits to resume

### TC-011: rebind verification failure propagates unchanged

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: confirmed branch is rebound via the attach-resume policy then resumed > Scenario: rebind verification failure propagates unchanged

### TC-012: positional slug and --from-issue together is a usage error

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue is exclusive with the positional slug and orthogonal to --prompt/--detach > Scenario: positional slug and --from-issue together is a usage error

### TC-013: --from-issue combines with --detach

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --from-issue is exclusive with the positional slug and orthogonal to --prompt/--detach > Scenario: --from-issue combines with --detach

### TC-014: usage text documents --from-issue

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: usage text and guide reflect the --from-issue contract > Scenario: usage text documents --from-issue

---

## Non-Scenario Unit TCs

### TC-015: parseEscalationJobId round-trip with buildMarker

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `buildMarker("escalation", id)` output for an arbitrary valid jobId string `id`
**WHEN** `parseEscalationJobId` is called with that output as the body
**THEN** the returned value equals `id`

### TC-016: parseEscalationJobId returns null when no escalation marker is present

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** a comment body that contains no escalation marker (either empty, plain text, or only a `kind="completed"` marker)
**WHEN** `parseEscalationJobId` is called with that body
**THEN** `null` is returned

### TC-017: listIssueLinkedBranches unions linkedBranches and closedByPullRequestsReferences with deduplication

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** a GraphQL response where `linkedBranches` contains ref name `B1` and `closedByPullRequestsReferences` contains head names `B2` and `B1` (duplicate)
**WHEN** `listIssueLinkedBranches` is called
**THEN** the returned array is `["B1", "B2"]` (or `["B2", "B1"]`) with no duplicates and containing both sources

### TC-018: listIssueLinkedBranches throws GITHUB_API_ERROR on non-2xx HTTP response

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** the GitHub GraphQL endpoint returns a non-2xx HTTP status for the linked-branches query
**WHEN** `listIssueLinkedBranches` is called
**THEN** it throws a `SpecRunnerError` with code `GITHUB_API_ERROR` (does not silently return `[]`)

### TC-019: listIssueLinkedBranches throws GITHUB_API_ERROR on GraphQL errors field

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** the GitHub GraphQL endpoint returns HTTP 200 with a non-empty `errors` array in the response body
**WHEN** `listIssueLinkedBranches` is called
**THEN** it throws a `SpecRunnerError` with code `GITHUB_API_ERROR` (does not silently return `[]`)

### TC-020: RESUME_FROM_ISSUE_* error codes exist and factories return matching codes

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** the `ERROR_CODES` registry and the three factory functions: `resumeFromIssueNoMarkerError`, `resumeFromIssueNoLinkError`, `resumeFromIssueUnconfirmedError`
**WHEN** `ERROR_CODES` is inspected and each factory is called with sample arguments
**THEN** `RESUME_FROM_ISSUE_NO_MARKER`, `RESUME_FROM_ISSUE_NO_LINK`, and `RESUME_FROM_ISSUE_UNCONFIRMED` all exist in `ERROR_CODES`, and each factory returns an error whose `.code` matches the corresponding constant

### TC-021: resumeFromIssueNoLinkError hint references job attach --branch

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D6

**GIVEN** the `resumeFromIssueNoLinkError` factory
**WHEN** called with an issue number (e.g. `5`)
**THEN** the resulting error's message or hint string includes the text `job attach --branch`

### TC-022: resolver does not call getIssue in the CLI orchestrator path

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D5

**GIVEN** the CLI orchestrator (`runResumeFromIssue`) wired with a spy on the GitHub client's `getIssue` method, and a fully valid resumable issue scenario
**WHEN** `runResumeFromIssue` runs the full locator chain
**THEN** `getIssue` spy is never called

### TC-023: guide escalation topic includes --from-issue and job attach --branch guidance

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** the `guide.ts` escalation topic content
**WHEN** the topic is rendered (e.g. via `specrunner guide escalation` or direct string inspection)
**THEN** the rendered output includes `resume --from-issue` and `job attach --branch`

---

## Non-Scenario Unit TCs (should)

### TC-024: spoofed escalation marker with mismatched checkpoint is rejected by identity check

**Category**: unit
**Priority**: should
**Source**: design.md > D9

**GIVEN** an issue comment containing a fabricated escalation marker for jobId `J-fake`
**AND** the only Development-linked branch has a checkpoint where `state.jobId` is `J-real` (not `J-fake`)
**WHEN** `resolveResumeBranchFromIssue` runs using `J-fake` as the target jobId
**THEN** the command stops with `RESUME_FROM_ISSUE_UNCONFIRMED` (the spoofed marker fails identity confirmation because no checkpoint matches `J-fake`)

### TC-025: unreadable candidate branches are skipped without blocking a matching candidate

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-04

**GIVEN** two Development-linked branches: `B-broken` (fetch or state.json parse fails) and `B-good` (checkpoint matches all three identity fields)
**WHEN** `resolveResumeBranchFromIssue` runs
**THEN** `B-broken` is silently skipped (recorded as non-matching) and `B-good` is confirmed as the single result

### TC-026: listIssueLinkedBranches returns empty array when issue has no linked branches or PRs

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** a GraphQL response where both `linkedBranches` and `closedByPullRequestsReferences` have empty node lists
**WHEN** `listIssueLinkedBranches` is called
**THEN** the returned array is `[]`

---

## Gate TCs

### TC-027: GitHubClient port shape is unchanged; existing typed mocks typecheck

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01 / design.md > D2

`bun run typecheck` — verifies that `GitHubClient` interface in `src/kernel/github-client.ts` has no new required members, so all existing `: GitHubClient` typed mock factories compile without modification.

### TC-028: no process.cwd() in src/cli/resume-from-issue.ts

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D7

`grep -rn "process.cwd(" src/cli/resume-from-issue.ts` — must return zero matches.

### TC-029: src/core/issue-target/ does not import cli/ or adapter/

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D1

`tests/unit/architecture/module-boundary.test.ts` — TC-001 / B-1 assertions must remain green with the new `resume.ts` file present.

### TC-030: bun run typecheck green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

`bun run typecheck`

### TC-031: bun run test green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08

`bun run test`

### TC-032: tests/unit/architecture/ green with no new allowlist entries

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-08 / design.md > Constraints

`bun run test tests/unit/architecture/` — CWD ratchet, module-boundary TC-001, and B-1 must all pass; `arch-allowlist.ts` must have no new entries added.

## Result
```yaml
result: completed
total: 32
automated: 25
manual: 0
must: 29
should: 3
could: 0
blocked_reasons: []
```
