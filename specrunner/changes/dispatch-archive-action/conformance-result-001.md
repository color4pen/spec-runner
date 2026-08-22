# Conformance Result — dispatch-archive-action — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| # | Item | Result |
|---|------|--------|
| 1 | Workflow `action` choices include `archive` | ✓ |
| 2 | Archive branch is a single CLI call (`job archive --from-issue "$ISSUE"`) | ✓ |
| 3 | Workflow archive branch contains no `--with-merge` | ✓ |
| 4 | Workflow yaml contains no `--with-merge` anywhere | ✓ |
| 5 | Start / resume branches unchanged | ✓ |
| 6 | `isArchiveRecordDir` exported from `job-context.ts` | ✓ |
| 7 | `resolveArchivedSlugByJobId` exported from `job-context.ts` | ✓ |
| 8 | `resolveArchiveJobContext` uses `isArchiveRecordDir` (single definition) | ✓ |
| 9 | `job-context.ts` import set unchanged | ✓ |
| 10 | `archive-from-issue.ts` resolution order: local state → archive record → closing PR | ✓ |
| 11 | Fallback hit → skip `resolveArchiveBranchFromIssue` / `runAttachVerification`, go direct to `runArchive` | ✓ |
| 12 | Fallback hit → `logInfo` diagnostic line emitted | ✓ |
| 13 | Fallback `null` → closing PR + attach path executed unchanged | ✓ |
| 14 | General contracts (`resolveCheckpointSlug`, `loadStateByJobId`, `runAttachVerification`, `plain-archive.ts`, `merge-completion.ts`) — no diff | ✓ |
| 15 | `dispatch-workflow-archive-action.test.ts` covers TC-001/TC-002/TC-003 with indent-scope extraction (no yaml parser dependency) | ✓ |
| 16 | `archived-slug-by-job-id.test.ts` covers jobId mismatch / issueNumber mismatch / absent issueNumber / active folder / absent archive dir / match / archiveRecorded consistency | ✓ |
| 17 | `archive-from-issue.test.ts` covers: post-merge fallback hit, local state priority, pre-merge closing-PR fallthrough, ARCHIVE_FROM_ISSUE_UNCONFIRMED, exact args to `resolveArchivedSlugByJobId` | ✓ |
| 18 | `--with-merge` path / resume / attach existing tests: no changes, all green | ✓ |
| 19 | Changed files confined to expected scope (6 files outside change folder) | ✓ |
| 20 | `package.json` dependencies unchanged | ✓ |
| 21 | `typecheck && test && lint`: all phases passed (12 157 tests, 1 skipped, 0 failed) | ✓ |

### Requirement: The dispatch workflow shall expose an archive action that delegates to the CLI

- **Scenario: action choices contain archive** — `dispatch-workflow-archive-action.test.ts` TC-001 extracts `on.workflow_dispatch.inputs.action.options` by indent scope and asserts `start`, `resume`, `archive` all present. Workflow yaml confirmed at lines 31–35. ✓
- **Scenario: archive branch delegates to the CLI only** — TC-002 extracts the `elif [ "$ACTION" = "archive" ]` branch body, asserts exactly 1 non-empty non-comment line containing `job archive`, `--from-issue`, `"$ISSUE"`, no `--with-merge`. Workflow yaml lines 136–137 confirmed. ✓
- **Scenario: existing start and resume dispatch behavior is unchanged** — TC-003 asserts resume branch contains `job resume --from-issue` and else branch contains `job start --from-issue`. No diff on those branches. ✓

### Requirement: Archive-from-issue shall resolve the slug from a base-borne archive record when local state is absent

- **Scenario: post-merge resolution with the head branch deleted** — `archive-from-issue.test.ts` post-merge describe: `resolveArchiveBranchFromIssue` NOT called, `runAttachVerification` NOT called, `runArchive` called with `"archived-slug"`, returns 0. ✓
- **Scenario: record with a mismatched jobId is not resolved** — `archived-slug-by-job-id.test.ts` TC-001: different jobId → `null`. ✓
- **Scenario: record with a mismatched issueNumber is not resolved** — TC-002 (issueNumber mismatch) and TC-003 (absent issueNumber field) → `null`. ✓
- **Scenario: an active change folder is not treated as an archive record** — TC-004: same jobId + issueNumber in `specrunner/changes/<slug>/` (not `archive/`) → `null`. ✓

### Requirement: Existing resolution paths shall retain priority and fallback behavior

- **Scenario: local state takes priority over the archive record** — TC-018: `loadStateByJobId` returns local state → `resolveArchivedSlugByJobId` NOT called, `resolveArchiveBranchFromIssue` NOT called, `runArchive` called with local slug. ✓
- **Scenario: pre-merge falls through to the closing PR path** — TC-019: `loadStateByJobId` raises `JOB_NOT_FOUND`, `resolveArchivedSlugByJobId` returns `null` → `resolveArchiveBranchFromIssue` called, `runAttachVerification` called. ✓
- **Scenario: neither path resolves a target** — fallback-miss + closing PR describe: `resolveArchivedSlugByJobId` `null`, `resolveArchiveBranchFromIssue` throws `archiveFromIssueUnconfirmedError` → exit code 2 (`ARCHIVE_FROM_ISSUE_UNCONFIRMED`). ✓

### Requirement: The archive-record signal shall have a single definition

- **Scenario: fallback-resolved slug is seen as archive-recorded by the archive run** — `archived-slug-by-job-id.test.ts` TC-007: same archive fixture → `resolveArchivedSlugByJobId` returns slug AND `resolveArchiveJobContext` returns `archiveRecorded: true`. `resolveArchiveJobContext` uses `isArchiveRecordDir` (job-context.ts line 128). ✓

### Request acceptance criteria

| Criterion | Status |
|-----------|--------|
| `workflow_dispatch` action choices include `archive`; archive branch is CLI call only — configuration test | ✓ |
| local jobId miss + archive record (jobId + issueNumber) → slug resolved, skip attach/fetch, `runArchive`, exit 0 — test (head branch deleted scenario) | ✓ |
| jobId or issueNumber mismatch → not resolved; archive record absent + closing PR fails → `ARCHIVE_FROM_ISSUE_UNCONFIRMED` — tests | ✓ |
| merge 前（archive record absent from base, PR open）→ closing PR + `runAttachVerification` path — test | ✓ |
| archive record 作成後 merge 前 is `awaiting-archive` (#1051 existing tests green) | ✓ — 12 157 passed |
| `--with-merge` path / resume / attach existing tests green | ✓ — no diff on those files, all green |
| `runArchiveFromIssue` resolution-order pin tests updated to new 3-stage contract (TC-018 / TC-019 only) | ✓ |
| `typecheck && test` green | ✓ |

## 検証できなかった項目

None

## Findings 詳細

None — no normative violations found.

**Plan divergences (non-findings)**:

- TC-014 (stdout diagnostic line — "should" priority) has no dedicated test assertion. The implementation emits `logInfo` (archive-from-issue.ts line 126). TC-014 is "should" in test-cases.md and has no normative `SHALL`/`MUST` in spec.md.
- `LocalRuntime#setupWorkspace` not-called is not explicitly asserted in the post-merge test block. The structural guarantee is that `LocalRuntime` is only constructed inside the `resolveArchiveBranchFromIssue` branch (archive-from-issue.ts line 160), which is verified NOT to be entered. tasks.md acceptance criteria notes "mock でカバー" for this item.
