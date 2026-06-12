# Code Review Feedback — iteration 002

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | correctness | `package.json:41` | `@anthropic-ai/sdk` was moved into `optionalDependencies`, but this package is the managed runtime SDK and is explicitly out of scope for this change. The design says managed dependency handling must not change, and T-04 says to keep `@anthropic-ai/sdk` in `dependencies`. This is also internally inconsistent with `bun.lock`, which still records `@anthropic-ai/sdk` under root `dependencies`, so the package metadata is not in the intended or reproducible state. More importantly, managed-runtime modules still statically import `@anthropic-ai/sdk` (`src/adapter/managed-agent/client.ts:1`, `src/adapter/managed-agent/anthropic-client.ts:8`), so installs that omit optional dependencies can crash managed runtime module evaluation even though managed runtime was not supposed to participate in provider SDK optionalization. | Move `@anthropic-ai/sdk` back to `dependencies`, leave only `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` in `optionalDependencies`, regenerate/verify `bun.lock`, and add/adjust a package metadata test for TC-005 so the managed SDK cannot regress into optional deps again. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 6 | 0.30 |
| security | 10 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 7.90

## Summary

The iteration fixes the previously reported guided-error preservation and transitive import classification issues, and the verification artifact reports build, typecheck, test, and lint passing. The remaining blocker is dependency metadata: the managed Anthropic SDK was optionalized despite being out of scope and still statically imported by managed-runtime code. The must scenario TC-005 should be covered by an automated metadata test when this is fixed.
