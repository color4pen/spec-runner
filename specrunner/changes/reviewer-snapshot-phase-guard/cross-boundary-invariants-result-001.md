# Cross-Boundary Invariants Review — reviewer-snapshot-phase-guard — iter 1

- **verdict**: approved
- **iteration**: 001

## Scope

Source changes: `src/core/command/pipeline-run.ts` (+5 lines guard + import) and `src/core/pipeline/reviewer-capability.ts` (new 32-line pure module). No other `src/` files touched (verified: `git diff main...HEAD -- src/` lists exactly these two files).

## Invariant Walk

### INV-A: `composeReviewerDescriptor` handles `undefined` snapshots

**Consumer** (`src/core/pipeline/run.ts:92,131`):
```ts
const descriptor = composeReviewerDescriptor(base, jobState.reviewers);
```

**Guard in composer** (`compose-reviewers.ts:35`, unchanged):
```ts
if (!snapshots || snapshots.length === 0) { return base; }
```

For design-only jobs, `jobState.reviewers` is now `undefined`. The composer's guard handles `undefined` with an explicit `!snapshots` check and returns `base` unchanged — which is the correct and only valid behavior for design-only anyway (no reviewer transitions). **No invariant broken.** ✓

### INV-B: `deriveImplFixerChain` / `deriveImplReviewerChain` handle `undefined`

Both functions in `reviewer-chain.ts` (unchanged) use safe accessors:
- `:31` — `(stateOrSnapshots as JobState).reviewers ?? []` — nullish coalescing
- `:48` — `(state.reviewers?.length ?? 0) > 0` — optional chain + nullish coalescing

With `reviewers = undefined`, both paths degrade safely: chain is `["code-review"]`, `hasReviewers = false`. Design-only never reaches code-review or code-fixer anyway (transitions go design→success→end / design→error→escalate). **No invariant broken.** ✓

### INV-C: Schema field optionality

`src/state/schema.ts` is unchanged (forbidden surface, 0 diff lines verified). The `reviewers` field is already optional (`reviewers?: ReviewerSnapshot[]`). Not setting it for design-only is exactly what optional fields are for. **No invariant broken.** ✓

### INV-D: `buildInitialJobState` contract

The test harness calls `buildInitialJobState(...)` without a `reviewers` param. `job-state-store.ts:107` already guards: `if (params.reviewers && params.reviewers.length > 0)`. The test assertion `expect(result.jobState.reviewers).toBeUndefined()` confirms initial state has no reviewers field — the guard in `prepare()` is the only path that would add it. **No invariant broken.** ✓

### INV-E: Backward compatibility of existing design-only jobs (pre-INV-8-fix)

Existing jobs created before this change may have `jobState.reviewers` populated (the INV-8 bug). On resume, `run.ts` calls `composeReviewerDescriptor(base, jobState.reviewers)` with those populated snapshots, appending reviewer steps to the tail (zombie — no transitions lead there). This is the pre-existing INV-8 behavior and is unchanged. This PR only gates NEW job creation; it does not retroactively clear state. **No regression.** ✓

### INV-F: Alignment test — non-tautology property

The design mandates that the alignment test observe the composer's real output without re-deriving the CONFORMANCE anchor.

**Predicate** (guard): `descriptor.steps.some(([name]) => name === STEP_NAMES.CONFORMANCE)`

**Observation** (test): `composedNames.slice(fakeIdx + 1).some((n) => baseNames.has(n))`

The observation does not reference `CONFORMANCE` on the right-hand side. It checks whether any base-descriptor step appears after the fake reviewer in the composed output. These are independent computations.

Drift scenario: if composer changed its anchor from CONFORMANCE to ADR_GEN, the fake reviewer would still land before ADR_GEN (a base step), so `reachable` would remain `true` for standard/fast. But the guard predicate would still return `true` (CONFORMANCE still present in those descriptors). The test would remain green — correctly NOT flagging this as drift, because the reviewer chain would still be reachable. However if the composer's new anchor caused a descriptor to become zombie where guard says reachable (or vice versa), the positional observation would diverge from the guard and the test would fail. The drift detection property is intact for the cases that matter. **Non-tautological.** ✓

One subtle point worth noting: the observation uses `baseNames` (steps from the original base descriptor) to determine if a base step follows the fake. For standard/fast, `regression-gate` appears after the fake but it is NOT in `baseNames` (it's added by the composer, not the base). The observation correctly finds `conformance` (a true base step) after the fake → `reachable = true`. For design-only, only `request-review` and `design` are in `baseNames`, neither appears after the fake → `reachable = false`. The observation is structurally sound. ✓

### INV-G: Forbidden surface non-contact

```
git diff main...HEAD -- src/core/port/ src/state/schema.ts src/state/lifecycle.ts src/core/pipeline/compose-reviewers.ts
```
→ 0 lines diff. All four forbidden surfaces are byte-for-bit unchanged. Fast pipeline conformance scope checkpoint is satisfied. ✓

### INV-H: DSM import closure

`reviewer-capability.ts` imports:
- `./types.js` — `core/pipeline → types` (existing permitted edge, same as `compose-reviewers.ts`)
- `../step/step-names.js` — `core/pipeline → step` (existing permitted edge, same as `compose-reviewers.ts`)

`pipeline-run.ts` imports `../pipeline/reviewer-capability.js` — `core/command → core/pipeline` (existing permitted edge; same file already imports `../pipeline/registry.js` and `../pipeline/runtime-capability-gate.js`).

No new DSM edges introduced. ✓

### INV-I: `FindingResolution` union unchanged

No changes to `src/` files beyond the two noted. `FindingResolution` and `VALID_RESOLUTIONS` are untouched. ✓

## Findings

No cross-boundary invariant violations found. All downstream consumers of `jobState.reviewers` handle `undefined` gracefully via existing guards. The forbidden surfaces are untouched. The alignment test is non-tautological. The guard condition `reviewers.length > 0 && descriptorHasReviewerInsertionPoint(descriptor)` correctly gates snapshot creation without touching any existing behavior for standard/fast descriptors.
