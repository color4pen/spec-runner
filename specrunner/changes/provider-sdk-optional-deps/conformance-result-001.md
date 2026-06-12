# Conformance Result: Provider SDK Optional Dependencies

- **verdict**: approved

## Scope Reviewed

- Read `rules.md` for identity priming.
- Verified every checkbox in `tasks.md` is marked complete.
- Reviewed design decisions D1-D7 in `design.md`.
- Reviewed all Requirements and Scenarios in `spec.md`.
- Reviewed request requirements and acceptance criteria in `request.md`.
- Ran `git diff main...HEAD --stat` to confirm implementation scope.
- Reviewed source, package metadata, tests, verification output, and bundled `dist/specrunner.js` evidence.

## Judgment

### 1. Task Completion

All task checkboxes T-01 through T-06 are complete. The implementation includes provider SDK loader modules, adapter dynamic loading, selected-provider dispatch behavior, optional dependency metadata, missing-SDK tests, and recorded verification.

### 2. Design Conformance

The implementation conforms to D1-D7:

- D1: `src/adapter/claude-code/sdk-loader.ts` and `src/adapter/codex/sdk-loader.ts` centralize SDK dynamic loading.
- D2: provider SDK runtime imports were removed from adapter modules; narrow local structural types are used instead.
- D3: `DispatchingAgentRunner` resolves provider first and dynamically imports the Codex adapter only for OpenAI models.
- D4: both local provider SDKs are under `optionalDependencies`; `@anthropic-ai/sdk` and `zod` remain hard dependencies.
- D5: missing selected-provider SDK imports are converted to `SpecRunnerError` with `PROVIDER_SDK_MISSING`, package-specific text, and `bun add ...` guidance.
- D6: `queryOneShot` preserves query injection and lazily loads the Claude SDK only when no `queryFn` is supplied.
- D7: `dist/specrunner.js` preserves external dynamic `import(specifier)` loader paths for both provider SDKs.

### 3. Spec / Requirement Conformance

The implementation satisfies the normative requirements:

- Provider SDKs are not resolved during CLI startup or adapter module evaluation. Static provider SDK imports are gone from source adapters.
- Missing selected provider SDKs produce guided `SpecRunnerError` failures instead of raw module resolution crashes.
- Package metadata lists `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` as optional dependencies while keeping managed `@anthropic-ai/sdk` in dependencies.
- Installed-SDK behavior is preserved per recorded verification and focused tests.
- Bundle output keeps provider SDK specifiers external and dynamic.

### 4. Acceptance Criteria

- Missing SDK behavior is covered by mocked import failure tests for Claude runner, Codex runner, and `queryOneShot`.
- Existing verification result records `build`, `typecheck`, `test`, and `lint` passing.
- Bundle inspection shows `dist/specrunner.js` contains dynamic `import(specifier)` loader paths and external provider SDK specifier constants.
- Package metadata and lockfile root metadata are consistent with the optional dependency move.

## Additional Checks Run During Conformance

```
bun test tests/unit/adapter/provider-sdk-loader.test.ts
bun test tests/adapter/dispatching/agent-runner.test.ts
```

Both focused test commands passed.

## Findings

No blocking conformance findings.
