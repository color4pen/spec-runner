# Conformance Result — Iteration 2

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
| tasks.md | ✓ | All 7 tasks (T-01〜T-07) have [x] checked. T-07 `typecheck && test` green confirmed by verification-result (iter 2). |
| design.md | ✓ | D1–D5 all faithfully implemented. No deviation found. |
| spec.md | ✓ | All 4 Requirements and 7 Scenarios satisfied. |
| request.md | ✓ | All 8 acceptance criteria satisfied including `typecheck && test` green (406 test files, 5494 tests pass). |

---

## Previous Verdict

conformance-result-001 returned **needs-fix**: the drift guard test (`every model in BUILTIN_MODEL_REGISTRY has a non-null lookupPricing result`) failed because `gpt-5.4-mini` and `gpt-5.3-codex-spark` were added to `BUILTIN_MODEL_REGISTRY` without corresponding `MODEL_PRICING` entries.

---

## J-1: Spec / Requirements Compliance — PASS

| Requirement | Status |
|-------------|--------|
| init SHALL accept `--provider anthropic\|openai`; invalid values MUST be rejected by CLI flag layer | ✓ `command-registry.ts` L249: `values: ["anthropic", "openai"] as const` |
| flag omitted + TTY → interactive prompt | ✓ `resolveInitProvider` with `isTTY=true` calls `io.ask(...)` |
| flag omitted + non-TTY → default `anthropic` | ✓ returns `"anthropic"` when `!io.isTTY` |
| init SHALL write `steps.defaults.model`; openai SHALL additionally write `steps.design.model` | ✓ `PROVIDER_DEFAULTS` lookup + conditional on `designModel !== undefined` (init.ts L115) |
| anthropic config MUST be identical to legacy scaffold | ✓ `anthropic.designModel` omitted → no `steps.design` block written |
| existing config SHALL NOT be prompted or rewritten | ✓ provider resolution and scaffold write inside `if (!configExists)` block |
| registry MUST NOT contain `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` | ✓ all four absent from `BUILTIN_MODEL_REGISTRY` |
| registry SHALL contain `gpt-5.4-mini` and `gpt-5.3-codex-spark` | ✓ both added as `provider: "openai"` |
| anthropic registry entries MUST remain unchanged | ✓ unchanged |

---

## J-2: Acceptance Criteria Compliance — PASS

| Criterion | Status |
|-----------|--------|
| `init --provider openai` → `steps.defaults.model: "gpt-5.4-mini"`, `steps.design.model: "gpt-5.5"` | ✓ init.ts L98–117; confirmed by `runInit — provider: openai scaffold` test |
| `init --provider anthropic` → legacy scaffold (`claude-sonnet-4-6`, no `steps.design`) | ✓ confirmed by `runInit — provider: anthropic scaffold` test |
| `init` (TTY) → provider prompt displayed, selection applied | ✓ `resolveInitProvider` TTY branch; tested with fake `ask` |
| `init` (non-TTY, no flag) → anthropic default, legacy scaffold | ✓ vitest env = non-TTY; confirmed by `runInit — no provider flag, non-TTY` test |
| config exists → no rewrite regardless of `--provider` | ✓ confirmed by `runInit — config exists, provider flag is ignored` test |
| registry: `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` removed | ✓ asserted in `does not contain deprecated openai models` test |
| registry: `gpt-5.4-mini`, `gpt-5.3-codex-spark` added | ✓ asserted in `contains newly added openai models` test |
| `typecheck && test` green | ✓ verification-result (iter 2): 406 test files, 5494 tests passed; typecheck exit 0 |

---

## J-3: Design Decision Adherence — PASS

| Decision | Verdict |
|----------|---------|
| D1: `PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults>` in `model-registry.ts` (same file as `Provider` + `BUILTIN_MODEL_REGISTRY`) | ✓ L49–57 |
| D1: provider branch confined to single `designModel` presence check; no `if (provider === "openai")` literals | ✓ init.ts L115 is the only branch; zero literal provider comparisons |
| D2: no `provider` field added to `SpecRunnerConfig`; 6-level resolution chain unchanged | ✓ schema.ts not modified |
| D3: `resolveInitProvider(flagProvider, io)` pure-ish helper with injectable `ask` seam, exported | ✓ init.ts L24–40 |
| D3: provider resolution inside `if (!configExists)` only | ✓ init.ts L75–88 |
| D4: `COMMANDS.init.flags.provider` with `values: ["anthropic", "openai"] as const` | ✓ command-registry.ts L249 |
| D5: deprecated 4 models deleted, `gpt-5.4-mini`/`gpt-5.3-codex-spark` added, anthropic entries unchanged | ✓ model-registry.ts L13–27 |

---

## J-4: Non-Regression — PASS

**typecheck**: PASS (`bun run typecheck` exits 0).

**test**: PASS (406 test files, 5494 tests; verification-result iter 2).

### Pricing fix (root cause of conformance-001 needs-fix)

- conformance-001 identified: `BUILTIN_MODEL_REGISTRY` was updated to include `gpt-5.4-mini` and `gpt-5.3-codex-spark`, but `MODEL_PRICING` had no entries for them, causing the pre-existing drift guard (`every model in BUILTIN_MODEL_REGISTRY has a non-null lookupPricing result`) to fail.
- Fix applied: `src/core/usage/pricing.ts` now contains approximate pricing entries for `gpt-5.4-mini` (L157–163) and `gpt-5.3-codex-spark` (L165–171), with source dates and approximation notes in comments.
- Drift guard test now passes: all keys in `BUILTIN_MODEL_REGISTRY` resolve to non-null `lookupPricing` results.
- Existing pricing tests (`pricing.test.ts`) are unaffected; `MODEL_PRICING` entries for `o3` / `gpt-5.3-codex` remain (these are `MODEL_PRICING`-only entries, not in `BUILTIN_MODEL_REGISTRY`).

### Existing test regression check

- `tests/config/model-registry.test.ts`: deprecated models asserted absent; new models asserted present. ✓
- `tests/config/schema.test.ts`: `o3` fixture replaced with `gpt-5.4` in all 3 locations. ✓
- `tests/core/doctor/checks/runtime/codex-cli.test.ts`: `o3` replaced with `gpt-5.4` in 3 locations. ✓
- `tests/adapter/dispatching/agent-runner.test.ts`: `makeCtx("o3")` replaced with `makeCtx("gpt-5.4")`. ✓
- Existing `runInit({})` tests remain green (non-TTY = anthropic default = legacy scaffold). ✓
