# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | Test Coverage — Wiring | `src/git/__tests__/transport-auth.test.ts` (absent) | TC-015 (LocalRuntime C1 fetch), TC-016 (LocalRuntime C5 pushOnly via `gitTransportSpawn`), TC-022 (archive orchestrator C8 main push) are all must-priority and listed as "Automated" in test-cases.md. tasks.md T-07 marks wiring tests as `[x]` done. No test in any file verifies that the wiring actually injects auth args into the real call sites: `this.wrappedSpawnFn` in `local.ts:437`, `deps.gitTransportSpawn` propagation through `StepExecutor`, or `transportAuth.wrapSpawn(input.spawn)` in `orchestrator.ts`. A future refactor could silently disconnect the wiring with no failing test. | Add spy-spawn wiring tests: (1) Construct `LocalRuntime` with a spy `spawnFn` and injected `resolveOriginUrl`; call `setupWorkspace`; assert `git fetch` argv contains `-c http.*.extraheader`. (2) Pass a spy `gitTransportSpawn` into `PipelineDeps` / `StepExecutor` and assert push argv has auth args. (3) Call `runArchiveOrchestrator` with `githubToken` and a spy `spawn`; assert C8 push argv contains auth args. | yes |
| 2 | MEDIUM | Correctness — GHES non-standard port | `src/git/transport-auth.ts:61` | Scope is derived as `` `${url.protocol}//${url.hostname}/` `` using `url.hostname`, which excludes the port. For GHES on a non-standard port (e.g., `https://github.corp.com:8443/owner/repo.git`) the scope becomes `https://github.corp.com/`. Git's `http.<url>.extraheader` prefix-match does not match `https://github.corp.com:8443/` with that scope, so auth injection silently degrades to no-auth while `credential.helper=` is still disabled for the invocation — causing transport failure instead of authenticated success. | Change line 61 to `` const scope = `${url.protocol}//${url.host}/`; ``. `url.host` includes the port only when it differs from the protocol default, so `github.com` is unaffected and non-standard GHES ports are fixed. | yes |
| 3 | LOW | Robustness — rejected Promise memoized | `src/git/transport-auth.ts:183–196` | If a caller-injected `resolveOriginUrl` throws, `resolvePromise` is set to a rejected Promise and never cleared. All subsequent `authArgs()` calls return the same rejected Promise. In production this is harmless (the default `getRawOriginUrl` catches all errors and returns `undefined`), but test resolvers that throw will see the rejection propagated across multiple calls. | Wrap the resolution in try/catch; on error set `resolvePromise = null` and return `[]`. Example: assign `cachedArgs = []` in the catch block, then `return cachedArgs`. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.15

## Summary

The core module is correct and well-structured. `buildTransportAuthArgs` generates the right per-invocation `-c` args (D1/D2), transport subcommand gating is accurate (D3/D4), and memoization prevents redundant origin resolution. Wiring code is structurally present and type-correct at all 6 injection points. Verification green (typecheck + 4120 tests).

Blocking: the must-priority wiring integration tests (TC-015, TC-016, TC-022) that verify auth args actually reach git call sites are absent from the test suite — tasks.md marks them done incorrectly. The MEDIUM finding (GHES non-standard port) is a real functional bug for `url.hostname` vs `url.host` in scope derivation.

