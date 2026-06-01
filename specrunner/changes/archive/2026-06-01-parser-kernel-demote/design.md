# Design: parser-kernel-demote

## Context

`src/parser/` (shared-kernel layer) currently imports from `src/core/` (domain layer) in two areas:

1. **ParsedRequest/ParsedRequestSections** — defined in `core/request/types.ts`, re-exported/imported by `parser/request-md.ts` and `parser/rules/types.ts`
2. **ValidationRule/RuleRegistry** — defined in `core/validation/types.ts` and `core/validation/registry.ts`, imported by `parser/rules/*.ts` (7 rule files) and `parser/rules/index.ts`

This is a B-3 violation (upward edge: kernel → domain) and creates a core↔parser circular dependency. The arch-allowlist has 10 R1 entries freezing this state.

Key observations:
- `core/validation/` has **zero consumers within `src/core/`** — only `src/parser/rules/` imports from it
- `DeltaSpecRuleRegistry` in `core/spec/rules/` is completely independent (its own interface + class)
- All downstream consumers of `ParsedRequest` import via `parser/request-md.ts` (the re-export point) or `core/request/types.ts`

## Goals / Non-Goals

**Goals**:
- Eliminate all `parser/ → core/` import edges (R1 burn-down)
- Remove all 10 R1 entries from `arch-allowlist.ts`
- Maintain backward-compatible import paths for all existing consumers

**Non-Goals**:
- Touching R2/R3/R4 burn-down items
- Restructuring `DeltaSpecRuleRegistry` or `core/spec/rules/`
- Changing any runtime behavior

## Decisions

### D1: Place ParsedRequest/ParsedRequestSections in `src/parser/types.ts`

Move the type definitions from `core/request/types.ts` to a new `src/parser/types.ts`. Parser owns these types as the authority (it parses request.md into this shape).

**Rationale**: `parser/` already exports these types — making it the canonical definition site aligns ownership with authorship. A standalone `types.ts` avoids circular imports within parser (e.g., `rules/types.ts` needs `ParsedRequestSections` but shouldn't import the full `request-md.ts`).

**Alternatives**:
- Define inside `parser/request-md.ts` itself → causes `parser/rules/types.ts` to import from `request-md.ts`, creating an internal cycle risk
- Create `src/shared-kernel/types.ts` → over-engineering for 2 types; no other kernel module needs them

### D2: Place ValidationRule and RuleRegistry in `src/parser/validation/`

Move `ValidationRule` interface to `src/parser/validation/types.ts` and `RuleRegistry` class to `src/parser/validation/registry.ts`.

**Rationale**: These are consumed exclusively by `parser/rules/`. Placing them under `parser/validation/` makes ownership explicit and eliminates the upward edge. The `parser/validation/` sub-module mirrors the existing `core/validation/` structure for a 1:1 migration.

**Alternatives**:
- Keep in `core/validation/` and have `parser/rules/` import from there → that IS the current B-3 violation
- Create a top-level `src/validation/` module → adds a new top-level directory for 2 files with a single consumer

### D3: Convert `core/validation/` and `core/request/types.ts` to re-export barrels

After moving definitions to parser, the original files in core become re-export barrels pointing to the parser canonical locations:
- `core/request/types.ts` → re-exports from `../../parser/types.js`
- `core/validation/types.ts` → re-exports from `../../parser/validation/types.js`
- `core/validation/registry.ts` → re-exports from `../../parser/validation/registry.js`

Direction: `core/ → parser/` = domain → shared-kernel = **allowed** per §3 closure table.

**Rationale**: Preserves all existing import paths for consumers (`core/request/store.ts` imports `./types.js`; tests import from `core/validation/`). Zero-breakage migration. These barrels can be removed in a future cleanup once all consumers are migrated, but that's out of scope.

**Alternatives**:
- Delete `core/validation/` entirely → forces test file relocation (`tests/unit/core/validation/registry.test.ts`) and breaks any future core consumer. Unnecessary churn for this change.
- Update all test imports to point to `parser/validation/` → scope creep; the re-export barrel handles this cleanly

### D4: Update parser-internal imports to local paths

All `src/parser/` files change their imports:
- `parser/request-md.ts`: `../core/request/types.js` → `./types.js`
- `parser/rules/types.ts`: `../../core/request/types.js` → `../types.js`
- `parser/rules/*.ts` (7 files): `../../core/validation/types.js` → `../validation/types.js`
- `parser/rules/index.ts`: `../../core/validation/registry.js` → `../validation/registry.js`

This severs all upward edges.

### D5: Remove R1 allowlist entries

Delete all 10 entries with `tracking: "R1"` from `arch-allowlist.ts`. The ratchet then enforces that no parser→core edge remains (any residual edge makes the B-3 test red).

## Risks / Trade-offs

- [Risk] Re-export barrels in `core/validation/` may confuse future developers into thinking validation logic belongs in core → **Mitigation**: Add a JSDoc comment on the barrel files indicating canonical location is `parser/validation/`
- [Risk] A consumer we missed still imports `ParsedRequest` from an unexpected path → **Mitigation**: TypeScript compiler + `bun run typecheck` will surface any broken import immediately

## Open Questions

None — all placement decisions are confirmed by the structure-rulings ADR D4 and the analysis above.
