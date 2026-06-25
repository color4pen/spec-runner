# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All 7 tasks (T-01〜T-07) have [x] checked. T-07 requires `typecheck && test` green, which currently fails — see J-4. |
| design.md | ✓ | D1–D5 all faithfully implemented. PROVIDER_DEFAULTS table placement, no config.provider field, injectable seam, command-registry flag, registry updates. |
| spec.md | ✓ | All 4 Requirements and 7 Scenarios satisfied by implementation. |
| request.md | ✗ | Acceptance criterion "`typecheck && test` が green" not satisfied. 1 test fails: pricing drift guard (see J-4). |

---

## J-1: Spec / Requirements Compliance — PASS

| Requirement | Status |
|-------------|--------|
| init SHALL accept `--provider anthropic\|openai`; invalid values MUST be rejected | ✓ `command-registry.ts` L249 `values: ["anthropic", "openai"] as const` |
| flag omitted + TTY → interactive prompt | ✓ `resolveInitProvider` with `isTTY=true` |
| flag omitted + non-TTY → default `anthropic` | ✓ returns `"anthropic"` when `!io.isTTY` |
| init SHALL write `steps.defaults.model`; openai SHALL write `steps.design.model` | ✓ PROVIDER_DEFAULTS lookup + conditional on `designModel` |
| anthropic config MUST be identical to legacy scaffold | ✓ `anthropic.designModel` omitted → no `steps.design` block |
| existing config SHALL NOT be prompted or rewritten | ✓ provider resolution inside `if (!configExists)` |
| registry MUST NOT contain `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex` | ✓ all four absent from `BUILTIN_MODEL_REGISTRY` |
| registry SHALL contain `gpt-5.4-mini` and `gpt-5.3-codex-spark` | ✓ both added as `provider: "openai"` |
| anthropic entries MUST remain unchanged | ✓ unchanged |

---

## J-2: Acceptance Criteria Compliance — FAIL

| Criterion | Status |
|-----------|--------|
| `init --provider openai` → `steps.defaults.model: "gpt-5.4-mini"`, `steps.design.model: "gpt-5.5"` | ✓ |
| `init --provider anthropic` → legacy scaffold (claude-sonnet-4-6, no steps.design) | ✓ |
| `init` (TTY) → provider prompt displayed | ✓ unit tested with fake `ask` |
| `init` (non-TTY, no flag) → anthropic default | ✓ (vitest = non-TTY) |
| config exists → no rewrite regardless of `--provider` | ✓ |
| registry: deprecated 4 models removed | ✓ |
| registry: `gpt-5.4-mini`, `gpt-5.3-codex-spark` added | ✓ |
| **`typecheck && test` が green** | **✗ FAIL** |

---

## J-3: Design Decision Adherence — PASS

| Decision | Verdict |
|----------|---------|
| D1: `PROVIDER_DEFAULTS: Record<Provider, ProviderDefaults>` in `model-registry.ts` | ✓ L49–57 |
| D1: provider branch confined to single `designModel` presence check in init.ts | ✓ L115 only; zero `if (provider === "openai")` literals |
| D2: no `provider` field added to `SpecRunnerConfig` | ✓ schema.ts unchanged |
| D3: `resolveInitProvider(flagProvider, io)` injectable seam, exported | ✓ init.ts L24–40 |
| D3: resolution inside `if (!configExists)` only | ✓ init.ts L75–88 |
| D4: `COMMANDS.init.flags.provider` with `values: ["anthropic", "openai"]` | ✓ command-registry.ts L249 |
| D5: deprecated deleted, current added, anthropic unchanged | ✓ model-registry.ts L13–27 |

---

## J-4: Non-Regression — FAIL

**typecheck**: PASS (`bun run typecheck` exits 0).

**test**: **FAIL** (`bun run test` exits 1, 1 test fails):

```
FAIL  tests/core/usage/pricing.test.ts
  > drift guard — BUILTIN_MODEL_REGISTRY × MODEL_PRICING coverage
    > every model in BUILTIN_MODEL_REGISTRY has a non-null lookupPricing result
AssertionError: missing pricing for gpt-5.4-mini
```

### Root cause

1. Implementer added `gpt-5.4-mini` and `gpt-5.3-codex-spark` to `BUILTIN_MODEL_REGISTRY` (correct per spec) and also added approximate pricing entries to `MODEL_PRICING`.
2. code-review Finding #1 flagged the pricing additions as out-of-scope (design Non-Goals). Severity: low, Fix: **no** (reviewer did not require correction).
3. Despite Fix: **no**, the second code-fixer commit (`477d1e2cd`) removed the pricing entries from `pricing.ts`.
4. Removal left `gpt-5.4-mini` and `gpt-5.3-codex-spark` in `BUILTIN_MODEL_REGISTRY` without `MODEL_PRICING` entries.
5. The drift guard test (added in `ef893ce3c`, present on `main` at branch creation) enforces that every `BUILTIN_MODEL_REGISTRY` key resolves to a non-null `lookupPricing` result. This test now fails for `gpt-5.4-mini`.

The design's assumption that pricing and registry are independent was incorrect: the pre-existing drift guard creates a hard dependency between the two. Adding models to the registry without pricing entries violates the invariant.

### Required fix

Add approximate pricing entries for `gpt-5.4-mini` and `gpt-5.3-codex-spark` to `src/core/usage/pricing.ts` — restoring what the implementer originally added. This is the minimal change to satisfy the drift guard. All other aspects of the implementation are correct.
