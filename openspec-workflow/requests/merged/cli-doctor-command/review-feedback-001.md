## Code Review Result

**Verdict**: needs-fix
**Score**: 7.05 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.05** |

> Note: Although Total ≥ 7.0, the presence of HIGH findings forces verdict = `needs-fix`
> per review-standards.md ("CRITICAL ≥ 1 または HIGH ≥ 1 の findings が存在する場合、verdict は自動的に `needs-fix`").

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS (`bun run build` exit 0) |
| Type Check | PASS (`bun run typecheck` exit 0) |
| Lint | N/A (no eslint config in repo) |
| Tests | PASS (616/616, vitest) |
| Security | PASS (no security-reviewer in this pipeline; manual scan: no obvious credential leak / injection / SSRF) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | bin/specrunner.ts:36-39 | Empty-args path writes USAGE to **stdout** but `openspec/changes/cli-doctor-command/specs/cli-commands/spec.md` (MODIFIED Requirement scenario "引数なしで実行された場合", L9) explicitly states stderr. Spec says "stderr に各サブコマンドの 1 行説明を含む usage を出力し、exit code 2". This is a MODIFIED Requirement and the implementer left existing behavior intact. | When `!command`: write USAGE to `process.stderr` (split path: `--help`/`-h` keeps stdout + exit 0; empty command goes to stderr + exit 2). Add a unit test (TC-062 currently `should` priority but covers spec requirement). |
| 2 | MEDIUM | architecture | src/core/doctor/checks/runtime/node.ts:13 | `ctx.env["process_version"] ?? process.version` reaches the global `process` directly when env mock is absent. Design D1 says core never imports adapter / globals: `DoctorContext` is the single source of injected dependencies. Same anti-pattern in `src/core/doctor/checks/config/file-exists.ts:37` (`ctx.env["platform"] ?? process.platform`). Tests pass only because every test injects `env` — production path silently reaches globals. | Either (a) extend `DoctorContext` with a typed `processVersion: string` and `platform: NodeJS.Platform` field populated in `src/cli/doctor.ts` from `process.version` / `process.platform`, or (b) add a typed `processInfo` sub-port. Remove all direct `process.*` references from check files. |
| 3 | MEDIUM | architecture | src/core/doctor/checks/agents/definition-drift.ts:17-31 | Module-level mutable cache `let _registry: AgentRegistry | null = null;` violates the recurring constraint "module-level mutable state を持たない. tool handler は input を validate して return するだけにし、状態は callback / return value で伝達する。並列セッション対応の前提" (constraints.md). Also makes the check non-deterministic when the test suite mutates Step modules. | Build the registry inside `check()` per call (cheap — pure data, no I/O). If memoization is desired, accept a registry from `DoctorContext` or `WeakMap` keyed by ctx. Remove `_registry` mutable. |
| 4 | MEDIUM | maintainability | openspec/changes/test-slug/pr-create-result.md | Stray test artifact committed in `d005fb1`. The folder `openspec/changes/test-slug/` is a fixture-like leftover from test execution that should not appear in the production change set. | Delete `openspec/changes/test-slug/pr-create-result.md` (and re-evaluate whether the entire `openspec/changes/test-slug/` directory is intentional — `verification-result.md` from an earlier PR was already there but `pr-create-result.md` is new in this commit). |
| 5 | LOW | architecture | src/core/doctor/types.ts:81-83 | `DoctorAnthropicClient` is declared as an empty placeholder interface and is **not** plumbed into `DoctorContext`. Spec L155 promises `anthropicClient` (port) is provided. Currently `auth/anthropic-key-valid.ts` uses `ctx.fetch` directly. The empty interface is dead code that misleads readers about port shape. | Either (a) remove `DoctorAnthropicClient` and update spec L155 to acknowledge `fetch` is the canonical Anthropic transport for doctor, or (b) introduce a real `verifyApiKey()` method on the existing `AnthropicClient` port and route the auth check through it (mirrors `GitHubClient.verifyTokenScopes`). Option (b) is preferred for symmetry with D6 D-bullet "GitHubClient port に verifyTokenScopes()". |
| 6 | LOW | maintainability | src/core/doctor/types.ts:8 | `import type * as nodeFsPromises from "node:fs/promises";` is unused (only `nodeFsSync.constants` is referenced). | Remove the unused import. |
| 7 | LOW | maintainability | src/core/doctor/checks/runtime/openspec.ts:17-23 | Both manual `setTimeout(() => controller.abort(), 30000)` and `execFile` `timeout: 30000` option are wired. Two timeout sources race; the abort signal version is the canonical path used by tests, but the `timeout` option is redundant. | Keep `signal: controller.signal` and remove `timeout: OPENSPEC_TIMEOUT_MS` from the `execFile` options (or vice versa). One source of truth. |
| 8 | LOW | testing | tests/core/doctor/checks/agents/definition-drift.test.ts:62-64 | TC-079 only checks that `AgentRegistry` is importable; it does **not** assert that `definition-drift.ts` actually uses `AgentRegistry.hashOf` (a "tautology test" pattern flagged in review-lessons.md). | Replace with a behavioral assertion: spy `AgentRegistry.hashOf` (or wrap registry behind ctx) and assert it is called when the check runs, OR `grep` source via a static check that explicitly imports the file content (acceptable as directive check per review-lessons but stricter than current). |
| 9 | LOW | consistency | openspec/changes/cli-doctor-command/proposal.md:41 | Carryover from spec-review iter-2 finding #1 (consistency LOW). ADR filename in proposal.md still uses `{NNN}-external-dependency-policy.md` while design.md and tasks.md were updated to `ADR-20260430-external-dependency-policy.md`. | Update proposal.md L41 to `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md`. |
| 10 | LOW | testing | tests/core/doctor/doctor-cli.test.ts:91-103 | TC-054 ("USAGE contains 'doctor'") only validates source-text presence, not behavior. The exit-code 2 + stderr behavior for empty-args (Finding #1) is currently not exercised by automated tests because TC-061/TC-062 are `should`-priority and unimplemented. | Add a behavioral test that imports `bin/specrunner.ts` (or its `main()` extracted) with `argv = ["node", "specrunner"]` and asserts (a) `process.exit(2)` is called and (b) `process.stderr.write` is called with the USAGE string (not stdout). Same pattern for unknown-command path. |

### Iteration Comparison

Initial iteration — no previous feedback to compare against.

### Summary

- Implementation is solid overall: 18 well-isolated checks, clean port-pattern adherence for `GitHubClient.verifyTokenScopes` (Finding 5 covers the asymmetric Anthropic case), exhaustive unit coverage for must-priority test cases (TC-001 through TC-058 implemented), 616/616 tests pass with regression count 0.
- The single **HIGH** finding is a spec compliance gap: the MODIFIED Requirement in `cli-commands/spec.md` (empty-args → stderr) was not propagated to `bin/specrunner.ts`. This blocks approval per review-standards.md.
- Two MEDIUM architecture findings concern leakage outside the `DoctorContext` port (process globals + module-level mutable cache). Both are cited by constraints.md as recurring anti-patterns; fixing now prevents future regressions.
- Cleanup of the stray `openspec/changes/test-slug/pr-create-result.md` artifact is a hygienic must.
- LOW findings are deferrable but tightly bounded — proposal.md filename consistency, dead `DoctorAnthropicClient` interface, redundant timeout in openspec check, two tautology tests.
- Recommended: code-fixer pass to address Findings #1 (HIGH) and #2-#4 (MEDIUM); LOW items can be batched into the same fixer run.
