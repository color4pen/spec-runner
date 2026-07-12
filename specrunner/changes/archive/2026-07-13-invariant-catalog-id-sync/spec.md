# Spec: 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合の一致固定

## Requirements

### Requirement: doc カタログと歯の B-x ID 集合の双方向一致を test で固定する

A test SHALL extract the B-x invariant ID set from the documentation catalog
(`architecture/model.md` §4 table and `architecture/conformance.md` section (A) check
table) and the B-x ID set referenced by the enforcing teeth
(`tests/unit/architecture/core-invariants.test.ts` `describe("B-N")` blocks unioned
with `tests/unit/architecture/arch-allowlist.ts` `invariant` fields), and SHALL assert
these two sets are equal in both directions. An ID present in the teeth but absent from
the catalog (undocumented invariant) MUST fail; an ID present in the catalog but absent
from the teeth (documented-but-unenforced invariant) MUST fail.

The two catalog sources SHALL themselves be asserted equal (`model.md` §4 table set ==
`conformance.md` (A) table set), so drift between the two authoritative catalog tables
is localised.

The allowlist `invariant` set MAY be a strict subset of the enforced set (an invariant
with zero grandfathered divergences legitimately has no allowlist entry); the test MUST
NOT require the allowlist set to be complete. The allowlist `invariant` set SHALL be
asserted to be a subset of the `describe` set, so an allowlist entry referencing a
non-existent invariant fails.

#### Scenario: catalog and teeth reference the same B-x ID set

**Given** the current repository state where `model.md` §4, `conformance.md` (A),
`core-invariants.test.ts` describe blocks all enumerate B-1 … B-12 and the allowlist
references a subset of those IDs
**When** the parity test extracts the catalog set and the teeth set and compares them
**Then** the `undocumented` difference (teeth − catalog) is empty
**And** the `unenforced` difference (catalog − teeth) is empty

#### Scenario: an invariant enforced by a describe block but missing from the catalog fails

**Given** a B-x ID that has a `describe("B-N")` block but does not appear in the
`model.md` §4 table nor the `conformance.md` (A) table
**When** the parity test runs
**Then** the test fails, reporting the ID as an undocumented invariant

#### Scenario: an invariant documented in the catalog but missing from the teeth fails

**Given** a B-x ID that appears in the catalog tables but has no `describe("B-N")` block
and no allowlist `invariant` entry
**When** the parity test runs
**Then** the test fails, reporting the ID as a documented-but-unenforced invariant

#### Scenario: the two catalog tables must agree

**Given** the `model.md` §4 table set and the `conformance.md` (A) table set
**When** the parity test compares them
**Then** they are equal (any B-x ID in one table but not the other fails)

#### Scenario: allowlist may be a subset but must not reference a non-existent invariant

**Given** the allowlist `invariant` set (currently a subset of the enforced set)
**When** the parity test checks it against the `describe` set
**Then** the allowlist set is a subset of the `describe` set
**And** an allowlist entry whose `invariant` ID has no corresponding `describe` block
would fail the parity check as an undocumented ID

### Requirement: catalog 抽出は §4 表と (A) 検査表のセル行に限定する

The catalog extraction SHALL read B-x IDs only from table rows whose leading cell begins
with a bolded `**B-N**` token, scoped to the `model.md` §4 section and the
`conformance.md` section (A). Prose mentions of B-x IDs (e.g. `B-6/B-7/B-10` in a
paragraph), non-catalog tables, and other documents such as `divergence-status.md` MUST
NOT contribute to the catalog set.

If a required section heading (§4 in `model.md`, (A) in `conformance.md`) cannot be
located, the extractor MUST fail loudly rather than silently return an empty set.

#### Scenario: prose B-x mentions are not extracted as catalog IDs

**Given** `model.md` §4 contains an intro paragraph mentioning `B-1〜B-4`, `B-5〜B-12`,
and `B-6/B-7/B-10` outside the table
**When** the catalog extractor runs over the §4 section
**Then** only the bolded leading-cell table rows contribute IDs
**And** the prose mentions do not add or remove any ID

