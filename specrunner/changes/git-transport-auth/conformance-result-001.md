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

All checkboxes in T-01 through T-07 are marked `[x]`. Spot-checked against implementation:

- T-01: `src/git/transport-auth.ts` exists with `buildTransportAuthArgs`, `TRANSPORT_SUBCOMMANDS`, `wrapTransportSpawn`, `wrapTransportGitExecSpawn`, `createTransportAuth`.
- T-02: `LocalRuntime` creates `transportAuth` and `wrappedSpawnFn` in constructor; pre-warm at local.ts:436; `buildDeps` sets `spawn = wrappedSpawnFn` and `gitTransportSpawn = wrapGitExecSpawn(defaultSpawnFn)`.
- T-03: `ManagedRuntime` wraps `spawnFn` at managed.ts:57-58; C2/C3/C4 all use `wrappedSpawnFn`.
- T-04: `ArchiveInput.githubToken` added; archive.ts passes resolved token; orchestrator wraps spawn at :94-95.
- T-05: `CancelDeps.githubToken` added (optional); cancel.ts resolves token with try/catch fallback; runner wraps spawn at :161-162.
- T-06: Error messages built from `SpawnResult.stderr` only; test TC-027 verifies no auth material in error output.
- T-07: `src/git/__tests__/transport-auth.test.ts` — 590 lines covering unit tests, wiring tests (TC-015, TC-016, TC-022), and security tests (TC-027). Verification: 328 test files, 4120 tests green.

### design.md

| Decision | Implementation | Conforms |
|----------|----------------|----------|
| D1: basic x-access-token via extraheader | `buildTransportAuthArgs` returns `["-c", "http.<scope>.extraheader=AUTHORIZATION: basic <base64>", ...]` | ✅ |
| D2: host-scoped header + credential.helper= disabled | scope = `${url.protocol}//${url.host}/`; second `-c credential.helper=` | ✅ |
| D3: HTTPS-only, SSH pass-through | git@/ssh:///git:// and non-https protocols return `[]` | ✅ |
| D4: common SpawnFn decorator, entrypoint token | `createTransportAuth` wraps both SpawnFn types; token flows via existing channels | ✅ |
| D5: token excluded from logs | error messages use `SpawnResult.stderr` only; test TC-027 asserts absence of `extraheader`, base64 token, plain token | ✅ |

### spec.md

| Requirement | Scenarios | Conforms |
|-------------|-----------|----------|
| All transport ops MUST self-authenticate (C1–C10) | fetch/push without ambient creds → extraheader injected | ✅ |
| MUST NOT change user git config / persist token | `-c` only; no `git config` writes; no URL rewrite | ✅ |
| Token MUST NOT appear in URL / config / logs | D5 design + TC-027 | ✅ |
| Non-HTTPS origins preserve ambient behavior | SSH origin → `[]` → plain git | ✅ |
| Missing token → clear error / best-effort fallback | `GITHUB_TOKEN_MISSING` at entrypoint; cancel optional-token pattern | ✅ |

### request.md acceptance criteria

| Criterion | Status |
|-----------|--------|
| ambient auth not required for fetch/push | ✅ all 10 call sites injected |
| `~/.gitconfig` / `credential.helper` unchanged | ✅ `-c` only, no persistent writes |
| token not in remote URL / persistent config / logs | ✅ D5 + TC-027 |
| `typecheck && test` green | ✅ verification-result.md: 328 test files, 4120 tests, typecheck passed |

## Non-blocking Finding

**F-001:** `wrapGitExecSpawn` (C5) uses a sync cache; if the pre-warm (`transportAuth.authArgs()` at local.ts:436) is suppressed by `.catch(() => {})` before its promise resolves, the first git-exec push runs without auth. Under normal flow the pre-warm executes immediately before the required `git fetch origin`, so the cache is always populated before any pipeline step push. The fallback-to-plain-git behavior is intentional and explicitly tested.
