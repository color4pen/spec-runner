# Conformance Result

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
| tasks.md | ✅ | All 10 tasks (T-01–T-10) marked `[x]`; implementation matches each acceptance criterion |
| design.md | ✅ | All 6 decisions (D1–D6) traceable in code; no deviations |
| spec.md | ✅ | All 9 Requirements and 12 Scenarios covered by tests |
| request.md | ✅ | All 6 acceptance criteria satisfied; `typecheck && test` green (5979/5979) |

---

## Detail

### tasks.md

All tasks complete:

- **T-01/T-02**: `ForbiddenSurfaceConfig`, `FastPipelineConfig`, `PipelineConfig.fast` added to TypeScript interfaces. Zod schema validates `id` (non-empty string) and `paths` (array of non-empty strings) with error messages matching `archive.protectedPaths` style.
- **T-03**: `resolvePipelineForbiddenSurfaces(config, pipelineId)` resolver added in `schema.ts`; single mapping point for `config.pipeline.fast.forbiddenSurfaces`.
- **T-04**: `FAST_DESCRIPTOR.permissionScope.forbidden` set to `[]`. Grep over `registry.ts` returns 0 matches for `src/core/port/**`, `src/state/schema.ts`, `src/state/lifecycle.ts`.
- **T-05**: `src/core/pipeline/resolve-scope.ts` (new file) implements `applyScopeConfig` — reference-identical no-op when `permissionScope` absent; spread-clone with config-resolved `forbidden` when present.
- **T-06**: `run.ts` — `buildPipelineForJob` and `runPipeline` both insert `applyScopeConfig(base, deps.config)` before `composeReviewerDescriptor`. `pipeline-run.ts` untouched.
- **T-07**: `.specrunner/config.json` updated with `pipeline.fast.forbiddenSurfaces` — 3 surfaces (`public-types`, `persisted-format`, `state-transitions`) in same PR as T-04 literal removal (D6 atomicity).
- **T-08**: `docs/configuration.md` — new `### Fast pipeline — forbidden surfaces` section with capability gate explanation, array-replacement deep-merge note, JSON example, and reference table.
- **T-09**: `fast-descriptor.test.ts` T-04-5 updated to assert `forbidden === []` + presence maintained. `fast-scope-checkpoint.test.ts` breach tests updated to use `makeFastScopeFromConfig()` via `applyScopeConfig`; no-breach tests use `FAST_SCOPE_EMPTY` (registry constant).
- **T-10**: `resolve-scope.test.ts` (442 lines, new) covers config validation (7 valid/invalid cases), `resolvePipelineForbiddenSurfaces` (7 cases), `applyScopeConfig` (10 cases), capability gate (5 cases), dogfooding (8 assertions), registry invariant (3 assertions).

### design.md decisions

| Decision | Verified |
|----------|----------|
| D1: registry forbidden = `[]`; literals removed | `forbidden: [],` in registry diff; zero grep hits |
| D2: key `pipeline.fast.forbiddenSurfaces` | Interface + zod + resolver + config + tests all use this path |
| D3: `checkpoint` code-only | `applyScopeConfig` preserves `base.permissionScope.checkpoint`; no checkpoint field in config schema |
| D4: `applyScopeConfig` pure function; no-op on absent scope | `resolve-scope.ts` matches described contract exactly |
| D5: wired at `run.ts` 2 sites; preflight unchanged | Only `buildPipelineForJob` and `runPipeline` modified; `pipeline-run.ts` diff: 0 lines changed |
| D6: atomic PR (registry removal + config addition) | Both changes present in same branch diff |

### spec.md requirements

All 9 Requirements satisfied:

1. **Config declares forbidden surfaces** — load scenario + deep-merge array replacement → dogfooding test + `resolve-scope.test.ts` config validation.
2. **fast descriptor resolves from config** — config → forbidden match + checkpoint preserved → `applyScopeConfig` tests; registry static has no literals → registry invariant suite.
3. **Declared path → breach at conformance** — `fast-scope-checkpoint.test.ts` T-05-1 (6 sub-cases) with `makeFastScopeFromConfig()`.
4. **No config → no breach** — T-05-2 uses `FAST_SCOPE_EMPTY`; `resolve-scope.test.ts` no-breach gate test.
5. **scope presence maintained** — `applyScopeConfig` no-config path returns `permissionScope` defined + forbidden `[]`; capability gate suite confirms `UnsupportedRuntimeCapabilityError` still thrown.
6. **Invalid config → validation error** — 6 invalid-input cases in config validation suite.
7. **Non-scope pipeline unchanged** — `STANDARD_DESCRIPTOR` and `DESIGN_ONLY_DESCRIPTOR` both return reference-identical from `applyScopeConfig`.
8. **Self-repo config declares 3 surfaces** — dogfooding suite reads `.specrunner/config.json` at test time and asserts each surface and path.

### request.md acceptance criteria

| Criterion | Evidence |
|-----------|----------|
| config 宣言で breach 検出テスト固定 | T-05-1 (6 cases) + `applyScopeConfig` breach path in `resolve-scope.test.ts` |
| 無指定で breach なし + gate 適用テスト固定 | T-05-2 (FAST_SCOPE_EMPTY) + capability gate suite (4 cases) |
| 不正 config が validation エラーテスト固定 | config validation suite — id 欠落, id 空, paths 非配列, paths 欠落, forbiddenSurfaces 非配列 |
| `registry.ts` にパスリテラルなし | Grep 0 hits; `forbidden: []` confirmed |
| `.specrunner/config.json` に 3 面宣言 | diff + dogfooding test runtime-verify |
| `typecheck && test` green | typecheck: no errors; test: 5979 passed / 439 files |
