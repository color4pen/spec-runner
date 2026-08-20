# Scale-Tolerance Review: issue-target-resume-from-issue

**Reviewer**: scale-tolerance  
**Iteration**: 1  
**Verdict**: derived by CLI from typed findings below

---

## Scope

Changed files examined:

| File | Role |
|------|------|
| `src/core/issue-target/resume.ts` | Core resolver: comment scan + branch identity loop |
| `src/adapter/github/github-client.ts` | `listIssueLinkedBranches` (new) + `listIssueComments` (consumer) |
| `src/cli/resume-from-issue.ts` | CLI orchestrator: invocation sequence |
| `src/core/notify/issue-notifier.ts` | `parseEscalationJobId` (new) |
| `src/git/checkpoint-ref.ts` | `readCheckpointFromRef` — per-candidate git I/O |
| `src/core/job-access/load-by-job-id.ts` | Local state lookup (fallback scan) |
| `src/errors.ts` | New error codes |

---

## Findings

### F-1 (medium / fixable): Comment scan always fetches all pages — O(⌈C/100⌉) API calls

**File**: `src/core/issue-target/resume.ts:54` (`resolveEscalationJobId`)  
**Also**: `src/adapter/github/github-client.ts:808-838` (`listIssueComments` impl)

`resolveEscalationJobId` calls `listIssueComments`, which paginates through every comment page
(`per_page=100`, follows `Link: rel="next"`). The selection logic picks the marker with the
highest `createdAt`, which in GitHub's ascending-by-default comment order is always in the
**last** page. Every invocation of `resume --from-issue` must therefore fetch all pages before
any marker can be selected — there is no early exit.

Comments on an issue grow monotonically over time (notifications, operator discussion, future
escalation cycles). Cost = O(⌈C/100⌉) API calls, where C is the total comment count on the
issue. This applies unconditionally: the local-state short-circuit (D4 / line 116 in
`resume-from-issue.ts`) occurs **after** the comment scan, so even the fast path always pays
the full pagination cost.

The design's Risks section acknowledges branch-enumeration cost ("first:50 で有界") but makes
no mention of comment pagination cost.

**Fix**: Pass `direction=desc` (and optionally `sort=created`) to the GitHub Issues Comments
REST endpoint. With newest-first ordering, the first page will contain the latest escalation
marker in the common case, enabling early exit after 1–2 requests instead of O(C/100).
Implementation: add an optional `direction` parameter to `listIssueComments` (no existing mock
breakage since it's optional), or introduce a narrower `listIssueCommentsDesc` for the
resolver-only path.

---

### F-2 (low / fixable): Full checkpoint read for non-confirming branch candidates

**File**: `src/core/issue-target/resume.ts:152-153`

```typescript
({ slug, stateJson } = await readCheckpointFromRef(spawnFn, cwd, checkpointOid));
```

`readCheckpointFromRef` always reads three artifacts per candidate branch:

1. `git show ref:state.json` — needed (identity fields)
2. `git show ref:events.jsonl` — **not needed** for identity check
3. `git ls-tree -r --name-only` listing all checkpoint files — **not needed** for identity check

`events.jsonl` grows monotonically with job duration (every pipeline event appended). For
non-confirming candidates — those that fail the 3-field identity check — the events journal
and tree listing are read and discarded immediately. `resolveCheckpointSlug` additionally
loops over every entry in `specrunner/changes/` calling `cat-file -e`, though on a feature
branch this is typically O(1).

**Scope**: bounded by `first:50` linked branches (design-acknowledged). In practice there is
typically one linked branch per issue, so observed impact is small. Risk grows if a single
issue accumulates many linked branches from successive job starts.

**Fix**: Add a lightweight `readStateJsonFromRef(spawnFn, cwd, ref): Promise<string>` that
executes only `resolveCheckpointSlug` + `git show ref:state.json`, bypassing the events and
tree reads. Use this for the identity-check phase; reserve `readCheckpointFromRef` for the
confirmed candidate (which proceeds to `runAttachVerification` anyway).

---

### F-3 (low / decision-needed): `linkedBranches(first:50)` silently truncates — no cursor

**File**: `src/adapter/github/github-client.ts:743-746`

```graphql
linkedBranches(first: 50) { nodes { ref { name } } }
closedByPullRequestsReferences(first: 50) { nodes { headRefName } }
```

Both GraphQL connections cap at 50 with no cursor/pagination. An issue with >50 linked
branches or >50 PR references (unlikely today, possible for a long-running epic with many
restart cycles) silently omits the excess. If the valid resume branch happens to fall beyond
the first 50, the command fails with `RESUME_FROM_ISSUE_UNCONFIRMED` — a misleading error
for a branch that exists but was truncated.

The design explicitly accepts this bound and documents `first:50` as the cap. This is a
deliberate trade-off; the ceiling is real but benign at current scale.

**Options**:

| Option | Consequence |
|--------|-------------|
| Accept current `first:50` cap (status quo) | Operators with >50 linked branches fall back to `job attach --branch` manually — acceptable given the documented cap |
| Add `pageInfo.endCursor` and iterate all pages | Correct at scale; requires additional GraphQL roundtrips per page beyond 50; added complexity |

---

## Observations

- **`listIssueLinkedBranches` is a single GraphQL query** (1 API call regardless of branch count). Well-bounded.
- **Branch-fetch loop is sequential**: each candidate's `git fetch` + checkpoint read runs serially. With O(50) max candidates this is acceptable; parallelization is an optimization, not a requirement.
- **`loadStateByJobId` fallback O(N) scan** (reading every non-archived `specrunner/changes/<slug>/state.json`): pre-existing code, not introduced by this PR. In the `resume --from-issue` primary path (no local state), this scan always runs and returns JOB_NOT_FOUND. Bounded by the number of concurrent active jobs (non-archived), not by historical total — low severity, not attributable to this PR.
- **`resolveCheckpointSlug` `cat-file -e` loop**: iterates entries in `specrunner/changes/` on the **remote feature branch's** tree. A feature branch typically has only its own change folder, so this is effectively O(1) per candidate.

---

## Evidence Summary

| Dimension | Count |
|-----------|-------|
| Files checked | 7 |
| Findings | 3 (1 medium, 2 low) |
| Critical/High | 0 |
| Pre-existing issues attributed to this PR | 0 (loadStateByJobId fallback noted as observation) |
