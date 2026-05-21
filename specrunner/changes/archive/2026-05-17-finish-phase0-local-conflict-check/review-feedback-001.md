# Review Feedback: finish-phase0-local-conflict-check

Reviewed: `src/core/finish/local-conflict-check.ts`, `src/core/finish/orchestrator.ts`, `tests/unit/core/finish/local-conflict-check.test.ts`, `tests/finish-orchestrator.test.ts`, `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md`

---

### [major] `parseConflictPaths` misses `modify/delete` conflict type paths in real git output

**file**: `src/core/finish/local-conflict-check.ts:78`

**description**: The regex `/Merge conflict in (.+)$/` only matches lines that contain the literal string `"Merge conflict in"`. For `content`-type conflicts, real git output is:
```
CONFLICT (content): Merge conflict in src/foo.ts
```
This matches correctly. However, for `modify/delete`-type conflicts, real `git merge-tree --write-tree` output is:
```
CONFLICT (modify/delete): file.txt deleted in branch-del and modified in HEAD.  Version HEAD of file.txt left in tree.
```
No `"Merge conflict in"` phrase appears, so the path is silently dropped from `conflictPaths`. This was confirmed by running `git merge-tree --write-tree` against a real `modify/delete` conflict (git 2.39).

Per design §6, exit code is authoritative and path extraction is best-effort, so the function still returns `{ ok: false, conflictPaths: [] }` — the Phase 1 block is correct. However, the user-facing escalation message would show `"(paths could not be determined)"` even though modify/delete paths are recoverable with a slightly broader regex.

Additionally, test-cases.md TC-LCC-2 and TC-LCC-5 describe the mock stdout using the format `CONFLICT (modify/delete): src/bar.ts deleted in HEAD` (without "Merge conflict in"). The corresponding unit tests in `local-conflict-check.test.ts` correctly use the real `"Merge conflict in"` prefix for the mock data — making the tests pass — but the mocked format for `modify/delete` in TC-LCC-5 (`"CONFLICT (modify/delete): Merge conflict in tests/unit/foo.test.ts"`) does not match real git output. The tests pass because the "Merge conflict in" prefix was added to the mock, but the test-cases.md specification does not reflect real git behavior for this conflict type.

**suggestion**: The simplest improvement is a second regex branch that handles non-"Merge conflict in" lines. Alternatively, parse the path from the segment between `: ` and the first ` deleted in ` / ` modified in ` / ` added in `:

```typescript
function parseConflictPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes("CONFLICT")) continue;
    // Pattern 1: "Merge conflict in <path>" (content / add-add conflicts)
    const m1 = /Merge conflict in (.+)$/.exec(line);
    if (m1 && m1[1]) { paths.push(m1[1].trim()); continue; }
    // Pattern 2: "<path> deleted in / modified in / added in" (modify/delete etc.)
    const m2 = /CONFLICT \([^)]+\): (.+?) (?:deleted|modified|added) in/.exec(line);
    if (m2 && m2[1]) { paths.push(m2[1].trim()); }
  }
  return paths;
}
```

If keeping best-effort as-is is acceptable, update test-cases.md TC-LCC-2 to document the limitation accurately (i.e., `modify/delete` paths may not appear in `conflictPaths`).

---

### [minor] TC-125 semantics silently changed by the new Phase 0 step

**file**: `tests/finish-orchestrator.test.ts:402`

**description**: TC-125 ("Phase 1 escalation → markJobArchived NOT called") stubs `git fetch` to return `exitCode: 1`. Before this change, that failure would happen in Phase 1 (`checkoutFeatureBranch`). After this change, the Phase 0 local conflict check fires first and fails on `git fetch origin main` (same spawn mock catches it). The test still asserts `exitCode: 1` and `status === "awaiting-merge"`, so it passes — but the test comment `// Phase 1: git fetch fails` and its describe label `"Phase 1 escalation"` are now misleading. The scenario being tested is actually Phase 0 local conflict check fetch failure, not a Phase 1 failure.

**suggestion**: Update TC-125 to separate Phase 0 and Phase 1 fetch failures explicitly. Either (a) exclude Phase 0 fetch by making it succeed for `args[2] === "main"` and fail only for `args[2] === "feat/test-slug"`, or (b) update the describe/comment to acknowledge the scenario now exercises Phase 0.

