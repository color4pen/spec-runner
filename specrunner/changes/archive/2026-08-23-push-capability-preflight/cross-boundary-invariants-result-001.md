# Cross-Boundary Invariants Review — push-capability-preflight

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Date**: 2026-08-23

## Purpose

Detect implicit invariants that the new behavior silently breaks in code the diff did not change. The implementation passes tests and is structurally correct; this review targets cross-cutting assumptions that live in the interaction between mechanisms.

---

## Scope of Diff

35 files, 5,881 insertions / 17 deletions. Core changes:

| Area | Files |
|------|-------|
| New shared-kernel module | `src/git/push-capability.ts` |
| Layer 2 backstop | `src/core/step/commit-push.ts` |
| Layer 1 contract + detection | `src/core/step/implementer.ts`, `src/core/runtime/local.ts`, `src/core/runtime/managed.ts` |
| Halt factory | `src/core/step/step-halt.ts` |
| Executor routing | `src/core/step/executor.ts` |
| maxAttempts | `src/core/step/step-context-builder.ts` |
| Error plumbing | `src/errors.ts` |
| Context injection | `src/core/command/runner.ts`, `src/core/port/step-context.ts` |

---

## Finding 1 — HIGH / FIXABLE

**Title**: `parseUnpushablePathsFromError` creates fragile implicit coupling between error factory and halt factory

**Files**:
- `src/errors.ts` (line ~708, `parseUnpushablePathsFromError`)
- `src/core/step/executor.ts` (line ~489, Layer 2 halt routing)

**Rationale**:

`executor.ts` needs the blocked path list when converting a Layer 2 `UNPUSHABLE_PATH_BLOCKED` error into a `makeUnpushablePathHalt`. Instead of carrying paths on the error object, the implementation embeds them in the error message string and re-parses them with a regex:

```ts
// errors.ts – factory
`commitAndPush blocked: ... protected path(s): ${paths.join(", ")}. Environment constraint: ${source}`

// errors.ts – parser (called from executor.ts)
/protected path\(s\): (.+?)\. Environment/.exec(err.message)
```

The invariant "operator issue comment lists the exact blocked paths" depends on the message format in `unpushablePathBlockedError` matching the regex in `parseUnpushablePathsFromError`. These two functions are co-located in `errors.ts` with a TSDoc note, but there is **no unit test that verifies the round-trip**. If either string changes (rewording, translation, internationalization, adding a period before "Environment"), the regex silently returns `[]` and `makeUnpushablePathHalt` receives an empty `matchedPaths` list.

Operator consequence: the `awaiting-resume` issue comment says "Step X cannot push changes to protected path(s): (none listed)" — zero visibility into which files blocked the push. The job is stuck with no actionable information.

Additional fragility: paths containing `, ` (comma-space) would be mis-split. File paths should not contain this sequence, but no validation prevents it.

**Fix**: Carry `matchedPaths` as a typed property on the error object (e.g., `class UnpushablePathBlockedError extends SpecRunnerError { readonly matchedPaths: string[] }`) so executor.ts reads `finalizeErr.matchedPaths` directly instead of parsing the message string. No regex, no coupling to message format.

---

## Finding 2 — MEDIUM / DECISION-NEEDED

**Title**: `commitScopedPaths` (round-artifact commit path) lacks Layer 2 backstop — Open Question left unresolved

**File**: `src/core/step/commit-push.ts` (`commitScopedPaths`, ~line 967)

**Rationale**:

Design D7 and T-10 both explicitly call out this Open Question:

> 並列レビュー round の成果物コミット経路 (`commitRoundArtifacts` 系) が `commitAndPush` を共有していない場合、そこにも Layer 2 相当が要るか。実装時に呼び出しグラフを確認し、共有していなければ同じヘルパを差す。

The call graph was checked and `commitScopedPaths` is NOT shared with `commitAndPush`. It is called by `LocalRuntime.commitRoundArtifacts` for coordinator-owned round artifacts. The final implementation does **not** add the Layer 2 check to `commitScopedPaths`.

Current risk assessment:
- Low probability: coordinator round steps (code-review, custom reviewers) write markdown result files, not implementation code. No current step declares a `.github/workflows/**` path as a round output.
- Non-zero risk: if a custom reviewer were to declare a workflow file as an output path, it would bypass both Layer 1 (implementer-only) and Layer 2 (`commitAndPush`-only). The violation would reach the remote and be rejected by GitHub with the historical "refusing to allow" error, defeating the entire purpose of this feature.

**Options**:
- **Accept risk**: document the gap; add a note in `commitScopedPaths` that it bypasses the unpushable-path backstop. Accept that only `commitAndPush` is covered.
- **Add the check**: call `collectPublishablePaths` / `matchUnpushablePaths` in `commitScopedPaths` before staging (after a `pushCapability?.patterns.length > 0` guard), mirror the Layer 2 check from `commitAndPush`.

