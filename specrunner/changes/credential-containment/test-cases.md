# Test Cases: credential-containment

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 14, should: 6, could: 0

---

### TC-001: codex subprocess env contains no cross-provider keys

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex subprocess MUST NOT inherit cross-provider credential keys > Scenario: codex subprocess env contains no cross-provider keys

---

### TC-002: codex keeps its own API key

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: codex subprocess MUST NOT inherit cross-provider credential keys > Scenario: codex keeps its own API key

---

### TC-003: git subprocess env contains no denylist keys

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git-exec spawn MUST use stripped env > Scenario: git subprocess env contains no denylist keys

---

### TC-004: git show subprocess env contains no denylist keys

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification `git show` MUST use stripped env > Scenario: git show subprocess env contains no denylist keys

---

### TC-005: pattern-matched key is removed by stripSecrets

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `SECRET_DENYLIST` MUST cover wildcard patterns > Scenario: pattern-matched key is removed

---

### TC-006: benign variables are preserved by stripSecrets

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `SECRET_DENYLIST` MUST cover wildcard patterns > Scenario: benign variables are preserved

---

### TC-007: stripSecrets does not mutate the original object

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: `SECRET_DENYLIST` MUST cover wildcard patterns > Scenario: original object is not mutated

---

### TC-008: sk-ant token with underscore in body is fully masked

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `maskSensitive` MUST fully mask `_`-containing token bodies > Scenario: sk-ant token with underscore in body is fully masked

---

### TC-009: uppercase sk-ant variant is masked with prefix preserved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `maskSensitive` MUST fully mask `_`-containing token bodies > Scenario: uppercase variant is masked

---

### TC-010: sk- generic long key with underscores is masked

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `maskSensitive` MUST fully mask `_`-containing token bodies > Scenario: sk- generic long key is masked

---

### TC-011: unguarded spawn in adapter directory is detected as B-6 violation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: B-6 architecture test MUST scan `src/adapter/` and `src/util/` > Scenario: unguarded spawn in adapter is detected

---

### TC-012: stripSecrets-guarded call-site in adapter is exempt from B-6 violation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: B-6 architecture test MUST scan `src/adapter/` and `src/util/` > Scenario: stripSecrets-guarded call-site is exempt

---

### TC-013: gitExecExitCode also strips secrets from spawned process env

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: Add unit tests for `git-exec` env stripping

**GIVEN** `GH_TOKEN` and `GITHUB_TOKEN` are present in the ambient `process.env` and a spy `SpawnFn` captures opts
**WHEN** `gitExecExitCode(spyFn, "/tmp", ["status"])` is called
**THEN** the captured `opts.env` does not contain `GH_TOKEN` or `GITHUB_TOKEN`

---

### TC-014: PATH is preserved in git-exec spawned process env

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: Add unit tests for `git-exec` env stripping

**GIVEN** `PATH` is set in the ambient `process.env` and a spy `SpawnFn` captures opts
**WHEN** `gitExec(spyFn, "/tmp", ["status"])` is called
**THEN** the captured `opts.env` contains `PATH` with its original value

---

### TC-015: OPENAI_API_KEY is absent from the env dict passed to codex Codex constructor

**Category**: unit
**Priority**: must
**Source**: design.md > D2 — Codex SDK: pass `env` option + explicit `apiKey`, D3 — Pattern-based denylist extension

**GIVEN** `process.env.OPENAI_API_KEY` is set to `"sk-openai-xxx"` and a spy wraps the `Codex` constructor
**WHEN** the default codex factory is invoked
**THEN** the `env` object passed to `new Codex(opts)` does NOT contain `OPENAI_API_KEY` (pattern `*_API_KEY` strips it), while `opts.apiKey` equals `"sk-openai-xxx"`

---

### TC-016: apiKey is absent in codex opts when OPENAI_API_KEY is unset

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10: Add unit tests for codex adapter env containment

**GIVEN** `OPENAI_API_KEY` is not set in `process.env`
**WHEN** the default codex factory is invoked
**THEN** `opts.apiKey` is `undefined` (the `apiKey` key is not present in the opts object)

---

### TC-017: non-secret string passes through maskSensitive unchanged

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Add unit tests for fixed `maskSensitive`

**GIVEN** a string containing no token patterns (e.g. `"running job abc123 on node-1"`)
**WHEN** `maskSensitive` is called
**THEN** the returned string equals the input string exactly

---

### TC-018: gho_ / ghr_ GitHub token variants are masked by maskSensitive

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04: Add unit tests for fixed `maskSensitive`

**GIVEN** a string containing `gho_ABCdef123` and another containing `ghr_XYZ789abc`
**WHEN** `maskSensitive` is called on each string
**THEN** each result contains `gho_...` / `ghr_...` respectively and does NOT contain the token body after the prefix

---

### TC-019: B-6 architecture test passes with zero violations after all fixes are applied

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11: Extend B-6 architecture test + update allowlist

**GIVEN** the fixes from T-01, T-05, T-07, T-09 are applied and the allowlist entries from T-11 are present
**WHEN** the B-6 `it` block runs and greps `src/core/`, `src/adapter/`, and `src/util/` for raw `process.env` references
**THEN** after applying the `stripSecrets` content-filter and the B-6 allowlist, the violations array is empty and the test is green

---

### TC-020: PATH is preserved in verification git show spawned process env

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08: Add unit tests for verification `git show` env stripping

**GIVEN** `PATH` is set in the ambient `process.env` and `node:child_process` `spawn` is mocked to capture arguments
**WHEN** `runVerification` reaches the `checkPackageJsonScriptsIntegrity` git show call
**THEN** the `env` argument captured by the mock contains `PATH` with its original value

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 14
should: 6
could: 0
blocked_reasons: []
```
