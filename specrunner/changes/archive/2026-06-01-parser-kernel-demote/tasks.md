# Tasks: parser-kernel-demote

## T-01: Create `src/parser/types.ts` with ParsedRequest/ParsedRequestSections

- [x] Create `src/parser/types.ts` with the `ParsedRequestSections` and `ParsedRequest` interface definitions (copied verbatim from `src/core/request/types.ts`, including JSDoc comments)

**Acceptance Criteria**:
- `src/parser/types.ts` exports `ParsedRequest` and `ParsedRequestSections` interfaces
- Definitions are identical to current `core/request/types.ts`

## T-02: Create `src/parser/validation/types.ts` and `src/parser/validation/registry.ts`

- [x] Create `src/parser/validation/types.ts` with the `ValidationRule` interface (copied from `src/core/validation/types.ts`)
- [x] Create `src/parser/validation/registry.ts` with the `RuleRegistry` class (copied from `src/core/validation/registry.ts`), updating its import of `ValidationRule` to `./types.js`

**Acceptance Criteria**:
- `src/parser/validation/types.ts` exports `ValidationRule<TInput, TViolation, TName>`
- `src/parser/validation/registry.ts` exports `RuleRegistry<TInput, TViolation, TName>`
- `registry.ts` imports `ValidationRule` from `./types.js` (local, no core/ reference)

## T-03: Convert `src/core/request/types.ts` to re-export barrel

- [x] Replace the contents of `src/core/request/types.ts` with re-exports from `../../parser/types.js`
- [x] Add a JSDoc comment indicating canonical location is `src/parser/types.ts`

**Acceptance Criteria**:
- `core/request/types.ts` contains only `export type { ParsedRequest, ParsedRequestSections } from "../../parser/types.js";` (plus comment)
- `core/request/store.ts` (which imports `ParsedRequest` from `./types.js`) continues to compile

## T-04: Convert `src/core/validation/` to re-export barrels

- [x] Replace `src/core/validation/types.ts` with a re-export from `../../parser/validation/types.js`, with JSDoc noting canonical location
- [x] Replace `src/core/validation/registry.ts` with a re-export from `../../parser/validation/registry.js`, with JSDoc noting canonical location

**Acceptance Criteria**:
- `core/validation/types.ts` re-exports `ValidationRule` from `../../parser/validation/types.js`
- `core/validation/registry.ts` re-exports `RuleRegistry` from `../../parser/validation/registry.js`
- Existing test `tests/unit/core/validation/registry.test.ts` continues to compile and pass without modification

## T-05: Update `src/parser/` imports to use local paths

- [x] `src/parser/request-md.ts` lines 5-6: change `"../core/request/types.js"` → `"./types.js"`
- [x] `src/parser/rules/types.ts` line 1: change `"../../core/request/types.js"` → `"../types.js"`
- [x] `src/parser/rules/index.ts` line 1: change `"../../core/validation/registry.js"` → `"../validation/registry.js"`
- [x] `src/parser/rules/adr-required.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/adr-valid.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/base-branch-required.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/slug-required.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/title-required.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/type-known.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`
- [x] `src/parser/rules/type-required.ts` line 1: change `"../../core/validation/types.js"` → `"../validation/types.js"`

**Acceptance Criteria**:
- Zero imports matching `from ".*core/` exist in `src/parser/` (grep returns empty)
- `bun run typecheck` passes

## T-06: Remove R1 entries from `arch-allowlist.ts`

- [x] Delete all 10 entries with `tracking: "R1"` from `tests/unit/architecture/arch-allowlist.ts`
- [x] Delete the associated comment block (`// R1: parser/ → core/request/ and core/validation/`)

**Acceptance Criteria**:
- No entries with `tracking: "R1"` remain in the allowlist
- `bun run test` passes (architecture enforcement suite is green — B-3 test does not fire on parser)

## T-07: Final verification

- [x] Run `bun run build && bun run typecheck && bun run lint && bun run test`
- [x] Confirm no `src/parser/` file imports from `src/core/`

**Acceptance Criteria**:
- All 4 verification commands exit 0
- `grep -r 'from ".*core/' src/parser/` returns no results
