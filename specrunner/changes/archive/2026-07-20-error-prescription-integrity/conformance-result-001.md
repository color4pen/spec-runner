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
| tasks.md | ✅ | All 12 tasks marked `[x]` complete; implementation matches each task's acceptance criteria |
| design.md | ✅ | D1–D6 all implemented; rationales and alternatives respected |
| spec.md | ✅ | All 8 Requirements with their SHALL/MUST normatives satisfied; all Scenarios covered by tests |
| request.md | ✅ | Acceptance criteria T1–T9 all verified; verification passes (559 test files, all green) |

---

## Detail

### tasks.md — all complete

| Task | Key deliverable | Status |
|------|----------------|--------|
| T-01 | `originNotConfiguredError()` factory; `remote.ts` switch | ✅ |
| T-02 | Stale hint replacement (`ps` / `managed setup` / `job list`) | ✅ |
| T-03 | `hint-command-references.test.ts` machine test | ✅ |
| T-04 | `workflow-structure` hint → `specrunner init` | ✅ |
| T-05 | Token hint → `specrunner login` first | ✅ |
| T-06 | `next-steps.ts` + `formatHuman` next steps section | ✅ |
| T-07 | `DoctorContext.configPath` + `file-exists.ts` XDG fix | ✅ |
| T-08 | `DOCTOR_USAGE` + registry entry | ✅ |
| T-09 | `git-fetch-error.ts` + `local.ts` | ✅ |
| T-10 | README "Joining an existing project" | ✅ |
| T-11 | Existing test expectations updated | ✅ |
| T-12 | typecheck && test green | ✅ |

### design.md — D1–D6 verified

- **D1**: `originNotConfiguredError()` added to `src/errors.ts:153–159`; code `NOT_GIT_REPO` (exit 2) preserved; hint contains `"git remote add origin <url>"`; `notGitRepoError()` unchanged. Both `remote.ts:34,44` use the factory.
- **D2**: `src/core/doctor/next-steps.ts` exports pure `deriveNextSteps(results)` with 4-rule dependency-ordered table. `formatHuman` appends `Next steps:` only when non-empty; `formatJson` is unchanged.
- **D3**: `tests/unit/cli/hint-command-references.test.ts` extracts `hint:` literals and `SpecRunnerError` 2nd-arg literals from all source files, validates against `COMMANDS`. All 14 `specrunner managed setup` → `runtime setup`, 1 `specrunner job list` → `job ls`, and `specrunner ps` references replaced.
- **D4**: `DoctorContext.configPath: string` added (`types.ts:157`). `doctor.ts:209` injects `getConfigPath()`. `file-exists.ts:16` reads `ctx.configPath`. `mock-context.ts` provides default `"/fake/home/.config/specrunner/config.json"` so TC-072 passes unchanged.
- **D5**: `src/core/runtime/git-fetch-error.ts` pure function with 4 case-insensitive auth patterns; authentication failures prepend login prescription and preserve raw git detail; non-auth path returns current format bit-for-bit. `local.ts:464` uses the function.
- **D6**: `DOCTOR_USAGE` constant at `command-registry.ts:278` documents `--json` and `--help`; `doctor` entry at `:831` carries `usage: DOCTOR_USAGE`.

### spec.md — all Requirements satisfied

| Requirement | MUST/SHALL clause | Satisfied by |
|-------------|------------------|-------------|
| Origin prescription | hint MUST contain `git remote add`; MUST NOT contain `cd into...` | `originNotConfiguredError()` hint; TC-001 |
| Hint command validity | references MUST be in `COMMANDS`; SHALL place test | `hint-command-references.test.ts`; TC-003/004/005 |
| workflow-structure hint | MUST show `specrunner init`; MUST NOT use manual first | `workflow-structure.ts:59`; TC in workflow-structure-hint.test.ts |
| Token hint | MUST put `specrunner login` first; SHALL keep GH_TOKEN/gh as alternatives | Both token check files; TC in token-hint.test.ts |
| Next steps | MUST emit from fail set; MUST NOT emit when zero fails; MUST NOT change `--json` | `next-steps.ts` + `formatter.ts`; TC-008/009/010 |
| XDG config | MUST use same resolution as `getConfigPath()`; MUST NOT hand-compose from homeDir | `file-exists.ts` uses `ctx.configPath`; TC-011/012 |
| doctor --help | MUST display usage with `--json`; MUST NOT show "No detailed help available." | `DOCTOR_USAGE`; TC-013/020 |
| git fetch auth wrap | MUST prescribe `specrunner login` as first sentence; MUST retain original stderr | `git-fetch-error.ts`; TC-014/015/019 |
| README participant | MUST document install → `specrunner init` → `specrunner login` | README "Joining an existing project" section |

### request.md — acceptance criteria T1–T9

All verified by the test suite (verification result: 559 test files passed, typecheck/lint/coverage all green).

- **T1**: `originNotConfiguredError` hint contains `git remote add`, lacks `cd into a git repository`; code and exit code unchanged; destruction test (`TC-001` reversion scenario) present.
- **T2**: `hint-command-references.test.ts` covers all hint strings; TC-004 verifies that adding a fictitious command causes failure.
- **T3**: Creator fail set → `git init` → `git remote add` → `specrunner login` order confirmed by `next-steps.test.ts`.
- **T4**: Participant fail set → `specrunner init` → `specrunner login` order confirmed.
- **T5**: fail=0 → no next steps section; `formatJson` output structure unchanged (TC-010).
- **T6**: XDG isolation → `config-file-exists` pass; homeDir-fixed mock → fail (TC-011/012, xdg-integration.test.ts).
- **T7**: `doctor --help` emits `DOCTOR_USAGE` with `--json`; "No detailed help available." absent (TC-013/020).
- **T8**: Auth-pattern stderr → first sentence contains `specrunner login`; original stderr preserved; non-auth → unchanged message (TC-014/015/019).
- **T9**: README participant section present; all tests green.

---

## Non-blocking Observations

- `prereqs.ts:35` retains `specrunner login --provider anthropic` (flag value mismatch for `--provider`). tasks.md explicitly marks this out-of-scope for this change. Not a finding.
- `orphan-sidecars.test.ts` was deleted and tests redistributed to `orphan-sidecars-check.test.ts`. All successor tests pass; no regression.
