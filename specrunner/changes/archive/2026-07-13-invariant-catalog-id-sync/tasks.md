# Tasks: 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合の一致固定

Scope of edits:

- **New file**: `tests/unit/architecture/invariant-catalog-parity.test.ts` (the parity
  tooth — extractors + all assertions).
- **Comment-only edits** (requirement 4): `tests/unit/architecture/arch-allowlist.ts`
  (docstring line 5) and `tests/unit/architecture/core-invariants.test.ts` (docstring
  line 4).

Do NOT touch `architecture/model.md`, `architecture/conformance.md`,
`architecture/divergence-status.md`, any invariant definition, any `describe` / `it`
assertion, or any allowlist entry. All three edited/created files are under CODEOWNERS
gates (`/architecture/`, `/tests/unit/architecture/`) — merge requires owner review;
local creation/edit in the worktree is expected. Reference `design.md` (D1–D6) and the
Scenarios in `spec.md`.

Extraction facts confirmed at design time (given — re-confirm by the tests, not by
re-deriving): `model.md` §4 = `conformance.md` (A) = `describe` = {B-1 … B-12};
`arch-allowlist.ts` `invariant` = {B-1, B-6, B-12} (a subset; `"DSM"` has no entries).

New test-ID namespace: `TC-ICS-*` (invariant-catalog-sync).

## T-01: Implement the pure extraction + parity helpers in the new file

- [x] Create `tests/unit/architecture/invariant-catalog-parity.test.ts`.
- [x] Resolve paths from the file location (mirror `core-invariants.test.ts`):
  `__dirname` via `url.fileURLToPath(import.meta.url)`, `ROOT = path.resolve(__dirname,
  "../../..")`. Read the four sources with `fs.readFileSync(..., "utf-8")`:
  `path.join(ROOT, "architecture/model.md")`,
  `path.join(ROOT, "architecture/conformance.md")`,
  `path.join(__dirname, "core-invariants.test.ts")`,
  `path.join(__dirname, "arch-allowlist.ts")`.
- [x] Add a `sliceSection(text: string, startRe: RegExp, endRe: RegExp): string` helper:
  find the first line matching `startRe`; if none, **throw** with a clear message
  (e.g. `"catalog section heading not found: <startRe>"`); slice from there to the next
  line matching `endRe` (or end of file).
- [x] Add `normalizeId(n: string): string` returning `` `B-${parseInt(n, 10)}` `` and
  `sortIds(ids: Iterable<string>): string[]` sorting by the integer after `"B-"`.
- [x] Add four extractors returning `Set<string>` (design D2):
  - `extractModelCatalogIds(md)`: `sliceSection(md, /^##\s+4\./m, /^##\s+/m)` then collect
    from lines matching `/^\s*\|\s*\*\*B-(\d+)\*\*/`.
  - `extractConformanceCatalogIds(md)`: `sliceSection(md, /^###\s+\(A\)/m, /^###\s+/m)`
    then collect with the same leading-cell pattern.
  - `extractDescribeIds(ts)`: collect all matches of `/describe\("B-(\d+)/g`.
  - `extractAllowlistIds(ts)`: collect all matches of `/invariant:\s*"B-(\d+)"/g`.
- [x] Add `computeParity(catalog: Set<string>, teeth: Set<string>)` returning
  `{ undocumented: string[]; unenforced: string[] }` where
  `undocumented = sortIds(teeth − catalog)` and `unenforced = sortIds(catalog − teeth)`.
- [x] Keep all helpers module-local (not exported); no direct SDK/child_process import.

**Acceptance Criteria**:
- The file reads the four sources by absolute path resolved from `import.meta.url` (no
  reliance on process cwd).
- `sliceSection` throws (not returns empty) when the anchor heading is absent.
- The four extractors return `Set<string>` of normalized `B-<n>` IDs; `"DSM"` and prose
  mentions are excluded.
- `bun run typecheck` passes for the new file.

## T-02: Assert catalog↔teeth parity and catalog internal consistency

- [x] In a `describe("invariant catalog ↔ teeth B-x ID parity", ...)` block (title MUST
  NOT begin with `B-N`, so it is never picked up by any `describe("B-` extractor):
  - [x] `TC-ICS-01`: assert `sortIds(modelIds)` deep-equals `sortIds(conformanceIds)`
    (the two catalog tables agree; design D3).
  - [x] `TC-ICS-02`: build `teethIds = new Set([...describeIds, ...allowlistIds])` and
    `catalogIds = modelIds`; assert `computeParity(catalogIds, teethIds).undocumented`
    `toEqual([])` and `.unenforced` `toEqual([])` (bidirectional parity; design D3).
  - [x] `TC-ICS-03`: assert `allowlistIds ⊆ describeIds` (every allowlist `invariant` ID
    has a corresponding enforcing `describe` block; design D3). Implement as: the sorted
    array of `[...allowlistIds].filter(id => !describeIds.has(id))` `toEqual([])`.

