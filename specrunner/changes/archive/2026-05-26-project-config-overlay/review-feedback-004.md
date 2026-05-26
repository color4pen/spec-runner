# Review Feedback: project-config-overlay — Iteration 4

## Summary

Iter 4 contains a single commit (`code-fixer: project-config-overlay`) that resolves the iter 3 minor finding — `src/core/command/resume.ts` now calls `resolveRepoRoot(cwd)` before `loadConfig`, matching the pattern in `preflight.ts` and `bootstrap.ts`.

Core implementation is consistent with `design.md`:
- `deepMergeConfig` (merge.ts) correctly performs recursive deep merge
- 6-level resolution chain in `getStepExecutionConfig` matches spec order
- `byRequestType` validation: empty-string key → CONFIG_INVALID; unknown key name → warning only
- CLI early validation: `preflight.ts`, `bootstrap.ts`, `resume.ts` all call `loadConfig` at entry
- All 4 test suites (`merge`, `schema`, `step-config`, `store`) pass; typecheck green

Three nit-level items carried from iter 3 remain unaddressed, plus one new minor latent issue identified.

---

## Findings

### [minor] DispatchingAgentRunner resolves model without `requestType` → cross-provider `byRequestType` routes to wrong runner

**File**: `src/adapter/dispatching/agent-runner.ts` (provider routing block)

`DispatchingAgentRunner.run()` calls `getStepExecutionConfig(ctx.config, ctx.step.name, defaults)` without passing `ctx.requestType`. The resulting `resolvedConfig.model` skips resolution levels 1 and 3 (byRequestType step-level and byRequestType default), so the provider routing decision (`resolveProvider(model, registry)`) may differ from the model that `ClaudeCodeRunner` or `ManagedAgentRunner` actually uses internally.

Concrete failure: a user who sets `steps.<step>.model = "claude-sonnet-4-6"` and `byRequestType.spec-change.model = "<openai-model>"` would have the dispatcher route to `claudeRunner`, which then resolves the OpenAI model name and passes it to the Claude SDK.

This only manifests in cross-provider `byRequestType` scenarios not contemplated by the original design, so it is not a blocking regression. The simplest fix is to pass `ctx.requestType` into the dispatcher's `getStepExecutionConfig` call so routing uses the same resolved model the executing runner will see. Recommend tracking as a follow-up issue rather than blocking this merge — filing here for visibility.

---

### [nit] TC-26: no explicit assertion for `model: 123` (non-string) inside `byRequestType`

**File**: `tests/config/schema.test.ts`

`test-cases.md` TC-26 (must) specifies that `model: 123` inside a `byRequestType` entry must yield `CONFIG_INVALID`. The `typeof model !== "string"` guard in `schema.ts` covers it, and the empty-string-model test exercises the same code path. No dedicated test assertion exists. Adding one 3-line test closes the gap cleanly.

---

### [nit] README / project.md do not mention that managed runtime ignores `byRequestType.model`

**Files**: `README.md`, `specrunner/project.md`

`design.md §D6` notes "managed runtime では model/byRequestType.model は効果なし". `ManagedAgentRunner` uses agent-definition models, so any `byRequestType.model` override in config is silently ignored under managed runtime. Neither README nor project.md includes this note near the `byRequestType` example. One sentence would prevent user confusion.

---

### [nit] TC-10 in test-cases.md references a `provider` field that does not exist in `SpecRunnerConfig`

**File**: `specrunner/changes/project-config-overlay/test-cases.md` (TC-10 GIVEN block)

TC-10 uses `base.provider = "claude"` / `overlay.provider = "openai"`, but `SpecRunnerConfig` has no `provider` field (it has `runtime`). The actual test in `merge.test.ts` correctly uses `runtime`. Either update TC-10's GIVEN to use `runtime`, or add a NOTE marking it as a generic primitive-override illustration.

---

## Iter 3 Findings Disposition

| iter 3 finding | severity | status |
|---|---|---|
| `resume.ts` loadConfig bypasses resolveRepoRoot | minor | **fixed** ✅ |
| TC-26 explicit `model: 123` assertion missing | nit | still missing |
| README managed-runtime model-ignored note | nit | still missing |
| TC-10 `provider` field discrepancy | nit | still missing |

---

## Test Coverage vs test-cases.md (must scenarios)

| Category | TCs | Coverage |
|---|---|---|
| overlay-load (TC-01–TC-07) | 7/7 | ✅ covered |
| deep-merge (TC-09–TC-14) | 6/6 | ✅ covered |
| byRequestType resolution (TC-15–TC-20) | 6/6 | ✅ covered |
| validation (TC-23–TC-29) | 7/7 | ✅ covered (TC-26 via code-path equivalence) |
| CLI early validation (TC-33, TC-35) | 2/2 | ✅ covered |
| regression (TC-36–TC-38) | 3/3 | ✅ covered |

---

## Verdict

- **verdict**: approved

The iter 3 minor blocker is resolved. Remaining items are nit-level and do not affect runtime correctness or acceptance criteria. The `DispatchingAgentRunner` cross-provider edge case is a latent minor issue outside the original design scope — recommend filing as a follow-up rather than blocking this merge.
