# Regression Gate Result — Iteration 5

**Date**: 2026-07-23
**Checked**: 11 / 11 findings

## Summary

All 11 ledger items verified as fixed in current code. No regressions detected.

---

## Finding Verification

### F-01 [CRITICAL] Bash removed from allowedTools

**File**: `src/adapter/claude-code/agent-runner.ts:566`

```ts
const baseAllowedTools = ["Read", "Grep", "Glob"];
```

Bash is absent. `canUseTool` fires for Bash tool calls, enabling the guard's git-mutation deny branch. **FIXED** ✓

---

### F-02 [CRITICAL] guard unit tests TC-011〜TC-036

**File**: `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`

All required `must` tests confirmed present:

| TC | Line range | Status |
|----|-----------|--------|
| TC-011 | 487–535 | ✓ |
| TC-012 | 541–562 | ✓ |
| TC-013 | 568–596 | ✓ |
| TC-014 | 602–630 | ✓ |
| TC-015 | 636–654 | ✓ |
| TC-017 | 660–685 | ✓ |
| TC-018 | 691–712 | ✓ |
| TC-019 | 916–931 | ✓ |
| TC-021 | 937–967 | ✓ |
| TC-022 | 718–746 | ✓ |
| TC-023 | 752–760 | ✓ |
| TC-025 | 766–775 | ✓ |
| TC-026 | 781–790 | ✓ |
| TC-027 | 796–813 | ✓ |
| TC-028 | 819–836 | ✓ |
| TC-029 | 842–866 | ✓ |
| TC-030 | 973–1005 | ✓ |
| TC-033 | 872–910 | ✓ |

**FIXED** ✓

---

### F-03 [HIGH] ALWAYS_MUTATING list complete

**File**: `src/adapter/claude-code/git-command-classifier.ts:38–63`

All 8 previously missing subcommands confirmed present: `switch`, `revert`, `pull`, `commit-tree`, `update-index`, `fast-import`, `gc`, `prune`. Full set is 23 entries. **FIXED** ✓

---

### F-04 [MEDIUM] TC-SB-02 vs TC-037 contradiction resolved

**File**: `src/adapter/claude-code/__tests__/sandbox-scope.test.ts`

- TC-SB-02 (line 182): `expect(...allowedTools...).not.toContain("Bash")` — now correctly asserts Bash is absent.
- TC-037 (lines 272–313): Explicitly asserts `allowedTools` does not contain `"Bash"`.
- TC-038 (lines 319–334): Asserts `permissionMode === "default"`.

No contradicting assertions remain. **FIXED** ✓

---

### F-05 [LOW] `--set-upstream-to` added to branch mutation flags

**File**: `src/adapter/claude-code/git-command-classifier.ts:179–188`

`isBranchMutationFlag` now includes:
- `"--set-upstream-to"` (bare form)
- `a.startsWith("--set-upstream-to=")` (value-embedded form)
- `"--unset-upstream"`, `"--edit-description"`

**FIXED** ✓

---

### F-06 [LOW] `should` priority tests implemented

All 4 should-priority tests confirmed present:

| TC | Location | Status |
|----|---------|--------|
| TC-010 (leaf constraint) | `git-command-classifier.test.ts:253` | ✓ |
| TC-019 (events/usage/bite-evidence) | `workspace-tool-guard.test.ts:916` | ✓ |
| TC-021 (managed paths, scoped+guarded) | `workspace-tool-guard.test.ts:937` | ✓ |
| TC-030 (guarded declared canon allow) | `workspace-tool-guard.test.ts:973` | ✓ |

**FIXED** ✓

---

### F-07 [LOW] Long-form branch mutation flags added

**File**: `src/adapter/claude-code/git-command-classifier.ts:181–188`

`--delete`, `--move`, `--copy`, `--force` are now explicitly in `isBranchMutationFlag`. **FIXED** ✓

---

### F-08 [CRITICAL] `appendSynthesizedCommit` restored in all 3 files

All 3 files confirmed to import and call `appendSynthesizedCommit` for bootstrap OID:

| File | Import line | Call line |
|------|------------|-----------|
| `src/core/runtime/local.ts` | 61 | 426 |
| `src/core/runtime/managed.ts` | 18 | 256 |
| `src/core/runtime/workspace-materializer.ts` | 27 | 240 |

**FIXED** ✓

---

### F-09 [HIGH] `prCreateResultPath` restored in `pipelineManagedPaths`

**File**: `src/core/pipeline/round-git-scope.ts:110`

```ts
return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug), prCreateResultPath(slug)];
```

5 elements returned (not 4). The corresponding test at `round-git-scope.test.ts:56` asserts `toHaveLength(5)` and `toContain(PR_CREATE_RESULT)`. TC-001 (offending exclusion) is also present. **FIXED** ✓

---

### F-10 [LOW] `buildStepContext` tests verify `managedPaths` / `forbiddenPaths`

**File**: `src/core/step/__tests__/step-context-builder.test.ts`

- TC-039 (lines 133–150): Asserts `managedPaths` equals the 5 pipeline-managed paths and `forbiddenPaths` equals all 6 protected canon paths.
- TC-040 (lines 195–212): Same assertions for guarded step.

**FIXED** ✓

---

### F-11 [LOW] `git branch --contains <sha>` false positive resolved

**File**: `src/adapter/claude-code/git-command-classifier.ts:207–224`

`READ_FILTER_FLAGS` set (`--contains`, `--no-contains`, `--merged`, `--no-merged`, `--points-at`, `--sort`) is defined. Value tokens consumed by these flags are tracked in `consumedValueTokens` and excluded from the positional-arg mutation check. `git branch --contains abc123` no longer misclassifies `abc123` as a branch name. **FIXED** ✓
