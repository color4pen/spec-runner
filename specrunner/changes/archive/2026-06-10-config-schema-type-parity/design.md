# Design: config schema ↔ interface type-parity assertions

## Context

`src/config/schema.ts` holds two parallel sources of config truth:

- `configSchema` (zod/v4-mini) — the runtime validator (`validateConfig` calls `safeParse`).
- 15 hand-written `interface`/`type` declarations, headed by `SpecRunnerConfig`.

`validateConfig` returns `raw as SpecRunnerConfig` (preserves unknown disk fields), so
the cast is unchecked: a field added to the schema but not the interface (or the reverse)
is invisible at runtime *and* at typecheck. The class of defect this change targets is the
silent drift between the two.

The file already contains a partial guard (`_SchemaAssertions` / `_schemaAssert`,
`schema.ts:562–589`): three fields only (`version` / `runtime` / `verification`), single-
direction `extends` checks. It is incomplete and is superseded by this change.

The hard boundary for this change is dist-invariance: it must add a compile-time guard
**without changing any runtime/bundled output** (acceptance criteria 3 & 4). The build is
`tsup` (entry `bin/specrunner.ts`, tree-shaking bundler); typecheck is `tsc --noEmit` over
`tsconfig.json`, which includes `tests/**/*.ts`.

The following facts were verified empirically against the real schema/interfaces during design:

- `tsconfig.json` sets `strict: true`, `noUncheckedIndexedAccess: true`; `exactOptionalPropertyTypes`
  is **off**. With it off, zod's inferred `field?: T | undefined` is identical to the hand-written
  `field?: T`, so optional fields do not produce spurious mismatches.
- `object({})` infers `Record<string, never>`, i.e. exactly `SpecFixerConfig`.
- The dead `_schemaAssert` const is **already tree-shaken out** of `dist/specrunner.js`; deleting
  it does not change dist.
- A pure-`type` assertion module under `tests/` is typechecked by `tsc`, never bundled by `tsup`,
  and not collected by vitest (its `include` is `tests/**/*.test.ts`).
- Unused `type` aliases pass `eslint --max-warnings 0` only when their names match `^_`
  (`varsIgnorePattern: "^_"`).

## Goals / Non-Goals

**Goals**:

- Make schema ↔ interface drift a `tsc --noEmit` failure rather than a silent cast.
- Cover the top-level config and every sub-interface that has a schema correspondent.
- Achieve the above with zero change to runtime/bundled output (`dist` byte-identical).

**Non-Goals**:

- Replacing the hand-written interfaces with `z.infer` (physical single-sourcing). Out of scope.
- Adding/removing/changing any schema or interface field as a feature. Out of scope.
- Extending parity checks to non-config schemas (e.g. report-result). Out of scope.

## Decisions

### D1: Use a strict structural `Equal` helper, not bidirectional assignability

The assertion uses the type-challenges `Equal<X, Y>` helper
(`(<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false`)
wrapped by `Expect<T extends true>`.

- **Rationale**: Acceptance criterion 1 requires that adding a field to *only* the schema fails
  typecheck. Schema fields are usually added as `optional(...)`. Bidirectional assignability
  (`A extends B && B extends A`) does **not** catch an extra *optional* field (an object missing an
  optional property is still assignable). The strict `Equal` distinguishes `{x?: T}` from `{}`,
  so it catches optional-only additions on either side. Verified: a simulated schema-only optional
  field and an interface-only required field both produced `Equal = false` → typecheck error.
- **Alternatives considered**:
  - Bidirectional assignability — rejected: misses optional-only additions (acceptance gap).
  - Per-field `extends` checks (the current `_SchemaAssertions` style) — rejected: requirement 2
    forbids weakening the check to field-by-field partial matching, and it does not catch
    field *additions* at all.

### D2: A type-only assertion module under `tests/config/`

The assertions live in a new file `tests/config/schema-type-parity.test-d.ts` containing only
`import` / `import type` and `type` aliases — no runtime statement, no `const`.

- **Rationale**: This placement is dist-safe and check-correct on all four tools:
  `tsc --noEmit` typechecks it (tsconfig includes `tests/**/*.ts`); `tsup` never bundles it
  (entry is `bin/specrunner.ts`, and nothing imports the file); vitest never collects it
  (`include` is `tests/**/*.test.ts`, which `*.test-d.ts` does not match); pure `type` aliases emit
  no JS. Net dist impact: zero.
- **Alternatives considered**:
  - A file adjacent to `schema.ts` (e.g. `src/config/schema-type-parity.ts`) — acceptable
    (unimported ⇒ tree-shaken), but a `tests/` file states intent ("a check, not shipped code")
    more clearly and is the request's first-listed option.
  - A runtime `const _assert: ... = {...}` (current style) — rejected: it emits JS and only stays
    out of dist by tree-shaking luck; a pure-`type` module is unconditionally dist-neutral.

### D3: Separate the representationally-divergent fields; assert each one's schema-derived shape

A naive `Equal<z.infer<typeof configSchema>, SpecRunnerConfig>` cannot hold, because three fields
diverge by deliberate design rather than by drift. Per requirement 2 option (b), these are
separated at the type level and their *schema-derived part* is asserted at full granularity. They
are **not** loosened to field-by-field partial matching — each remains a whole-object `Equal` at its
own level.

