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
| tasks.md | yes | All 11 tasks (T-01–T-11) have every checkbox marked [x]. |
| design.md | yes | All 6 design decisions (D1–D6) are implemented. See detail below. |
| spec.md | yes | All 5 Requirements and every Scenario are covered by tests. |
| request.md | yes | All 7 acceptance criteria are satisfied. |

---

## Detail

### tasks.md

All checkboxes in T-01 through T-11 are `[x]`. T-11 full verification (typecheck + test) is confirmed by `verification-result.md` (build / typecheck / test / lint all `passed`, 5556 tests).

### design.md

| Decision | Implementation | Status |
|----------|----------------|--------|
| D1 — B-12 structural tooth | `describe("B-12: …")` added to `core-invariants.test.ts` with liveness assertion and allowlist filter. T-09 synthetic guards confirm detection (`src/git/new-helper.ts` → 1 violation; `src/util/git-exec.ts` → 0 violations). | ✓ |
| D2 — Consolidate `src/git/*` onto `git-exec` seam | `dynamic-context.ts` delegates to `gitExec(defaultSpawnFn, …)`; `remote.ts` uses `runSubprocess` + `gitExecExitCode`; `transport-auth.ts` uses `gitExec(defaultSpawnFn, …)`. None import `node:child_process`. Confirmed by grep: 0 matches in `src/git/*.ts` (non-test). | ✓ |
| D3 — Preserve `remote.ts` error discrimination | Non-zero exit from `runSubprocess` triggers `gitExecExitCode(…["rev-parse","--git-dir"])` probe: exit 0 → `SpecRunnerError("NOT_GIT_REPO", …, "Origin remote not configured.")`, else `notGitRepoError()`. Catch block re-throws `SpecRunnerError` transparently. | ✓ |
| D4 — `doctor.ts`: keep `child_process`, strip at call, B-12 allowlist | `buildExecFile` is injectable (`env` + `execFileAsyncImpl` params). Production default calls `stripSecrets(env)`. B-12 allowlist entry records "composition-root; needs execFile timeout+AbortSignal not offered by seam". | ✓ |
| D5 — Narrow B-6 claude allowlist | `agent-runner.ts` L270 collapsed onto one line; `arch-allowlist.ts` B-6 pattern changed to `"resolveClaudeCodeOAuthTokenFn("`. T-09 confirms cast-bearing raw-env spawn on the same file is now flagged. | ✓ |
| D6 — Record B-12 ruling in ADR | Delegated to `adr-gen` step per rules.md. No ADR path written by implementer. | ✓ |

### spec.md

| Requirement | Scenario(s) | Test(s) | Status |
|-------------|-------------|---------|--------|
| `src/git` subprocesses spawn with stripped env | dynamic-context log/diff; remote get-url; transport-auth origin lookup; getOriginInfo repo-state discrimination | `git-spawn-env.test.ts` TC-GIT-ENV-01/02/03; `git-remote.test.ts` TC-013 (non-repo integration) | ✓ |
| `doctor.ts` execFile strips env | doctor execFile env has no GH_TOKEN, preserves PATH | `doctor-execfile-env.test.ts` TC-DOC-ENV-01/02 | ✓ |
| B-12 structural tooth | new `src/git` import flagged; seam import exempt; pre-migration state detectable | B-12 block in `core-invariants.test.ts`; T-09 synthetic tests | ✓ |
| B-6 allowlist site-specific | future cast-bearing spawn flagged; legitimate resolver call exempt | T-09 B-6 narrowing synthetic test | ✓ |
| git transport keeps working after env strip | transport auth args produced from token unchanged | `buildTransportAuthArgs` tests; extraheader injection; verification green | ✓ |

### request.md (acceptance criteria)

| AC | Evidence | Status |
|----|----------|--------|
| `src/git/` subprocesses strip env — tested | `git-spawn-env.test.ts` TC-GIT-ENV-01/02/03 | ✓ |
| `doctor.ts` execFile strips env — tested or guard | `doctor-execfile-env.test.ts` + B-12 allowlist with reason | ✓ |
| env-omission guard exists, red on pre-fix state | B-12 tooth + T-09 `src/git/new-helper.ts` synthetic detection | ✓ |
| `node:child_process` direct import banned outside allowlist | B-12 tooth covers all of `src/`; 5 production files allowlisted; grep confirms no other matches | ✓ |
| B-6 allowlist narrowed; cast-bearing spawn detected | T-09 synthetic injection reports 1 violation | ✓ |
| git push/fetch/log/diff/remote functional after env strip | Transport uses extraheader; all 5556 tests green | ✓ |
| `typecheck && test` green | Verification result: build/typecheck/test/lint all `passed` | ✓ |

---

## Open Item (non-blocking)

**TC-004 "repo with no origin" unit test**: the `rev-parse` probe path in `remote.ts` (D3) is implemented correctly but lacks a direct unit test exercising the `NOT_GIT_REPO` + "Origin remote not configured." outcome. Code-review finding #1 classified this `low / should / Fix: no`; regression-gate confirmed no regression. All `must` ACs are satisfied. Recommended for a follow-up iteration.
