# Tasks: lineage-output-attribution

## T-01: Add `IoRef` import and extend `applySuccessPostPersistEffects` signature

- [x] In `src/core/step/commit-orchestrator.ts`, add an import for `IoRef` from `"../port/step-types.js"` (or via `"./types.js"` which re-exports it).
- [x] Change the private method signature of `applySuccessPostPersistEffects` to accept two additional required parameters after `deps`: `preWriteIo: IoRef[]` and `preReadIo: IoRef[]`.
- [x] Inside the method body, replace `step.writes(state, deps)` with `preWriteIo` and `step.reads ? step.reads(state, deps) : []` with `preReadIo`.
- [x] Update the guard from `if (deps.runtimeStrategy && step.writes && deps.cwd)` to `if (deps.runtimeStrategy && preWriteIo.length > 0 && deps.cwd)`.
- [x] Remove any reference to `step.writes` and `step.reads` within `applySuccessPostPersistEffects` (they are no longer called there).

**Acceptance Criteria**:
- `applySuccessPostPersistEffects` no longer reads `step.writes` or `step.reads` internally.
- The method signature compiles cleanly with the new parameters.
- No existing call sites other than `commitSuccess` and `commitRound` are broken (method is private).

---

## T-02: Fix `commitSuccess` — evaluate writes/reads before `projectSuccess`

- [x] In `commitSuccess`, before the call to `projectSuccess(state, step, result, findingsPath)`, add:
  ```ts
  const preWriteIo: IoRef[] = step.writes ? step.writes(state, deps) : [];
  const preReadIo: IoRef[] = step.reads ? step.reads(state, deps) : [];
  ```
  Here `state` is the parameter passed into `commitSuccess` (the pre-push state).
- [x] Pass `preWriteIo` and `preReadIo` as the last two arguments in the `applySuccessPostPersistEffects` call: `await this.applySuccessPostPersistEffects(store, s, step, result, deps, preWriteIo, preReadIo)`.
- [x] Ensure `projectSuccess` is called **after** the pre-evaluation (the two `const` declarations must appear before `projectSuccess`).

**Acceptance Criteria**:
- `writes()` is called with the original pre-push `state` (before `projectSuccess` appends the `StepRun`).
- On the first attempt, `nextIteration(state, stepName)` returns 1 (no prior runs).
- On the second attempt, `nextIteration(state, stepName)` returns 2 (one prior run).
- Existing `commitSuccess` behavior for branch/pullRequest/biteEvidence/verdict history is unchanged.

---

## T-03: Fix `commitRound` — evaluate writes/reads per member before folding

- [x] In `commitRound`, in the loop `for (const { step, startedAt, result } of members)`, within the `result.kind === "success"` branch, evaluate writes/reads **before** calling `projectSuccess`:
  ```ts
  const preWriteIo: IoRef[] = step.writes ? step.writes(state, deps) : [];
  const preReadIo: IoRef[] = step.reads ? step.reads(state, deps) : [];
  ```
  This must happen before `state = projectSuccess(state, step, result, findingsPath)`.
- [x] Add `preWriteIo` and `preReadIo` to the `successEntries` accumulator: change its element type from `{ step: Step; result: ... }` to `{ step: Step; result: ...; preWriteIo: IoRef[]; preReadIo: IoRef[] }`.
- [x] In the post-persist loop over `successEntries`, pass `entry.preWriteIo` and `entry.preReadIo` to `applySuccessPostPersistEffects`.

**Acceptance Criteria**:
- Each member's `writes()` is evaluated against the `state` before that member's `StepRun` is appended (not the fully-folded final state).
- If member A runs before member B, member A's `writes()` sees only prior state (not member B's result), and vice versa.
- `store.persist` is still called exactly once (no behavioral change to persist semantics).

---

## T-04: Add regression test for iteration-path attribution and hash correctness

Create a new test file `src/core/step/__tests__/lineage-output-attribution.test.ts` (or add a dedicated describe block to `commit-orchestrator.test.ts`).

- [x] **Helper: iteration-dependent step mock**. Build a mock `AgentStep` (or minimal `Step`) whose `writes(state, deps)` returns `[{ path: \`out/result-\${nextIteration(state, "iter-step").toString().padStart(3, "0")}.md\` }]` using the real `nextIteration` function. The step has no `reads`.

- [x] **Helper: mock `runtimeStrategy`**. Build a `runtimeStrategy` mock where `digestArtifacts(refs, cwd, _)` reads each file from `cwd` and returns its sha256 hash (reuse the `node:crypto` + `node:fs/promises` pattern from `artifact-observability.test.ts`). Files that do not exist return `hash: null`.

- [x] **TC-LAO-01: first attempt path is -001**.
  - Start from `makeState()` with `steps: {}`.
  - Create a temp dir; write a file at `out/result-001.md` with known content (e.g., `"attempt-1"`).
  - Call `commitSuccess(step, state, deps, result)` where `deps.runtimeStrategy` is the mock above and `deps.cwd` is the temp dir.
  - Assert `store.appendLineage` was called once with `outputs[0].path` matching `out/result-001.md`.
  - Assert `outputs[0].hash` equals `"sha256:" + sha256("attempt-1")` (non-null).

- [x] **TC-LAO-02: second attempt path is -002** (destructive confirmation: reverts to +1 would produce -003 here).
  - After TC-LAO-01 returns the updated state `s1`, write a file at `out/result-002.md` with content `"attempt-2"`.
  - Call `commitSuccess(step, s1, deps, result2)` where `result2` is a fresh success result.
  - Assert `store.appendLineage` was called a second time with `outputs[0].path` matching `out/result-002.md` (not `-003`).
  - Assert `outputs[0].hash` equals `"sha256:" + sha256("attempt-2")` (non-null).
  - Comment in the test: "before this fix, the post-push state had length 2 → nextIteration=3 → path=-003 (missing) → hash=null".

- [x] **TC-LAO-03: round path member path is -001 for first round**.
  - Build a single-member parallel round with the same iteration-dependent step.
  - Start from state with no prior runs.
  - Write `out/result-001.md` in the temp dir.
  - Call `commitRound({ ... members: [{ step, startedAt, result }] ... })`.
  - Assert `store.appendLineage` was called once with `outputs[0].path === "out/result-001.md"` and non-null hash.

- [x] Use `beforeEach`/`afterEach` for temp dir creation and cleanup (`fs.mkdtemp` / `fs.rm`).
- [x] All existing tests in `commit-orchestrator.test.ts` continue to pass without modification.

**Acceptance Criteria**:
- TC-LAO-01: first-attempt lineage path ends in `-001`, hash is non-null and matches file content.
- TC-LAO-02: second-attempt lineage path ends in `-002` (not `-003`), hash non-null and correct. Comment documents the pre-fix wrong behavior.
- TC-LAO-03: parallel round member lineage path ends in `-001`, hash non-null.
- Existing `commit-orchestrator.test.ts` tests pass without any modification.

---

## T-05: Verify typecheck and test pass

- [x] Run `bun run typecheck` — zero errors.
- [x] Run `bun run test` — all tests green, including the new TC-LAO-* tests.
- [x] Confirm `store.appendLineage` is not called when `preWriteIo` is empty (existing behavior for steps without `writes()`).

**Acceptance Criteria**:
- `typecheck` exits 0.
- `test` exits 0.
- No existing test expectations were changed.