1. **`steps` — byRequestType recursion.** The interface models `StepExecutionConfig.byRequestType`
   recursively (`Record<string, StepExecutionConfig>`) and prohibits nesting via a post-schema
   semantic check; the schema flattens it into a separate non-recursive `byRequestTypeEntrySchema`.
   The whole `steps` map therefore cannot reach `Equal` (verified `false`). It is asserted at entry
   granularity instead, with `byRequestType` `Omit`-ed from both sides, plus a dedicated assertion
   for the flattened byRequestType entry. Both reach `Equal` (verified `true`).
2. **`agents` — schema-level nullability.** The schema's `agentRecordSchema` is `nullable(...)`, so
   the inferred value type is `AgentRecord | null`. Aligning the interface to that (`| null`) is
   **not** dist-neutral: `src/cli/managed.ts` accesses `record.agentId` un-guarded inside
   `for (const [role, record] of Object.entries(config.agents ?? {}))` (lines 168, 189), which would
   then require null-safety edits to compiled code. The `AgentRecord` *shape* is asserted directly
   instead (`NonNullable<NonNullable<I["agents"]>[string]>` vs `AgentRecord`).
3. **`specFixer` — interface-only placeholder.** `SpecFixerConfig = Record<string, never>` carries no
   settings; the schema intentionally validates nothing for it. Adding it to the schema would change
   runtime/bundled output (acceptance criterion 4) and is a schema field addition (out of scope), so
   it is treated as a pass-through and `Omit`-ed from the top-level check.

- **Rationale**: Requirement 4 (no dist diff) and the out-of-scope list (no schema field additions)
  are harder constraints than a single top-level `Equal`. Option (b) honors them while keeping every
  field's *field-level* divergence covered — the request's actual concern. Verified: the resulting
  module typechecks clean (`tsc --noEmit` exit 0) with zero source edits.
- **Alternatives considered**:
  - Option (a) for each (add to schema / widen the interface) — rejected: `specFixer`→schema and
    `steps` nullability→schema are runtime/dist changes and out-of-scope; `agents`→`| null` forces
    compiled-code edits in `managed.ts`. (These were the request-review's anticipated resolutions;
    see Risks.)

### D4: Derive sub-types by indexed access from the single inferred config type

Every sub-interface assertion derives its inferred counterpart from `z.infer<typeof configSchema>`
via indexed access + `NonNullable` (e.g. `NonNullable<I["archive"]>`,
`NonNullable<I["models"]>[string]`), never by exporting the internal `const` sub-schemas.

- **Rationale**: Adding `export` to `agentRecordSchema`/`stepEntrySchema`/… would be a public-surface
  and bundling change. Indexed access keeps schema internals private and adds no runtime symbol.
- **Alternatives considered**: export each sub-schema and infer it directly — rejected (export churn,
  unnecessary surface).

### D5: Zero source change beyond deleting the superseded guard

The only edit to existing code is removing the `_SchemaAssertions` / `_schemaAssert` block
(`schema.ts:562–589`). No interface and no schema field is modified.

- **Rationale**: The proven assertion module compiles clean against the *current* types, so no
  reconciliation edit is needed. The superseded partial guard is dead (tree-shaken) and is replaced
  by the comprehensive module; keeping both would leave two competing, divergent mechanisms.
- **Alternatives considered**: keep the old block — rejected: it is partial, single-direction, and now
  redundant.

## Risks / Trade-offs

- **[Risk] Deviation from request-review decisions #2/#3/#4.** The review (advisory) anticipated option
  (a): widen `agents` to `| null`, add `| null` to `StepExecutionConfig`, add `specFixer` to the
  schema. → **Mitigation**: Those resolutions conflict with the harder acceptance criteria — #4 (add
  `specFixer` to schema) is itself a runtime/dist change, and `agents`→`| null` forces compiled-code
  edits in `managed.ts`. The empirical de-risking showed the `StepExecutionConfig` `| null` change is
  unnecessary at entry granularity. Option (b) separation (D3) reaches the same divergence-detection
  goal with zero dist impact, so it is chosen and documented here for spec/code review.
- **[Risk] Container-level shape of `steps`/`agents` is not asserted equal** (interface `Partial<Record<
  AgentStepName,…>>` / `StepConfigMap` vs inferred `Record<string,…|null>`). → **Mitigation**: those are
  container/representation choices, not field drift. Field additions inside `AgentRecord` or a step
  entry are still caught by the dedicated shape assertions; a new *top-level* field is caught by the
  top-level whole-object check (only the three named fields are `Omit`-ed).
- **[Risk] `exactOptionalPropertyTypes` is currently off.** If a future change enables it, zod's
  `| undefined` on optionals would no longer equal the interface `x?: T`. → **Mitigation**: noted here;
  not on the roadmap. If toggled, optional fields would need `| undefined` alignment in the assertions.
- **[Risk] Lint `--max-warnings 0` flags unused declarations.** → **Mitigation**: name every assertion
  alias with a leading underscore (`_Top`, `_StepEntry`, …); `varsIgnorePattern: "^_"` exempts them
  (verified). Helper types `Equal`/`Expect` are referenced and not flagged.

## Open Questions

None. File location (`tests/config/`), assertion mechanism (strict `Equal`), field-separation strategy,
and the no-source-change/dist-invariance approach were each verified empirically during design.
