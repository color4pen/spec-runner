# Conformance Result — inbox-reject-dedup — Iteration 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All checkboxes [x]; T-01 through T-07 complete |
| design.md | ✓ | D1–D5 all respected in implementation |
| spec.md | ✓ | All 4 scenarios covered by tests and implementation |
| request.md | ✓ | All 4 acceptance criteria met; typecheck && test green |

## J-1: Spec Requirements & Scenarios

### Requirement: Reject removes the approval label

**Scenario: Label removed after successful reject** — `run-inbox.ts` execute-rejects loop calls `removeApprovalLabel` in an inner try block after `postRejectComment` resolves. ✓

**Scenario: Label removal failure does not fail the reject** — Inner try/catch on `removeApprovalLabel` writes a stderr warn and continues to `summary.rejected.push`; the outer catch is never reached. ✓

### Requirement: Planner deduplicates reject notifications

**Scenario: Dedup suppresses re-reject when label is still present** — `hasLatestRejectNotification` finds the latest notification comment and checks for `kind="reject" issue="${issueNumber}"`. Match → `continue` before `rejects.push`. TC-P2 confirms. ✓

**Scenario: Dedup does not suppress when latest notification is a different kind** — Only `kind="reject"` matches; `kind="escalation"` does not. TC-P4 confirms. ✓

**Scenario: Dedup does not suppress a start when body becomes valid** — Dedup check is inside the `catch` block only (invalid body path). Valid body takes the happy path to `StartAction`. TC-P3/TC-P5 confirm. ✓

### Requirement: Re-approved issue with valid body is planned for start

**Scenario: Start planned after label re-application** — Label removal removes the issue from `searchOpenIssuesByLabel`. Re-applying the label with a valid body causes `planStarts` to produce a `StartAction`. TC-P5 confirms. ✓

## J-2: Acceptance Criteria

| Criterion | Test Coverage | Status |
|---|---|---|
| reject 後に承認ラベルが外れることをテストで固定 | TC-L1 (`run-inbox.test.ts`) | ✓ |
| ラベル除去失敗でも dedup でコメントが増えないこと | TC-P2 (planner dedup) + TC-L2 (label failure non-fatal) | ✓ |
| ラベル再付与後の tick で start が計画される | TC-P3, TC-P5 (`planner.test.ts`) | ✓ |
| `typecheck && test` が green | `verification-result.md`: build/typecheck/test/lint all exit 0 | ✓ |

## J-3: Design Decisions

**D1** — `removeLabel` added to `GitHubClient` interface (`src/kernel/github-client.ts`): 200/204/404 → success, other non-2xx → throw. Adapter uses `this.request()` (retry/rate-limit middleware respected). ✓

**D2** — `removeApprovalLabel(issueNumber)` added to `InboxEffects` interface and wired in `buildEffects` via closure over `githubClient`, `owner`, `repo`, `opts.approveLabel`. ✓

**D3** — Best-effort semantics: inner try/catch wraps only `removeApprovalLabel`. A `postRejectComment` throw propagates to the outer catch and lands in `summary.errors`; label failure never reaches `summary.errors`. ✓

**D4** — `planStarts` remains pure: `commentsByIssue` is an optional fourth parameter, no I/O added. `planInbox` forwards `input.commentsByIssue` to `planStarts`. ✓

**D5** — Single `Promise.all` fan-out for both `awaitingWithIssue` and `unlinkedApprovedIssues` comment fetches. Failure handling matches the existing pattern (stderr warn, continue). ✓

## J-4: Scope & Regressions

Source changes are confined to the four files named in the design (`src/kernel/github-client.ts`, `src/adapter/github/github-client.ts`, `src/core/inbox/planner.ts`, `src/core/inbox/run-inbox.ts`). No changes to start / resume / escalate paths. The `+1` diffs across existing test files are exclusively the `removeApprovalLabel: vi.fn()` addition to `makeEffects` helpers — correct regression-prevention per T-06. All existing tests pass per verification result.
