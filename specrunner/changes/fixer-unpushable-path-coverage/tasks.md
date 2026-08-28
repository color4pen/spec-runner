# Tasks: fixer-unpushable-path-coverage

## T-01: Add `buildUnpushablePathContracts` helper to `fixer-helpers.ts`

- [ ] Add `import type { OutputContract } from "../port/output-contract.js"` to `fixer-helpers.ts`
- [ ] Add `import type { StepDeps } from "./types.js"` to `fixer-helpers.ts` (the existing file imports from `step-names.ts` and `state/schema.js` but not `StepDeps` — check if already imported and add if missing)
- [ ] Add exported function `buildUnpushablePathContracts(deps: StepDeps): OutputContract[]` to `fixer-helpers.ts`:
  - Returns `[]` when `deps.pushCapability` is null, undefined, or has an empty `patterns` array
  - Returns `[{ kind: "unpushable-path", path: "", policy: "follow-up", patterns: deps.pushCapability.patterns }]` otherwise
  - This mirrors the contract block in `implementer.ts` L269-276 exactly

**Acceptance Criteria**:
- `buildUnpushablePathContracts({ pushCapability: null } as StepDeps)` returns `[]`
- `buildUnpushablePathContracts({ pushCapability: { patterns: [], source: "..." } } as StepDeps)` returns `[]`
- `buildUnpushablePathContracts({ pushCapability: { patterns: [".github/workflows/**"], source: "..." } } as StepDeps)` returns one contract with `kind: "unpushable-path"`, `policy: "follow-up"`, and `patterns: [".github/workflows/**"]`
- `bun run typecheck` passes with no new type errors

---

## T-02: Update `code-fixer.ts`: add `outputContracts` and notice injection

- [ ] Add `import type { OutputContract } from "../port/output-contract.js"` to `code-fixer.ts`
- [ ] Add `import { renderPushCapabilityNotice } from "../../git/push-capability.js"` to `code-fixer.ts`
- [ ] Add `buildUnpushablePathContracts` to the import from `./fixer-helpers.js` in `code-fixer.ts`
- [ ] Add `outputContracts(_state: JobState, deps: StepDeps): OutputContract[]` method to `CodeFixerStep` that returns `buildUnpushablePathContracts(deps)`
- [ ] In `CodeFixerStep.buildMessage`, compute `const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` at the start of the method (before any branch logic)
- [ ] Append `capabilityNotice` to every return path in `buildMessage`:
  - Conformance branch, continuation path: `return buildContinuationMessage(...) + capabilityNotice`
  - Conformance branch, initial path: append to the template literal before the closing backtick (or as a suffix after the closing backtick)
  - Coordinator loop branch, continuation path: `return buildContinuationMessage(...) + capabilityNotice`
  - Coordinator loop branch, aggregated-findings initial path: append `capabilityNotice`
  - Coordinator loop branch, fallback path (no members): append `capabilityNotice`
  - Normal branch, continuation path: `return buildContinuationMessage(...) + capabilityNotice`
  - Normal branch, with-findings initial path: append `capabilityNotice`
  - Normal branch, findingsPath fallback: append `capabilityNotice`

**Acceptance Criteria**:
- `CodeFixerStep.outputContracts` returns `[{ kind: "unpushable-path", policy: "follow-up", patterns: [...] }]` when `deps.pushCapability` has patterns
- `CodeFixerStep.outputContracts` returns `[]` when `deps.pushCapability` is null
- `CodeFixerStep.buildMessage` (normal initial path, findings available) includes the "Push Capability Notice" heading when `pushCapability` has patterns
- `CodeFixerStep.buildMessage` (continuation path) includes the "Push Capability Notice" heading when `pushCapability` has patterns
- `CodeFixerStep.buildMessage` returns the same string as before when `pushCapability` is null (notice is empty string, no visible difference)
- All conformance / coordinator / normal branch variants include the notice when capability is set (verified by tests in T-04)
- `bun run typecheck` passes

---

## T-03: Update `spec-fixer.ts`: add `outputContracts` and notice injection

- [ ] Add `import type { OutputContract } from "../port/output-contract.js"` to `spec-fixer.ts`
- [ ] Add `import { renderPushCapabilityNotice } from "../../git/push-capability.js"` to `spec-fixer.ts`
- [ ] Add `buildUnpushablePathContracts` to the import from `./fixer-helpers.js` in `spec-fixer.ts`
- [ ] Add `outputContracts(_state: JobState, deps: StepDeps): OutputContract[]` method to `SpecFixerStep` that returns `buildUnpushablePathContracts(deps)`
- [ ] In `SpecFixerStep.buildMessage`, compute `const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` at the start of the method (before any branch logic)
- [ ] Append `capabilityNotice` to every return path in `buildMessage`:
  - Conformance branch, continuation path: `return buildContinuationMessage(...) + capabilityNotice`
  - Conformance branch, initial path: append `capabilityNotice`
  - Normal branch, continuation path: `return buildContinuationMessage(...) + capabilityNotice`
  - Normal branch, with-findings initial path: append `capabilityNotice`
  - Normal branch, fallback path (`buildSpecFixerInitialMessage(...)`): append `capabilityNotice`

