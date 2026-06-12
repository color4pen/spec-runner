# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | correctness | `src/adapter/claude-code/agent-runner.ts:682` | Missing Claude SDK guidance is not preserved on the normal local-runtime path. `LocalRuntime.createAgentRunner()` injects `defaultQueryFn` into `ClaudeCodeRunner` (`src/core/runtime/local.ts:247`), so the default SDK import can fail inside the query loop rather than at `run()` startup. The catch block then wraps the `SpecRunnerError(PROVIDER_SDK_MISSING)` into a generic `CLAUDE_CODE_QUERY_FAILED` error result, losing the provider-specific code and install hint required by the spec. The current test only covers `_loadSdkFn` failure before this catch, so it misses the production wiring. | In the broad `ClaudeCodeRunner` catch, preserve `SpecRunnerError` the same way the Codex runner does, or avoid injecting `defaultQueryFn` when the local runtime has no custom query function. Add a regression test that exercises `ClaudeCodeRunner` with `_queryFn: defaultQueryFn` or the `LocalRuntime.createAgentRunner()` wiring and asserts the selected missing Claude SDK surfaces as `PROVIDER_SDK_MISSING` with the install hint. | yes |
| 2 | medium | correctness | `src/adapter/shared/provider-sdk-loader.ts:21` | `isMissingTopLevelPackageError()` can misclassify transitive import failures as a missing optional provider SDK. It treats any `ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND` whose message contains the provider package name as top-level missing. Real transitive failures often include the SDK path in the "imported from .../node_modules/@openai/codex-sdk/..." portion, so an installed SDK with a broken internal dependency can be reported as "install @openai/codex-sdk" instead of surfacing the real failure. This violates D5's requirement to only translate absence of the selected top-level package. | Match the missing package specifier itself, not arbitrary occurrences in the message. For example, parse/match `Cannot find package '<packageName>'` / `Cannot find module '<packageName>'` and do not match the `imported from` path. Add a test with a realistic message such as `Cannot find package 'some-transitive-package' imported from .../node_modules/@openai/codex-sdk/...` and assert it is not rewritten. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 6 | 0.30 |
| security | 10 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.85

## Summary

The dependency metadata and broad dynamic-import structure are in place, and verification reports `build`, `typecheck`, `test`, and `lint` passing. The must scenarios are partially covered, but the normal Claude local-runtime wiring is not covered and can lose the required guided missing-provider error. The loader also needs a stricter top-level-missing classifier before this is safe to approve.
