# Scale-Tolerance Review: issue-target-resume-from-issue

**Reviewer**: scale-tolerance  
**Iteration**: 2  
**Verdict**: derived by CLI from typed findings below

---

## Scope

Changed files examined this round (code-fixer touched files):

| File | Change since iteration 1 |
|------|--------------------------|
| `src/git/checkpoint-ref.ts` | Added `readStateJsonFromRef` (lightweight: no events.jsonl, no recursive ls-tree) |
| `src/core/issue-target/resume.ts` | Switched identity-check phase to `readStateJsonFromRef`; added direction-limitation comment |
| `src/cli/resume-from-issue.ts` | Added `slug = verified.slug` after `setupWorkspace` (cross-boundary fix) |
| `src/cli/__tests__/resume-from-issue.test.ts` | Added divergence test for slug confirmation |

---

## Prior-Round Finding Disposition

### F-1 (medium): Comment scan pagination — O(⌈C/100⌉) API calls

**Operator adjudication**: No code change. `direction=desc` is unsupported on the per-issue
comments endpoint; a code comment documents the limitation and the practical bound.

**Verification**: `src/core/issue-target/resume.ts:54–58` contains the required comment:

```
// NOTE: per-issue comments endpoint (GET /repos/{owner}/{repo}/issues/{number}/comments)
// ignores the `direction` query parameter — direction=desc returns the same ascending
// order as asc. Only the repository-level /issues/comments endpoint supports direction.
// Full pagination is therefore required. In practice, escalation issues have well under
// 100 comments (one API page), so the cost is O(1) API calls.
```

**Disposition**: Resolved per operator adjudication. Comment present. ✓

---

### F-2 (low): Full checkpoint read for non-confirming candidates

**Operator adjudication**: Adopt. Add `readStateJsonFromRef` to `src/git/checkpoint-ref.ts`;
use it in the identity-check loop (no events.jsonl read, no recursive ls-tree).

**Verification**:

`src/git/checkpoint-ref.ts:140–157` — `readStateJsonFromRef` implemented:
- Calls `resolveCheckpointSlug` (shallow `git ls-tree --name-only` + 1 `cat-file -e` per candidate, typically 1 candidate on a feature branch).
- Reads `state.json` via `git show <OID>:specrunner/changes/<slug>/state.json`.
- Does **not** read `events.jsonl` or call recursive `ls-tree -r`.

`src/core/issue-target/resume.ts:158` — identity-check loop now calls:
```typescript
({ slug, stateJson } = await readStateJsonFromRef(spawnFn, cwd, checkpointOid));
```

The full `readCheckpointFromRef` (which reads events.jsonl + recursive ls-tree) remains in
place but is **not** called in the identity-check phase. It is used only on the confirmed
branch by the rebind path (`runAttachVerification`).

**Disposition**: Fixed. events.jsonl and recursive ls-tree are no longer read per candidate. ✓

---

### F-3 (low): `linkedBranches(first:50)` silently truncates with no cursor

**Operator adjudication**: Status quo. The `first:50` cap is the design's intentional bound;
`job attach --branch` manual path remains available as a fallback.

**Verification**: `src/adapter/github/github-client.ts:743,746` — `first:50` bounds still
present on both `linkedBranches` and `closedByPullRequestsReferences`. No cursor pagination
added. The cap is accepted as the optional-index semantics of the Development API.

**Disposition**: Status quo per operator adjudication. ✓

---

## New Findings

None. The revised implementation introduces no new scale-tolerance concerns:

- **git fetch per candidate**: O(B) sequential network calls where B ≤ 50 (bounded by GraphQL
  `first:50`, in practice 1–2 for escalation issues). Accepted within the same bound as F-3.
- **`resolveCheckpointSlug` per candidate**: O(K) local `cat-file -e` calls where K = number
  of non-excluded top-level change folders on the feature branch — typically 1.
- **`resolveEscalationJobId`**: single `listIssueComments` invocation; O(1) API calls for
  typical escalation issues (< 100 comments). Documented per F-1 adjudication.

---

## Evidence

| Item | Verified |
|------|----------|
| F-1 comment present in resume.ts:54–58 | ✓ |
| F-2 `readStateJsonFromRef` implemented in checkpoint-ref.ts:140–157 | ✓ |
| F-2 `resume.ts` identity loop calls `readStateJsonFromRef` not `readCheckpointFromRef` | ✓ |
| F-3 `first:50` bounds still present; no cursor added | ✓ |
| Cross-boundary fix: `slug = verified.slug` at resume-from-issue.ts:204 | ✓ |
| Sequential git fetch O(B ≤ 50) — accepted within F-3 adjudication | ✓ |
| resolveCheckpointSlug O(K=1) local calls per feature branch | ✓ |