**Acceptance Criteria**:
- `TC-ICS-01` fails if `model.md` §4 and `conformance.md` (A) disagree on any B-x ID.
- `TC-ICS-02` fails on any undocumented (teeth − catalog) OR documented-but-unenforced
  (catalog − teeth) ID, in both directions.
- `TC-ICS-03` fails if an allowlist `invariant` references an ID with no `describe` block.
- With the current repository state, all three pass (catalog = teeth = {B-1 … B-12};
  allowlist {B-1, B-6, B-12} ⊆ describe).

## T-03: Assert liveness (non-empty extracted sets)

- [x] `TC-ICS-04`: assert `modelIds.size > 0`, `conformanceIds.size > 0`, and
  `describeIds.size > 0` (design D4). Do NOT assert `allowlistIds.size > 0` (a fully
  burned-down allowlist legitimately has zero B-x entries).

**Acceptance Criteria**:
- `TC-ICS-04` fails if any of the three catalog/describe extractors returns an empty set
  (guards against a broken extractor making `TC-ICS-02` pass vacuously).
- No liveness assertion is placed on `allowlistIds`.

## T-04: Detection test — reproduce the B-12 desync and assert red

- [x] `TC-ICS-05` (design D5): remove the `**B-12**` table row from BOTH real texts:
  `dropB12 = (text) => text.split("\n").filter(l => !/^\s*\|\s*\*\*B-12\*\*/.test(l)).join("\n")`.
  Compute `catalogIdsNo12 = extractModelCatalogIds(dropB12(modelText))`.
  - [x] Perturbation guard: assert `catalogIdsNo12.has("B-12")` is `false` (the row was
    actually removed; fails loudly if the row format drifted).
  - [x] Assert `computeParity(catalogIdsNo12, teethIds).undocumented` **contains** `"B-12"`
    (the historical desync is detected as red), where `teethIds` still contains B-12.
- [x] Optionally also confirm `extractConformanceCatalogIds(dropB12(conformanceText))`
  likewise drops B-12, matching the historical state where both tables stopped at B-11.

**Acceptance Criteria**:
- `TC-ICS-05` first asserts B-12 was removed from the perturbed catalog, then asserts the
  parity check reports B-12 as undocumented — proving the tooth catches the exact desync
  that occurred (B-12 in the teeth, absent from the doc catalog).

## T-05: Update the stale prose range strings (requirement 4)

- [x] In `tests/unit/architecture/arch-allowlist.ts` docstring, change
  `architecture/model.md §4 (B-1 through B-8).` → `architecture/model.md §4 (B-1 through B-12).`
- [x] In `tests/unit/architecture/core-invariants.test.ts` docstring, change
  `Enforces architecture/model.md §4 invariants B-1 through B-8 across the` →
  `Enforces architecture/model.md §4 invariants B-1 through B-12 across the`
- [x] Change ONLY these comment strings. Do NOT modify any `describe` title, any
  `invariant` field, any assertion, or any allowlist entry (design D6).

**Acceptance Criteria**:
- Both docstrings read `B-1 through B-12`.
- The diff to each file is exactly the one range string; `git diff` shows no change to
  any `describe` / `it` / `invariant` / assertion line.
- The new extractors do not pick up these comment strings (they match only
  `describe("B-` / `invariant: "B-`), so `TC-ICS-*` are unaffected.

## T-06: Verification — green gate and no-regression checks

- [x] Run `bun run typecheck && bun run test` and confirm green.
- [x] Confirm every existing B-1 … B-12 check and the DSM closure / regression-guard
  tests in `core-invariants.test.ts` pass unchanged.
- [x] Confirm the only diff to `core-invariants.test.ts` and `arch-allowlist.ts` is the
  requirement-4 docstring range string (T-05), with no assertion/entry change.
- [x] Confirm `architecture/model.md`, `architecture/conformance.md`, and
  `architecture/divergence-status.md` are untouched.
- [x] Confirm the new file is discovered by vitest (`tests/**/*.test.ts`) and typechecked
  (`tests/**/*.ts`) — the five `TC-ICS-*` tests run and pass.

**Acceptance Criteria**:
- `typecheck` and `test` are green.
- The five `TC-ICS-*` tests (parity ×3, liveness, detection) pass.
- No existing architecture assertion or allowlist entry changed; catalog docs untouched.