Example fix for option (a):
```typescript
if (cmd === "git" && args[0] === "fetch") {
  // Phase 0 conflict check fetches main → succeed
  if (args[2] === "main") return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  // Phase 1 feature branch fetch → fail
  return Promise.resolve({ exitCode: 1, stdout: "", stderr: "remote error" });
}
```

---

### [minor] test-cases.md mock stdout format does not match real git output for `modify/delete` conflicts

**file**: `specrunner/changes/finish-phase0-local-conflict-check/test-cases.md:31`

**description**: TC-LCC-2 GIVEN block specifies mock stdout as:
```
CONFLICT (content): src/foo.ts
CONFLICT (modify/delete): src/bar.ts deleted in HEAD
```
The `content` line is also wrong (real git: `CONFLICT (content): Merge conflict in src/foo.ts`). Both formats differ from what `git merge-tree --write-tree` actually emits. The unit tests in `local-conflict-check.test.ts` use the correct format with "Merge conflict in", so the tests work, but the test-cases.md spec is inaccurate as a reference document.

TC-LCC-5 has the same issue: `CONFLICT (modify/delete): c/d.ts deleted in HEAD` is not what git outputs.

**suggestion**: Update TC-LCC-2 and TC-LCC-5 GIVEN blocks to use the real git output format, and add a note that `modify/delete` paths may not be extracted (best-effort per design §6).

---

### [praise] Exit-code-as-authority design is correctly implemented

**file**: `src/core/finish/local-conflict-check.ts:52-60`

**description**: The function correctly treats `exit code !== 0` as the authoritative conflict signal and returns `{ ok: false, conflictPaths: [] }` even when path parsing yields nothing. This matches design §6 exactly and prevents any false-negative (wrongly returning `{ ok: true }` due to parse failure).

---

### [praise] Orchestrator integration is structurally correct

**file**: `src/core/finish/orchestrator.ts:116-152`

**description**: The insertion point (after `runPreflight` success, before the `--dry-run` branch) is correct. `!flags.dryRun && prViewData.state !== "MERGED"` accurately matches the two skip conditions from design §2 and §3. The try/catch split between conflict result handling and fetch-failure escalation is clean and matches the tasks.md spec verbatim. No `transitionJob` is called on conflict detection.

---

### [praise] TC-LCC-ORCH-5 (re-run not blocked) tests the state invariant correctly

**file**: `tests/finish-orchestrator.test.ts:1017`

**description**: The test verifies the round-trip: first run detects conflict → state stays at `awaiting-merge` → second run with conflict resolved → exits 0. This directly validates design §4 ("State 変更なし") and the `assertJobFinishable` pass-through guarantee. Well-structured.

---

### [minor] TC-LCC-ORCH-6 task label mismatch — test covers dry-run, not "existing behavior preserved"

**file**: `tests/finish-orchestrator.test.ts:1060`

**description**: The describe label is "TC-LCC-ORCH-6: dry-run skips local conflict check". The tasks.md TC-LCC-ORCH-6 is "Existing Phase 0/1/2/3 tests still pass (regression-free)". The implemented test covers TC-LCC-ORCH-7 from test-cases.md (dry-run skip). The regression test coverage of TC-LCC-ORCH-6 (tasks.md) is implicit in the pre-existing tests, not an explicit new test. This is acceptable since regression coverage comes from the full suite, but the label adds confusion.

**suggestion**: Rename the describe to `"TC-LCC-ORCH-7 (tasks TC-LCC-ORCH-DRYRUN): dry-run skips local conflict check"` to avoid mislabeling, or add a comment explaining that TC-LCC-ORCH-6 regression is covered by the existing test suite.

---

### [praise] Delta spec check #8 is complete and covers all required scenarios

**file**: `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md`

**description**: The delta spec correctly documents all four scenarios (conflict detection, fetch failure, pass-through, post-escalation re-run) and accurately captures the skip conditions (MERGED, dry-run). The "exit code is authoritative" and "deterministic, no retry" properties are explicitly stated.

---

## Summary

The implementation is functionally correct and matches the core design intent. Phase 1 is reliably blocked on conflict, state is not mutated, and recovery is possible. The critical behavioral gap is that `modify/delete` conflict paths are silently dropped from `conflictPaths` — per design this is acceptable (exit code is authoritative), but the user will see `"(paths could not be determined)"` for those paths even though they are recoverable. The test-cases.md mock format is inaccurate for this conflict type, which creates a misleading spec document even though the unit tests themselves use correct data.

- **verdict**: needs-fix
