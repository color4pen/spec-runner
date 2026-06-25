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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `tests/unit/adapter/codex/agent-runner-env.test.ts` | TC-015 (must) is not covered as a combined assertion — no single test verifies that `OPENAI_API_KEY` is simultaneously absent from `opts.env` AND present as `opts.apiKey`. The properties are tested separately (env-filter covers `_API_KEY` pattern stripping; factory test asserts `apiKey` forwarding). | Add one test in the integration describe block that sets `OPENAI_API_KEY` in `fakeProcessEnv`, passes it through `stripSecrets`, and asserts `opts.env["OPENAI_API_KEY"] === undefined` alongside `opts.apiKey === "sk-openai-xxx"`. | no |
| 2 | low | maintainability | `src/util/git-exec.ts:19` | `as Record<string, string>` outer cast strips `\| undefined` from `stripSecrets`'s return type; the cast is technically inaccurate (env vars set to `undefined` in `process.env` remain `undefined` at runtime), though no actual values are affected since `stripSecrets` uses `delete`. | Change to `as Record<string, string \| undefined>` to match the actual return type. Alternatively, remove the cast entirely — `SpawnOptions.env` accepts `NodeJS.ProcessEnv` which already allows `undefined` values. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.05

## Summary

All 6 acceptance criteria are satisfied. Five vulnerable call-sites are correctly sealed: codex SDK factory now receives `stripSecrets`-filtered env plus explicit `apiKey`; `runSubprocess` in `git-exec.ts` and the `git show` spawn in `verification/runner.ts` both use stripped env. `SECRET_DENYLIST` is extended with pattern-based stripping (`_TOKEN`, `_API_KEY`, `_SECRET`), `maskSensitive` is refactored to use capture-group replacement with `gi` flags, and the B-6 architecture guard now scans `src/adapter/` and `src/util/` with a well-documented allowlist. Verification: 5525 tests pass, typecheck clean, lint clean.

The two low-severity findings are non-blocking: TC-015's combined scenario is implied by separate unit properties (implementation is correct), and the type cast in `git-exec.ts` is harmless. Neither requires a fix cycle.

