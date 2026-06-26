# Test Cases: subprocess-credential-seam

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 18
- **Manual**: 1
- **Priority**: must: 17, should: 2, could: 0

---

### TC-001: dynamic-context git log/diff env contains no secrets

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `src/git` subprocesses MUST spawn git with stripped env > Scenario: dynamic-context git log/diff env contains no secrets

---

### TC-002: remote get-url env contains no secrets

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `src/git` subprocesses MUST spawn git with stripped env > Scenario: remote get-url env contains no secrets

---

### TC-003: transport-auth origin lookup env contains no secrets

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `src/git` subprocesses MUST spawn git with stripped env > Scenario: transport-auth origin lookup env contains no secrets

---

### TC-004: getOriginInfo still distinguishes repo states

- **Category**: unit
- **Priority**: should
- **Source**: spec.md > Requirement: `src/git` subprocesses MUST spawn git with stripped env > Scenario: getOriginInfo still distinguishes repo states

---

### TC-005: doctor execFile env contains no secrets

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: doctor's execFile MUST spawn with stripped env > Scenario: doctor execFile env contains no secrets

---

### TC-006: a new direct import in src/git is flagged by B-12

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: direct `node:child_process` import MUST be confined to the spawn seam > Scenario: a new direct import in src/git is flagged

---

### TC-007: the seam's own node:child_process import is exempt from B-12

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: direct `node:child_process` import MUST be confined to the spawn seam > Scenario: the seam's own import is exempt

---

### TC-008: the pre-migration src/git state is detectable by B-12

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: direct `node:child_process` import MUST be confined to the spawn seam > Scenario: the pre-migration src/git state is detectable

---

### TC-009: a future cast-bearing raw-env spawn in agent-runner.ts is flagged by narrowed B-6

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: the B-6 claude allowlist entry MUST be site-specific > Scenario: a future cast-bearing raw-env spawn in the same file is flagged

---

### TC-010: the legitimate OAuth resolver call-site remains allowlisted under narrowed B-6

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: the B-6 claude allowlist entry MUST be site-specific > Scenario: the legitimate resolver input remains allowlisted

---

### TC-011: transport auth args are still produced from a token after env strip

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: git transport and read commands MUST keep working after the env strip > Scenario: transport auth args are still produced from a token

---

### TC-012: dynamic-context.ts has no direct node:child_process import after migration

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/git/dynamic-context.ts` has been migrated per T-01 (direct `execFile` calls replaced with `gitExec(defaultSpawnFn, cwd, args)`)  
**WHEN** the source file is inspected for `from "node:child_process"` import statements  
**THEN** no such import exists in `dynamic-context.ts`

---

### TC-013: transport-auth.ts has no direct node:child_process import after migration

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `src/git/transport-auth.ts` has been migrated per T-02 (`getRawOriginUrl` delegates to `gitExec`)  
**WHEN** the source file is inspected for `from "node:child_process"` import statements  
**THEN** no such import exists in `transport-auth.ts`

---

### TC-014: remote.ts has no direct node:child_process import after migration

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** `src/git/remote.ts` has been migrated per T-03 (`getOriginInfo` rewritten using `runSubprocess` and `gitExecExitCode`)  
**WHEN** the source file is inspected for `from "node:child_process"` import statements  
**THEN** no such import exists in `remote.ts`

---

### TC-015: B-12 grep liveness — raw match count is greater than zero

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** the B-12 tooth greps `from ['"]node:child_process` across `src/`  
**WHEN** the raw (pre-allowlist) matches are collected  
**THEN** the count is greater than 0, ensuring a broken grep that returns nothing cannot produce a vacuously passing test

---

### TC-016: existing git-remote no-git-repo test updated to mock spawn (not execFile)

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-10

**GIVEN** `remote.ts` now spawns via the `git-exec` seam (which uses `node:child_process` `spawn`, not `execFile`)  
**WHEN** the updated TC-013 in `tests/git-remote.test.ts` mocks `node:child_process` `spawn` to close with a non-zero exit code and calls `getOriginInfo`  
**THEN** `getOriginInfo` rejects with a `SpecRunnerError` carrying code `NOT_GIT_REPO`

---

### TC-017: remote.ts uses seam arg-array spawn — no string-shell exec call

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-10

**GIVEN** the migrated `src/git/remote.ts`  
**WHEN** the source is inspected for import provenance and spawn style  
**THEN** it imports from `../util/git-exec.js` (not `node:child_process`) and contains no string-shell `exec(` invocation, preserving shell-injection safety

---

### TC-018: post-migration, exactly the five allowlisted files import node:child_process

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-11 Acceptance Criteria

**GIVEN** all migrations T-01 through T-04 have been applied and the B-12 allowlist contains exactly: `src/util/spawn.ts`, `src/util/git-exec.ts`, `src/core/verification/commands.ts`, `src/core/verification/runner.ts`, `src/cli/doctor.ts`  
**WHEN** `grep -rn 'from ['"'"'"]node:child_process' src/` is run across the repository  
**THEN** only those five files appear in the results — no `src/git/*` file is present

---

### TC-019: typecheck passes after all changes

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md > T-11 Acceptance Criteria

**GIVEN** all tasks T-01 through T-09 are applied (seam migrations, env strips, B-12 tooth, B-6 narrowing, new test files)  
**WHEN** `bun run typecheck` is executed  
**THEN** the command exits with code 0 and reports no type errors

---

## Result

```yaml
result: completed
total: 19
automated: 18
manual: 1
must: 17
should: 2
could: 0
blocked_reasons: []
```
