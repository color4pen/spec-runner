# Conformance Result: issue-target-resume-from-issue — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Request Acceptance Criteria

| # | Criterion | Evidence |
|---|-----------|----------|
| AC-1 | Full chain (marker → jobId → Dev-link enumeration → 3-field identity → rebind → resume) pinned for linked-branch form and linked-PR-head form | TC-001/TC-002 in `resume.test.ts`; TC-001/TC-002 block in `resume-from-issue.test.ts` |
| AC-2 | `state.issueNumber` mismatch and `state.jobId` mismatch each fail-closed | TC-005 (issueNumber) + TC-006 (jobId) in `resume.test.ts` |
| AC-3 | Zero Development links → `RESUME_FROM_ISSUE_NO_LINK` with `job attach --branch` guidance; marker absent → `RESUME_FROM_ISSUE_NO_MARKER` with zero side effects | TC-009 + TC-008 in `resume.test.ts` |
| AC-4 | Multiple markers → latest `createdAt` selected | TC-004 in `resume.test.ts` |
| AC-5 | `getIssue` never called on resolution path | TC-003 in `resume.test.ts`; TC-022 in `resume-from-issue.test.ts` |
| AC-6 | Local jobId state present → rebind skipped, resumes directly | TC-010 in `resume-from-issue.test.ts` |
| AC-7 | Positional slug + `--from-issue` → usage error (ARG_ERROR 2) | TC-012 in `resume-from-issue.test.ts` |
| AC-8 | Existing attach / resume / inbox tests unchanged and green | All 796 test files pass; no existing test files modified |
| AC-9 | `tests/unit/architecture/` green; no new allowlist entries | `arch-allowlist.ts` unchanged (git diff: no changes); all architecture tests pass |
| AC-10 | `bun run typecheck` / `bun run test` green | typecheck: 0 errors; test: 11903 passed, 0 failed |

### Spec Requirements

**R1 — locate a resumable job via marker and Development links**

`resolveEscalationJobId` scans comments for escalation markers; `resolveResumeBranchFromIssue` calls `listIssueLinkedBranches` (which queries both `linkedBranches` and `closedByPullRequestsReferences`) and applies the 3-field identity check. Both linked-branch and linked-PR-head forms confirmed by TC-001/TC-002 in `resume.test.ts` and TC-017 in `github-client-dev-links.test.ts`.

**R2 — issue body MUST NOT be read**

`listIssueLinkedBranches` uses `issue(number: $number)` — does not call `getIssue`. The `IssueResumeClient` narrow port excludes `getIssue`. TC-003 and TC-022 pin this with a spy.

**R3 — latest escalation marker wins**

`candidates.sort((a, b) => a.createdAt < b.createdAt ? 1 : …)` descending sort, `candidates[0]` returned. TC-004 pins this with three comments at different timestamps.

**R4 — confirm target via all three checkpoint identity fields**

Three-field guard: `identity.jobId !== jobId || identity.issueNumber !== issueNumber || identity.branch !== branch`. All three must match. TC-005/TC-006/TC-026 pin individual field mismatches; TC-007 pins multiple simultaneous full-match rejection.

**R5 — absent marker stops with zero side effects**

`resumeFromIssueNoMarkerError` thrown from `resolveEscalationJobId` before any git or GitHub write. TC-008 pins both empty-list and no-escalation-comment cases.

**R6 — absent Development links stop fail-closed with `job attach --branch` guidance**

`resumeFromIssueNoLinkError` hint: `"Use 'specrunner job attach --branch <branch>' then 'specrunner job resume <slug>' to resume manually."` TC-009 pins both the error code and hint text.

**R7 — local jobId state skips rebind and resumes directly**

`loadStateByJobId` checked immediately after `resolveEscalationJobId`. When found, skips `resolveResumeBranchFromIssue`, `runAttachVerification`, and `setupWorkspace`. TC-010 pins all three skips.

**R8 — confirmed branch rebound via attach-resume policy**

`runAttachVerification` → `LocalRuntime.setupWorkspace` → `runResumeCore`. Verification failure propagated unchanged. TC-011 pins that `runResumeCore` is NOT called when `runAttachVerification` rejects.

**R9 — `--from-issue` exclusive with positional slug; orthogonal to `--prompt`/`--detach`**

- Positional exclusivity: guard in command-registry.ts → `logError("mutually exclusive")` + `process.exit(ARG_ERROR)`. TC-012 pins.
- `--detach`: parent resolves branch then `detachSelf`; rebind/resume deferred to child. TC-013 pins.
- `--prompt` / `--from` / `--force` / `--apply-canon` / `--adopt-commits`: all passed through to `runResumeFromIssue` via `opts`.

**R10 — usage text and guide reflect `--from-issue` contract**

`JOB_RESUME_USAGE` documents `--from-issue <n>`, locator resolution rules, rebind inclusion, positional exclusivity, `job attach --branch` guidance. TC-014 pins three content assertions.

`guide.ts` escalation topic section "4. issue 番号からの再開 (--from-issue)" contains `specrunner job resume --from-issue <n>` and `specrunner job attach --branch <branch>`. TC-023 pins both.

### Architecture Invariants

| Invariant | Status |
|-----------|--------|
| B-1: `core/issue-target/` does not import `cli/` or `adapter/` | `resume.ts` imports only kernel/port, git/checkpoint-ref, errors, logger, notify — confirmed by grep ✅ |
| CWD ratchet: no new `process.cwd()` in `resume-from-issue.ts` | Confirmed by grep: comment-only. `command-registry.ts` usage covered by existing allowlist entry ✅ |
| `GitHubClient` port unchanged | `listIssueLinkedBranches` added to `GitHubApiClient` only, not to `GitHubClient` port (`src/kernel/github-client.ts`) ✅ |
| `arch-allowlist.ts` unchanged | `git diff main...HEAD -- tests/unit/architecture/arch-allowlist.ts` returns empty ✅ |

### Test Run Results

```
Test Files  796 passed (796)
      Tests  11903 passed | 1 skipped | 2 todo (11906)
typecheck:   0 errors
```

## 検証できなかった項目

None.

## Findings 詳細

None — no normative violations found.
