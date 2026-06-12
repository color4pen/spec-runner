# cross-boundary-invariants Review — escalation-compare-url — iter 1

- **verdict**: approved

## Scope

```
src/core/notify/issue-notifier.ts      (+31 / -0)
src/state/schema.ts                    (+5)
src/core/command/pipeline-run.ts       (+1)
tests/unit/core/notify/issue-notifier.test.ts  (+127)
tests/unit/core/pipeline/pipeline.notification.test.ts  (+4)
tests/unit/state/base-branch-roundtrip.test.ts  (+141)
```

## Invariants Examined

### 1. `validateJobState` pass-through for optional `baseBranch`

The existing `validateJobState` has explicit normalization only for `slug` (injecting `null` when absent). `baseBranch` receives no such normalization — it relies on the `return raw as JobState` cast.

**Verdict**: correct. `baseBranch?: string | null` means `undefined` (absent) is valid TypeScript. The consumer (`state.request.baseBranch ?? "main"`) handles absent/null correctly. There is no broken invariant here; the pattern is consistent with `worktreePath`, `pipelineId`, `noWorktree`, and other optional fields added post-initial schema.

### 2. `...s.request` spreads in runtimes

`local.ts` lines 326 and 512, `managed.ts` line 205 all update the request path via:

```typescript
request: { ...s.request, path: changeFolderRequestPath }
```

**Verdict**: spread preserves `baseBranch` (whether a string, `null`, or `undefined`) through path updates. No invariant broken. This was confirmed by design.md D1 and tasks.md T-02.

### 3. `buildEscalationComment` body expansion vs. existing test assertions

All pre-existing assertions on escalation comment body use `.toContain()`, not exact-match. Adding a `Diff:` line does not invalidate any existing assertion.

`pipeline.notification.test.ts` TC-PN-002 was updated to additionally assert the compare URL. `makeMinimalState` now carries `baseBranch: "main"` and `branch: "feat/my-slug-12345678"`, so the asserted URL `https://github.com/testowner/testrepo/compare/main...feat/my-slug-12345678` is deterministically correct.

**Verdict**: no regression.

### 4. Both `notifyJobTerminal` call sites read from `state.request.baseBranch`

`pipeline.ts:459` passes `deps` (which structurally satisfies `NotifyCtx`). `run-inbox.ts:358` passes `{ githubClient, owner, repo }`. Both delegate to `buildEscalationComment(state)` — a pure function of `JobState`. Neither call site needs to supply `baseBranch` separately.

**Verdict**: invariant that `buildEscalationComment` stays a pure function of `JobState` is preserved. Both notification paths work identically.

### 5. `resume.ts` does not clobber `state.request.baseBranch`

`resume.ts:258` passes `baseBranch: request.baseBranch` to `workspaceOpts` (for git checkout), not to a state mutation. The loaded state retains the persisted `baseBranch`. For legacy jobs resumed after this change, `baseBranch` remains absent and the `?? "main"` fallback applies on notification.

**Verdict**: no clobbering, no regression.

### 6. Legacy state backward compat under re-escalation (inbox path)

Orphaned jobs started before this change have no `baseBranch` in state. When inbox calls `notifyEscalation`, `buildEscalationComment` uses `?? "main"` and produces a valid (if potentially approximate) URL. The notification itself is never suppressed.

**Verdict**: documented trade-off (design.md Risks section), not an invariant violation.

## No Findings

All six cross-boundary invariants examined pass. The change does not silently break any implicit assumption of pre-existing mechanisms.