**Acceptance Criteria**:
- `SpecFixerStep.outputContracts` returns `[{ kind: "unpushable-path", policy: "follow-up", patterns: [...] }]` when `deps.pushCapability` has patterns
- `SpecFixerStep.outputContracts` returns `[]` when `deps.pushCapability` is null
- `SpecFixerStep.buildMessage` (normal initial path, with findings) includes the "Push Capability Notice" heading when `pushCapability` has patterns
- `SpecFixerStep.buildMessage` (fallback path) includes the "Push Capability Notice" heading when `pushCapability` has patterns
- `SpecFixerStep.buildMessage` (continuation path) includes the "Push Capability Notice" heading when `pushCapability` has patterns
- `SpecFixerStep.buildMessage` returns the same string as before when `pushCapability` is null
- `bun run typecheck` passes

---

## T-04: Write unit tests for fixer push-capability coverage

Create a new test file `src/core/step/__tests__/fixer-push-capability.test.ts`.

**Helper fixtures to define**:
- `makeJobState(stepName: string): JobState` — minimal JobState with the given step as current
- `makeStepDeps(pushCapability?: PushCapability | null): StepDeps` — minimal StepDeps with optional pushCapability; uses a slug of `"test-slug"` and a branch of `"fix/test-slug-abc"`
- `WORKFLOW_CAPABILITY: PushCapability` — `{ patterns: [WORKFLOWS_PATTERN], source: "Actions token" }`

**Tests for `buildUnpushablePathContracts` (from `fixer-helpers.ts`)**:
- [ ] Returns `[]` when `pushCapability` is null
- [ ] Returns `[]` when `pushCapability.patterns` is empty
- [ ] Returns one contract with `kind: "unpushable-path"` and `policy: "follow-up"` when patterns are declared
- [ ] The returned contract carries the exact patterns array from `pushCapability.patterns`

**Tests for `CodeFixerStep`**:
- [ ] `CodeFixerStep.outputContracts(state, deps)` returns an `unpushable-path` contract when `deps.pushCapability` has patterns
- [ ] `CodeFixerStep.outputContracts(state, deps)` returns `[]` when `deps.pushCapability` is null
- [ ] `CodeFixerStep.buildMessage(state, deps)` (normal initial path, with findings injected via state) includes `"Push Capability Notice"` when `pushCapability` has patterns
- [ ] `CodeFixerStep.buildMessage(state, deps)` (normal initial path) does NOT include `"Push Capability Notice"` when `pushCapability` is null
- [ ] `CodeFixerStep.buildMessage(state, deps)` (continuation path — prior sessionId set on state) includes `"Push Capability Notice"` when `pushCapability` has patterns
- [ ] `CodeFixerStep.buildMessage(state, deps)` (conformance branch — conformance run newer than predecessor) includes `"Push Capability Notice"` when `pushCapability` has patterns

**Tests for `SpecFixerStep`**:
- [ ] `SpecFixerStep.outputContracts(state, deps)` returns an `unpushable-path` contract when `deps.pushCapability` has patterns
- [ ] `SpecFixerStep.outputContracts(state, deps)` returns `[]` when `deps.pushCapability` is null
- [ ] `SpecFixerStep.buildMessage(state, deps)` (normal path, findings available) includes `"Push Capability Notice"` when `pushCapability` has patterns
- [ ] `SpecFixerStep.buildMessage(state, deps)` (fallback path, no findings) includes `"Push Capability Notice"` when `pushCapability` has patterns
- [ ] `SpecFixerStep.buildMessage(state, deps)` (continuation path) includes `"Push Capability Notice"` when `pushCapability` has patterns
- [ ] `SpecFixerStep.buildMessage(state, deps)` does NOT include `"Push Capability Notice"` when `pushCapability` is null

**Acceptance Criteria**:
- `src/core/step/__tests__/fixer-push-capability.test.ts` exists and all tests within pass
- At minimum 14 tests covering: 4 helper tests + 5 code-fixer tests + 5 spec-fixer tests (totals above)
- `bun run test` passes (entire test suite, no regressions)

---

## T-05: Verify no regression in existing tests and typecheck

- [ ] Run `bun run typecheck` — exit code 0, no new errors
- [ ] Run `bun run test` — exit code 0, all pre-existing tests continue to pass
- [ ] Confirm by inspection that `implementer.ts` and `request-review.ts` are unchanged (no modifications to those files)
- [ ] Confirm by inspection that `step-context-builder.ts`, `output-verify.ts`, and `commit-push.ts` are unchanged

**Acceptance Criteria**:
- `bun run typecheck` exits 0
- `bun run test` exits 0
- No changes to `implementer.ts`, `request-review.ts`, `step-context-builder.ts`, `output-verify.ts`, or `commit-push.ts`