#### Scenario: non-catalog tables do not contribute IDs

**Given** `conformance.md` contains a consumption-point table row `| B-x 不変条件 ... |`
and a judgment-review table outside section (A)
**When** the catalog extractor runs
**Then** those rows do not contribute any B-x ID to the catalog set

### Requirement: B-12 が doc カタログから欠落した状態を検出テストで固定する

A detection test SHALL reproduce the historical desync — B-12 removed from both the
`model.md` §4 table and the `conformance.md` (A) table while the teeth still reference
B-12 — and SHALL assert that the parity check reports B-12 as an undocumented invariant
(i.e. the check goes red). The detection SHALL be driven by removing the `**B-12**`
table row from the real document text and re-running the extractor, and SHALL guard that
the perturbation actually removed B-12 before asserting the parity failure.

#### Scenario: removing B-12 from the catalog text makes the parity check red

**Given** the real `model.md` and `conformance.md` texts with the `**B-12**` table row
removed
**When** the catalog extractor re-runs over the perturbed text and the parity is computed
against the real teeth set (which still contains B-12)
**Then** the perturbed catalog set does not contain B-12
**And** the `undocumented` difference contains B-12

### Requirement: liveness — 抽出した ID 集合が空でない

The parity test SHALL assert that the `model.md` §4 set, the `conformance.md` (A) set,
and the `describe` set are each non-empty, so a broken extractor that returns nothing
cannot make the equality assertion pass vacuously. The allowlist `invariant` set SHALL
NOT be subject to a non-empty liveness assertion, because a fully burned-down allowlist
legitimately contains zero B-x entries.

#### Scenario: non-empty extracted sets

**Given** the parity test has extracted the catalog and teeth sets
**When** it checks liveness
**Then** the `model.md` §4 set is non-empty
**And** the `conformance.md` (A) set is non-empty
**And** the `describe` set is non-empty

#### Scenario: an empty allowlist does not fail liveness

**Given** a hypothetical future state where every grandfathered divergence has been
burned down and the allowlist has zero B-x `invariant` entries
**When** the parity test runs
**Then** the allowlist emptiness does not by itself cause a failure
**And** the parity between catalog and the `describe`-derived teeth still holds

### Requirement: 陳腐化した散文範囲表記を現行範囲に更新する

The stale prose range `B-1 through B-8` in `arch-allowlist.ts` (docstring) and
`core-invariants.test.ts` (docstring) SHALL be updated to the current range
`B-1 through B-12`. This edit SHALL touch only comment text and MUST NOT alter any
`describe` title, any `invariant` field, or any invariant check logic.

#### Scenario: allowlist docstring range is current

**Given** `tests/unit/architecture/arch-allowlist.ts`
**When** its header docstring is read
**Then** it states the invariant range as `B-1 through B-12`

#### Scenario: core-invariants docstring range is current

**Given** `tests/unit/architecture/core-invariants.test.ts`
**When** its header docstring is read
**Then** it states the enforced invariant range as `B-1 through B-12`

### Requirement: 既存の B-1〜B-12 各検査は無変更で green

The existing B-1 … B-12 invariant checks and the DSM closure checks in
`core-invariants.test.ts`, and the allowlist entries in `arch-allowlist.ts`, SHALL remain
behaviorally unchanged and green. The only permitted edit to these two files is the
single docstring range-string update; no `describe`, `it`, assertion, or allowlist entry
is added, removed, or modified.

#### Scenario: existing architecture suite stays green with no assertion change

**Given** the completed change
**When** `bun run typecheck && bun run test` runs
**Then** every existing B-1 … B-12 check and DSM check passes unchanged
**And** the new parity test passes
**And** the only diff to `core-invariants.test.ts` / `arch-allowlist.ts` is the
docstring range string