---

## Finding 3 — MEDIUM / FIXABLE

**Title**: `maxAttempts=1` global cap silently reduces `tasks-complete` repair opportunities for ALL implementer runs on GitHub Actions

**File**: `src/core/step/step-context-builder.ts` (line ~133–140)

**Rationale**:

The existing implicit invariant: the implementer step always gets `OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2` follow-up attempts for `tasks-complete` violations.

This PR changes the `maxAttempts` logic:

```ts
const hasUnpushablePath = followUpContracts.some((c) => c.kind === "unpushable-path");
const maxAttempts = hasUnpushablePath ? 1 : OUTPUT_FOLLOWUP_MAX_ATTEMPTS;
```

When running on GitHub Actions with `GITHUB_ACTIONS=true` and a `ghs_` token, `detectPushCapability` returns non-empty patterns. `implementer.outputContracts()` then unconditionally adds an `unpushable-path` contract (regardless of whether the implementer actually modifies any workflow file). This triggers `hasUnpushablePath = true` → `maxAttempts = 1`.

**Every implementer run on GitHub Actions now gets only 1 follow-up attempt for `tasks-complete`**, even when the implementer's changes have nothing to do with workflow files. The `unpushable-path` contract is always present just from the environment declaration.

Scenario:
1. Implementer finishes work — tasks.md has 2 unchecked items.
2. Follow-up #1 sent. Agent fixes 1 item but leaves 1 unchecked.
3. `maxAttempts` exhausted (was 1). Previously would have gotten follow-up #2.
4. Executor's final check finds `tasks-complete` violation → `STEP_OUTPUT_MISSING` (`failed` halt).
5. Job is terminated when it would previously have been repaired in a second attempt.

This behavioral change is documented in the TSDoc at T-08 as a known trade-off, but it affects ALL implementer runs on Actions, not just those that modify workflow files. The cost (1 fewer repair attempt) is paid by every job in the Actions environment even when no workflow changes occur.

**Fix**: Use per-contract attempt tracking instead of a single `maxAttempts` scalar. `tasks-complete` should always get `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` attempts; `unpushable-path` should get 1. The `OutputVerificationPolicy` interface would need a `contractAttempts?: Record<OutputContractKind, number>` field (or similar) to support this independently per kind.

Alternatively (lower-effort): instead of reducing `maxAttempts` globally, limit the follow-up prompt for `unpushable-path` to only appear in the first repair attempt and skip it in subsequent ones. The `buildPrompt` callback receives an `attempt` parameter that can gate the `unpushable-path` section.

---

## Finding 4 — LOW / OBSERVATION

**Title**: TC-026 test name vs. `--no-renames` implementation mismatch in task spec

**File**: `tests/unit/git/push-capability.test.ts` (line ~281)

T-02 spec says "rename 表記 (`R  old -> new`) は old / new の両方を含める". The implementation uses `--no-renames` which eliminates rename entries from `git status` output (replaced by separate D + A entries). TC-026 correctly adapts the test for the actual implementation and includes an explanatory comment, but the task spec language remains misleading. This is a documentation-only inconsistency with no runtime impact.

---

## Verified Invariants (no violation found)

| Invariant | Verdict |
|-----------|---------|
| `ghs_` detection uses `deps.githubToken` (same resolution as existing transport auth, no new token resolution) | ✅ |
| `PushCapability` does not carry the raw token value | ✅ |
| `commitFinalState` does not include worktree workflow files (stages only `pipelineManagedPaths`) — checkpoint push is not blocked | ✅ |
| Layer 1 and Layer 2 use the same `collectPublishablePaths` helper (single truth for path enumeration) | ✅ |
| `LocalRuntime.validateStepOutputs` for `unpushable-path` skips git calls when `contract.patterns` is empty | ✅ |
| `ManagedRuntime.validateStepOutputs` skips `unpushable-path` before the `!branch` early-continue | ✅ |
| SpawnFn adaptation in Layer 2 (`runSubprocess` bridge) is TypeScript-verified for compatibility | ✅ |
| Token is not logged or stored in `PushCapability` | ✅ |
| Executor routes `unpushable-path` violations away from `makeOutputGateHalt` (which would produce `failed` instead of `awaiting-resume`) | ✅ |
| `unpushable-path` contract's empty `path: ""` sentinel never reaches `makeOutputGateHalt`'s path-formatting code | ✅ |
| DSM invariant: `src/git/push-capability.ts` only imports `node:*` and `src/util/*` | ✅ |
| `detectPushCapability` is a pure function; `buildMessage` purity is preserved | ✅ |
| `deps.pushCapability` is set once per run (after `buildDeps`, before `registerCleanup`) | ✅ |

---

## Evidence Summary

- **Checked**: 18 invariants across the diff, surrounding code, and interaction points
- **Skipped**: 0
- **Unverified**: 0 (test green status verified by existing verification-result.md pass record)
