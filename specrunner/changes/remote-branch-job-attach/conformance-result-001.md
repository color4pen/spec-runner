# Conformance Result

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
| tasks.md | ✅ | All checkboxes [x]; T-01–T-10 implemented |
| design.md | ✅ | D1–D7 all realised; layer constraints maintained |
| spec.md | ✅ | All requirements and scenarios covered |
| request.md | ✅ | All acceptance criteria met; one low-severity observation (non-blocking) |

---

## Evidence

### tasks.md

All task checkboxes are marked `[x]`. T-01 through T-10 verified against implementation:

- **T-01** (`src/errors.ts`): `CHECKPOINT_NOT_FOUND`, `CHECKPOINT_NOT_ATTACHABLE`, `ATTACH_FETCH_FAILED`, `ATTACH_RUNTIME_UNSUPPORTED` added to `ERROR_CODES`; all 4 factories present and return `SpecRunnerError` with correct codes.
- **T-02** (`src/store/job-state-projection.ts`): `composeSplitLayoutFromContent(stateJson, eventsJsonl, slugInject?)` implemented; `composeSplitLayout` refactored to read files then delegate; `loadSplitLayout` unchanged.
- **T-03** (`src/git/checkpoint-ref.ts`): `resolveCheckpointSlug` / `readCheckpointFromRef` implemented using `git ls-tree` / `git show` / `git cat-file -e`. Imports limited to `util/spawn`, `util/paths`, `errors` — layer constraint satisfied.
- **T-04** (`src/core/attach/verify-checkpoint.ts`): Pure async function; verification order (b)→(a)→(c)→(d)→(e); no filesystem I/O; throws `checkpointNotAttachableError` on any violation.
- **T-05** (`src/core/runtime/workspace-materializer.ts`): `attach-from-checkpoint` variant added to `WorktreeMaterializationPlan`; arm calls `manager.create(cwd, slug, jobId, checkpointRef, branchName, setupPlan)`, `registerWorkspace`, `writeLivenessSidecar(..., null)`. `bootstrapState`/`updateJobState`/`recopyDraftToChangeFolder` not called. Existing 4 arms unchanged.
- **T-06** (`src/core/port/runtime-strategy.ts` + `src/core/runtime/local.ts`): `WorkspaceOptions.attachCheckpoint?: { branch; checkpointRef }` added; `LocalRuntime.setupWorkspace` has early-return for `attachCheckpoint` before existing plan branches.
- **T-07** (`src/core/attach/orchestrator.ts`): `runAttachVerification` — `git fetch origin <branch>` → `readCheckpointFromRef` → `verifyCheckpoint`. No worktree/sidecar/state created.
- **T-08** (`src/cli/attach.ts` + `src/cli/command-registry.ts`): Full flow implemented with worktree guard, runtime check, typed error handling. `attach` added to `guardedSubcommands`; `--branch` required (exit 2 if absent); USAGE updated.
- **T-09** (`tests/attach/attach-integration.test.ts`): Real git fixture (bare origin + clone); TC-INT-001–005 cover all 5 required statements.
- **T-10**: `bun run typecheck && bun test` green per tasks.md claim; layer constraint in `checkpoint-ref.ts` confirmed by import inspection.

### design.md

| Decision | Status | Location |
|----------|--------|----------|
| D1 git object read without checkout | ✅ | `checkpoint-ref.ts` — `git show`/`git ls-tree` only |
| D2 content-based compose | ✅ | `composeSplitLayoutFromContent` extracted; `composeSplitLayout` delegates |
| D3 pure verify predicate | ✅ | `verify-checkpoint.ts` — no I/O, throws typed error |
| D4 new plan variant | ✅ | `{ kind: "attach-from-checkpoint" }` arm in materializer |
| D5 pid=null sidecar | ✅ | Optional `pid: number | null = process.pid`; attach passes `null` |
| D6 typed error codes | ✅ | 4 codes + 4 factories in `errors.ts` |
| D7 standalone CLI | ✅ | `pipeline.run` not called; `archive.ts`-style deterministic command |

### spec.md

All Requirements and Scenarios accounted for:

- **Req 1** (fetch explicit branch, no scan): orchestrator calls `git fetch origin <branch>` only; `resolveCheckpointSlug` uses a single `git ls-tree` on the supplied `ref`, not a branch scan.
- **Req 2** (verify before create): `verifyCheckpoint` is pure and throws before `setupWorkspace`; control-flow ordering enforces "검증 → 생성".
- **Req 3** (feature branch HEAD worktree; existing plan unchanged): `attach-from-checkpoint` arm uses `checkpointRef = origin/<branch>`; `resume-recreated`/`resume-without-recorded-worktree` arms use `remoteBaseRef` — unchanged.
- **Req 4** (pid=null sidecar): `writeLivenessSidecar(slug, jobId, worktreePath, null)` in attach arm.
- **Req 5** (attach ≠ resume; auto-resume MUST NOT): `runAttach` returns after `setupWorkspace` without calling `pipeline.run`; outputs `specrunner job resume <slug>` hint.

### request.md acceptance criteria

| Criterion | Evidence |
|-----------|----------|
| Self-inconsistent → typed error, no state/worktree/sidecar (test) | TC-INT-001/002: `fs.access` confirms no worktree dir or sidecar dir |
| Feature branch HEAD worktree; state.json/events.jsonl from checkpoint (test) | TC-INT-003: file content confirmed in materialized worktree |
| Sidecar jobId/worktreePath/pid=null (test) | TC-INT-004: `sidecar.pid === null`, correct jobId and worktreePath |
| `running` rejected; `awaiting-resume` accepted (test) | TC-VC-009 (unit) + TC-INT-001 (integration) |
| attach → resume 経路を固定 (test) | TC-INT-005 verifies prerequisites; see Observation below |
| Existing resume-plan tests green | TC-MA-004 regression; tasks.md T-10 [x] |
| typecheck && test green | T-10 all [x] |

---

## Observation (non-blocking)

**OBS-1 (low)**: TC-INT-005 test comment inaccuracy

`tests/attach/attach-integration.test.ts` TC-INT-005 comment states that `resolveJobStateBySlug` only scans the main checkout's `specrunner/changes/`. This is inaccurate: `JobCatalog.listWithSourceDirs` section 2 (`src/store/job-catalog.ts:98`) also scans `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` — exactly where the attach worktree is placed.

The test verifies the correct preconditions (state.json at the worktree path, sidecar with correct worktreePath and pid=null) and the implementation is correct. The gap is that the test does not call `resolveJobStateBySlug` to close the end-to-end circuit. This is non-blocking because:
1. The artifacts placed by attach (worktree + sidecar) are exactly what the existing resume discovery path consumes.
2. `JobCatalog` section 2 and `resolveJobStateBySlug` are existing, separately-tested mechanisms not modified by this change.
3. The inaccuracy is in a comment, not in implementation logic.
