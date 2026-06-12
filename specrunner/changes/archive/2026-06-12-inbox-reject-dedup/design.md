# Design: inbox-reject-dedup

## Context

`inbox run` ticks every 5 minutes. On each tick, `searchOpenIssuesByLabel` returns all open issues with the approval label. `planStarts` skips issues already linked to a job; issues that fail `parseRequestMdContent` validation become `RejectAction`s. Because a rejected issue never produces a job, it is never added to `linkedIssueNumbers`, so every subsequent tick re-plans the same reject and posts another comment.

The reject comment text reads "fix … and re-apply the approval label", which implies the label should be removed on reject. The implementation has no `removeLabel` call anywhere in the reject path.

Two layers are needed:
- **L1 (structural)**: remove the approval label on reject so the issue exits the approved-issues search. This makes the issue invisible to future ticks until the user re-applies.
- **L2 (defensive)**: if L1 fails (transient API error), dedup in the planner so the same reject notification is not re-posted while the label is still present.

### Relevant code

| Location | Relevance |
|---|---|
| `src/core/inbox/planner.ts:planStarts` | Builds `RejectAction`; currently checks only `linkedIssueNumbers` for skip |
| `src/core/inbox/planner.ts:planInbox` | Orchestrates planning; `commentsByIssue` is already in scope but not passed to `planStarts` |
| `src/core/inbox/run-inbox.ts:204-218` | Executes rejects — posts comment, no label removal |
| `src/core/inbox/run-inbox.ts:buildEffects` | Default `InboxEffects`; label removal default goes here |
| `src/kernel/github-client.ts` | Port interface; `removeLabel` is missing |
| `src/adapter/github/github-client.ts` | Adapter implementation; `removeLabel` to be added |
| `src/core/notify/issue-notifier.ts:buildRejectComment` | Emits `kind="reject" issue="N"` marker; used for dedup detection |

## Goals / Non-Goals

**Goals**:
- Remove the approval label from an issue immediately after posting a reject comment (L1).
- If label removal fails, suppress duplicate reject notifications via planner-level dedup (L2): skip re-rejecting an issue whose latest notification is already `kind="reject"` for that issue.
- Keep `planStarts` a pure function (no I/O added; I/O stays in `run-inbox.ts`).

**Non-Goals**:
- Automatic body-fix detection; user re-application of the label remains the re-entry signal.
- Changes to start / resume / escalate notification paths.

## Decisions

### D1: Add `removeLabel` to `GitHubClient` port and adapter

`GitHubClient` is the single port for GitHub I/O. Label removal belongs there alongside `createIssueComment`.

**Rationale**: Adding it anywhere else (e.g., inline `fetch` in effects) would bypass the retry/rate-limit middleware in `GitHubApiClient.request()` and violate the Ports & Adapters boundary.

**Alternatives**: Inject a separate label-removal function as a plain closure — rejected because it duplicates the HTTP retry logic and adds a new ad-hoc abstraction with no reuse value.

**Signature**:
```
removeLabel(owner, repo, issueNumber, label): Promise<void>
```
`404` (label already absent) is treated as success (idempotent). Other non-2xx statuses throw.

### D2: Add `removeApprovalLabel` to `InboxEffects`

`InboxEffects` is the existing injection seam for all side effects in the inbox orchestrator. Adding `removeApprovalLabel(issueNumber)` there keeps the pattern consistent and makes the call mockable in tests.

**Rationale**: Same reason as D1 — consistency with the established injection pattern. The default implementation closes over `githubClient`, `owner`, `repo`, and `approveLabel` already in scope in `buildEffects`.

**Alternatives**: Call `githubClient.removeLabel` directly in `run-inbox.ts` without an effects method — rejected because it makes the label removal call untestable without mocking the full HTTP client.

### D3: Label removal is best-effort; failure is a warn, not an error

A label removal failure must not mark the reject as failed or suppress the reject summary entry. The reject comment was already posted; the dedup layer (D4) handles the next tick.

**Rationale**: Label removal is secondary to delivering the rejection feedback. Surfacing it as a hard failure would confuse operators and prevent the summary from recording that the issue was actually rejected.

**Implementation**: Inner `try/catch` inside the outer reject loop. `removeApprovalLabel` throws → `stderrWrite` warn, execution continues to `summary.rejected.push`.

### D4: Dedup lives in `planStarts`; comments for unlinked approved issues are fetched in `run-inbox.ts`

`planStarts` is a pure function. Adding `commentsByIssue: Map<number, IssueComment[]>` as a parameter keeps it pure while enabling dedup logic. The I/O (fetching comments) stays in `run-inbox.ts` collection phase.

`planInbox` already receives `commentsByIssue` (used for `planResumes`). It will forward the map to `planStarts`.

**Dedup rule**: For an issue that fails validation (would be a `RejectAction`), find the most recent comment in `commentsByIssue` whose body starts with `<!-- specrunner:notification`. If that comment contains `kind="reject" issue="${issueNumber}"`, skip — emit neither start nor reject.

**Why "most recent notification" rather than "any notification"**: A more recent notification of a different kind (e.g., escalation from a different job on a later run) would indicate a different state; suppressing reject there would be wrong. Checking only the latest notification limits dedup to the case where the reject notification is still current.

**Rationale for keeping dedup in planner**: The request specifies it; the planner is the right place for skip-condition logic. Pure functions also make the logic unit-testable without orchestrator setup.

**Alternatives**:
- Dedup in `run-inbox.ts` executor (check before posting): rejected — executor-level dedup is harder to unit test and couples comment fetching to the execution loop.
- Fetch comments only when a reject is about to fire (lazy): rejected — it requires two sequential I/O phases in execute, which complicates the control flow and still adds the same number of API calls.

### D5: Collection phase fetches comments for unlinked approved issues

Currently `run-inbox.ts` fetches comments only for `awaiting-resume` jobs. The dedup needs comments for unlinked approved issues. These are fetched in the same parallel batch as awaiting-resume comments and stored in the same `commentsByIssue` map.

**Rationale**: Single map, single collection phase, one `Promise.all` fan-out. Adding a separate fetch loop would require a second `await` round-trip.

**Failure handling**: Same as the existing comment-fetch failure handling — `stderrWrite` warn, continue (missing comments → dedup falls through → reject is re-posted, which is safer than silently suppressing).

## Risks / Trade-offs

**[Risk] Extra comment-fetch API calls per tick** — Each unlinked approved issue now triggers a `listIssueComments` call. In the steady state (no rejected issues with the label still attached), this adds 0 extra calls. When a rejection spam scenario is in progress, it adds 1 call/issue. Acceptable.

**[Risk] Dedup over-suppresses if user re-applies label without fixing body** — User re-applies label, body still invalid, latest notification is still the prior reject → dedup suppresses a new reject comment. The user gets no fresh feedback. This is a known trade-off: the dedup is specifically for the label-still-attached case (L1 failed). Since L1 removal is the primary fix, this scenario is rare. The reject comment already instructs the user to fix and re-apply.

**[Risk] 404 on `removeLabel` is idempotent** — GitHub returns 404 when the label is absent. The adapter maps 404 → success. This prevents spurious errors on double-runs (e.g., dry-run followed by live run).

## Open Questions

None. Requirements and scope are fully specified by the request.
