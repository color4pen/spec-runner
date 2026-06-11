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
| tasks.md | ✅ yes | All checkboxes [x] in T-01 through T-07 |
| design.md | ✅ yes | D1–D5 all implemented; see detail below |
| spec.md | ✅ yes | All 5 requirements and 7 scenarios satisfied |
| request.md | ✅ yes | All 4 acceptance criteria met; typecheck+test green |

## Detail

### tasks.md

All checkboxes in T-01 through T-07 are marked `[x]`. Verified against implementation:

- **T-01**: `src/git/transport-auth.ts` — `buildTransportAuthArgs`, `TRANSPORT_SUBCOMMANDS`, `wrapTransportSpawn`, `wrapTransportGitExecSpawn`, `createTransportAuth` all present and correct.
- **T-02**: `LocalRuntime` initialises `transportAuth` and `wrappedSpawnFn` in constructor (local.ts:105–106); pre-warms cache before fetch (local.ts:436); `buildDeps` sets `spawn = wrappedSpawnFn` (C7) and `gitTransportSpawn = wrapGitExecSpawn(defaultSpawnFn)` (C5); `commitFinalState` uses `wrappedSpawnFn` (C6); `PipelineDeps.gitTransportSpawn` field added to types.ts; `run.ts` passes it to `StepExecutor`.
- **T-03**: `ManagedRuntime` wraps `spawnFn` at managed.ts:57–58; C2 (`.catch(() => {})`), C3, C4 all use `wrappedSpawnFn`.
- **T-04**: `ArchiveInput.githubToken` field added; `archive.ts` passes resolved token to both `runMergeThenArchive` and `runArchiveOrchestrator`; `merge-then-archive.ts` forwards token to downstream orchestrator calls; orchestrator wraps spawn at orchestrator.ts:94–95.
- **T-05**: `CancelDeps.githubToken` is optional; `cancel.ts` resolves token with try/catch (undefined on failure, cancel not aborted); runner wraps spawn at runner.ts:161–162.
- **T-06**: Error messages constructed from `SpawnResult.stderr` only; no argv logging present; TC-027 asserts no `extraheader`, no base64 token, no plain token in `stderr` or constructed error message.
- **T-07**: `src/git/__tests__/transport-auth.test.ts` (590 lines) covers unit tests for `buildTransportAuthArgs` and wrappers, wiring tests (TC-015, TC-016, TC-022), memoisation tests, and security/D5 tests (TC-027). Verification confirmed 328 test files / 4120 tests green.

### design.md

| Decision | Implementation | Conforms |
|----------|----------------|----------|
| D1: basic x-access-token via per-invocation extraheader | `buildTransportAuthArgs` → `["-c", "http.<scope>.extraheader=AUTHORIZATION: basic <base64>", ...]` | ✅ |
| D2: host-scoped header + `credential.helper=` disabled | `scope = "${url.protocol}//${url.host}/"` (includes port for GHES); second `-c credential.helper=` | ✅ |
| D3: HTTPS-only injection; SSH/other pass-through | `git@`, `ssh://`, `git://`, non-https protocol → `[]` | ✅ |
| D4: common SpawnFn decorator; entrypoint-resolved token | `createTransportAuth` wraps both `UtilSpawnFn` and `GitExecSpawnFn`; token from `LocalRuntime.githubToken` / `ManagedRuntime.githubToken` / `ArchiveInput.githubToken` / `CancelDeps.githubToken` | ✅ |
| D5: token excluded from logs | error strings built from `SpawnResult.stderr`; no argv in log paths; TC-027 asserts absence | ✅ |

### spec.md

| Requirement | Scenarios | Conforms |
|-------------|-----------|----------|
| All transport ops MUST self-authenticate (C1–C10) | fetch without ambient creds → `extraheader` injected; per-step feature-branch push → `extraheader` injected | ✅ |
| MUST NOT change user git config nor persist token | `-c` per-invocation only; no `git config` writes; no URL rewrite confirmed by test | ✅ |
| Token MUST NOT appear in remote URL, persistent config, or logs | D5 design; TC-027 asserts absence in `stderr` and constructed error messages | ✅ |
| Non-HTTPS origins preserve ambient git behavior | SSH origin → `[]` → plain git invocation | ✅ |
| Missing token → clear error (required) / warning and continue (best-effort) | `GITHUB_TOKEN_MISSING` at entrypoint for required paths; cancel optional-token pattern for best-effort C10 | ✅ |

### request.md acceptance criteria

| Criterion | Status |
|-----------|--------|
| ambient git auth not required for job fetch and push | ✅ all 10 call sites (C1–C10) injected with resolved token |
| `~/.gitconfig` / `credential.helper` unchanged | ✅ `-c` only; no persistent writes |
| token not in remote URL, persistent git config, or logs | ✅ D5 + TC-027 |
| `typecheck && test` green | ✅ verification-result.md: build / typecheck / test / lint all passed; 328 test files, 4120 tests |

## Notes

F-001 (`wrapGitExecSpawn` sync-cache fallback) is an accepted decision. Under normal flow the pre-warm at local.ts:436 always precedes any pipeline-step push, making the fallback unreachable in practice. The fallback is intentional and covered by TC-027.
