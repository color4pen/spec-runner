# Code Review Feedback - iteration 003

- **verdict**: approved
- **iteration**: 003

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.80

## Summary

The implementation removes static runtime imports for the provider SDK packages, routes SDK loading through provider-specific dynamic loader seams, and moves the Claude Agent SDK and Codex SDK into `optionalDependencies` while leaving the managed Anthropic SDK as a normal dependency. Missing selected-provider SDK failures are normalized to `PROVIDER_SDK_MISSING` with package-specific `bun add` guidance, and unrelated import failures are preserved.

Coverage now includes the must scenarios for missing Claude and Codex SDK paths, `queryOneShot` default loading, and dispatching behavior. I also verified the targeted loader/dispatch tests locally:

```text
bun test tests/unit/adapter/provider-sdk-loader.test.ts tests/adapter/dispatching/agent-runner.test.ts
10 pass, 0 fail
```

The recorded verification artifact shows build, typecheck, test, and lint passed. The built `dist/specrunner.js` preserves `import(specifier)` at both provider loader sites, so the bundle-level dynamic import boundary is intact.
