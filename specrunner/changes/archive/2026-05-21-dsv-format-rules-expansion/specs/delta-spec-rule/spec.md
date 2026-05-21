# delta-spec-rule Delta Spec

## Requirements

### Requirement: DeltaSpecRuleName union type

`src/core/spec/rules/types.ts` の `DeltaSpecRuleName` union 型 SHALL 以下の 10 rule name を string literal union で列挙する: `"canonical-spec-structure" | "no-legacy-flat-dir" | "no-legacy-flat-file" | "no-specs-for-required-type" | "removed-section-format" | "renamed-section-format" | "requirement-header-required" | "scenario-required-per-requirement" | "normative-keyword-required" | "baseline-header-match"`
- この union は「valid な rule name の制約」であり、registry に登録される rule 集合の列挙ではない（`no-specs-for-required-type` は union に含むが registry には登録しない）

#### Scenario: typo in rule name causes compile error

- **GIVEN** a rule file declares `DeltaSpecRule<DeltaSpecRuleName>`
- **WHEN** the `name` property is set to `"canonical-spec-strcuture"` (typo)
- **THEN** the TypeScript compiler reports a type error

#### Scenario: new rule name is type-safe

- **GIVEN** a rule file declares `DeltaSpecRule<DeltaSpecRuleName>`
- **WHEN** the `name` property is set to `"removed-section-format"`
- **THEN** the TypeScript compiler accepts it without error

### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` SHALL `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返す。

- 登録 rule 数は 9: `noLegacyFlatFile`, `noLegacyFlatDir`, `canonicalSpecStructure`, `removedSectionFormat`, `renamedSectionFormat`, `requirementHeaderRequired`, `scenarioRequiredPerRequirement`, `normativeKeywordRequired`, `baselineHeaderMatch`
- `no-specs-for-required-type` は D9 設計で early-return 用途のため registry には登録しない

JSDoc に「`DeltaSpecRuleName` union は valid な rule name の制約であり、`createDeltaSpecRegistry()` が登録する rule 集合の列挙ではない」旨を明記する。

#### Scenario: registry contains 9 rules

- **GIVEN** `createDeltaSpecRegistry()` is called
- **WHEN** the returned registry is inspected
- **THEN** it contains 9 registered rules

### Requirement: DeltaSpecRuleInput SHALL provide optional baselineSpecLoader

`src/core/spec/rules/types.ts` の `DeltaSpecRuleInput` interface に `baselineSpecLoader?: (capability: string) => Promise<string | null>` を追加する。

- `baselineSpecLoader` は optional — 6 rule のうち `baseline-header-match` のみが使用する
- undefined の場合、rule は baseline 不在と同様に扱い PASS を返す SHALL
- 呼び出し側 (`validateDeltaSpecPaths`) は default `async () => null` を提供し、`DeltaSpecValidationStep` が実 loader を inject する

#### Scenario: existing tests compile without baselineSpecLoader

- **GIVEN** existing unit tests create `DeltaSpecRuleInput` without `baselineSpecLoader`
- **WHEN** `bun run typecheck` is executed
- **THEN** no type errors are reported

#### Scenario: step injects real loader

- **GIVEN** `DeltaSpecValidationStep` is running
- **WHEN** it calls `validateDeltaSpecPaths`
- **THEN** a `baselineSpecLoader` that reads `specrunner/specs/<capability>/spec.md` is passed

### Requirement: removed-section-format rule SHALL validate ## Removed section format

`src/core/spec/rules/removed-section-format.ts` に `removed-section-format` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの `## Removed` セクション内の非空行が `- "requirement name"` 形式 (regex: `^-\s+"(.+?)"\s*$`) であることを SHALL 検証する。`## Removed` セクションが存在しない場合は PASS (optional セクション)。

#### Scenario: valid format passes

- **GIVEN** a delta spec with `## Removed` containing `- "requirement name"`
- **WHEN** `removed-section-format` rule checks the file
- **THEN** no violations are returned

#### Scenario: heading format triggers violation

- **GIVEN** a delta spec with `## Removed` containing `### Removed: name` (PR #359 regression)
- **WHEN** `removed-section-format` rule checks the file
- **THEN** a `removed-section-format` violation is returned

#### Scenario: unquoted name triggers violation

- **GIVEN** a delta spec with `## Removed` containing `- name without quotes`
- **WHEN** `removed-section-format` rule checks the file
- **THEN** a `removed-section-format` violation is returned

#### Scenario: absent section passes

- **GIVEN** a delta spec without `## Removed` section
- **WHEN** `removed-section-format` rule checks the file
- **THEN** no violations are returned

### Requirement: renamed-section-format rule SHALL validate ## Renamed section format

`src/core/spec/rules/renamed-section-format.ts` に `renamed-section-format` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの `## Renamed` セクション内の非空行が `- "old name" → "new name"` 形式 (regex: `^-\s+"(.+?)"\s*(?:→|->|=>)\s*"(.+?)"\s*$`) であることを SHALL 検証する。Unicode arrow `→`、ASCII `->` `=>` のいずれも許容する。`## Renamed` セクションが存在しない場合は PASS。

#### Scenario: valid format with Unicode arrow passes

- **GIVEN** a delta spec with `## Renamed` containing `- "old" → "new"`
- **WHEN** `renamed-section-format` rule checks the file
- **THEN** no violations are returned

#### Scenario: ASCII arrow passes

- **GIVEN** a delta spec with `## Renamed` containing `- "old" -> "new"`
- **WHEN** `renamed-section-format` rule checks the file
- **THEN** no violations are returned

#### Scenario: unquoted names trigger violation

- **GIVEN** a delta spec with `## Renamed` containing `- old → new`
- **WHEN** `renamed-section-format` rule checks the file
- **THEN** a `renamed-section-format` violation is returned

### Requirement: requirement-header-required rule SHALL validate Requirement header prefix

`src/core/spec/rules/requirement-header-required.ts` に `requirement-header-required` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの `## Requirements` セクション内の全 `### ` (h3) header が `### Requirement:` で始まることを SHALL 検証する。`## Requirements` セクション不在時は PASS (`canonical-spec-structure` が責任を持つ)。

#### Scenario: standard headers pass

- **GIVEN** a delta spec where all h3 headers are `### Requirement: ...`
- **WHEN** `requirement-header-required` rule checks the file
- **THEN** no violations are returned

#### Scenario: non-standard prefix triggers violation

- **GIVEN** a delta spec with `### REQ-001: something` under `## Requirements`
- **WHEN** `requirement-header-required` rule checks the file
- **THEN** a `non-standard-requirement-header` violation is returned

#### Scenario: mixed headers

- **GIVEN** a delta spec with both `### Requirement: X` and `### Feature: Y`
- **WHEN** `requirement-header-required` rule checks the file
- **THEN** exactly one `non-standard-requirement-header` violation is returned for `### Feature: Y`

### Requirement: scenario-required-per-requirement rule SHALL validate Scenario presence

`src/core/spec/rules/scenario-required-per-requirement.ts` に `scenario-required-per-requirement` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの `## Requirements` セクション内の各 `### Requirement:` block が少なくとも 1 つの `#### Scenario:` block を含むことを SHALL 検証する。

#### Scenario: requirement with scenario passes

- **GIVEN** a delta spec where each Requirement has at least one `#### Scenario:` block
- **WHEN** `scenario-required-per-requirement` rule checks the file
- **THEN** no violations are returned

#### Scenario: requirement without scenario triggers violation

- **GIVEN** a delta spec with a `### Requirement:` block containing no `#### Scenario:` block
- **WHEN** `scenario-required-per-requirement` rule checks the file
- **THEN** a `missing-scenario` violation is returned

### Requirement: normative-keyword-required rule SHALL validate normative keyword presence

`src/core/spec/rules/normative-keyword-required.ts` に `normative-keyword-required` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの各 Requirement の本文 (header 直後〜最初の `#### Scenario:` の間) に英語の `SHALL` または `MUST` が少なくとも 1 回 (word boundary) 出現することを SHALL 検証する。header 行自体は検査対象外。

#### Scenario: body with SHALL passes

- **GIVEN** a Requirement body containing `The system SHALL do X`
- **WHEN** `normative-keyword-required` rule checks the file
- **THEN** no violations are returned

#### Scenario: body without normative keyword triggers violation

- **GIVEN** a Requirement body containing only `The system does X` (no SHALL/MUST)
- **WHEN** `normative-keyword-required` rule checks the file
- **THEN** a `missing-normative-keyword` violation is returned

#### Scenario: SHALL in header only does not count

- **GIVEN** a Requirement with header `### Requirement: The system SHALL do X` but body lacking SHALL/MUST
- **WHEN** `normative-keyword-required` rule checks the file
- **THEN** a `missing-normative-keyword` violation is returned

### Requirement: baseline-header-match rule SHALL validate Requirement headers against baseline

`src/core/spec/rules/baseline-header-match.ts` に `baseline-header-match` rule を定義する。severity は `error`。

rule は各 delta spec ファイルの各 Requirement header が:
- baseline spec の Requirement header と完全一致するか (= MODIFIED)
- baseline spec のどの Requirement header とも一致しないか (= ADDED)

のいずれかであることを SHALL 検証する。

完全一致しないが normalized match (lowercase + whitespace 正規化) で baseline header と一致する場合は violation (typo / case 違いの疑い)。

`baselineSpecLoader` が undefined の場合、または baseline が `null` を返す場合 (新規 capability) は、全 Requirement を ADDED 扱いとして PASS する SHALL。

#### Scenario: exact match passes

- **GIVEN** a delta Requirement header that exactly matches a baseline Requirement header
- **WHEN** `baseline-header-match` rule checks the file
- **THEN** no violations are returned

#### Scenario: new requirement passes

- **GIVEN** a delta Requirement header that does not match any baseline header (exact or normalized)
- **WHEN** `baseline-header-match` rule checks the file
- **THEN** no violations are returned (ADDED)

#### Scenario: case mismatch triggers violation

- **GIVEN** a delta Requirement header that matches a baseline header case-insensitively but not case-sensitively
- **WHEN** `baseline-header-match` rule checks the file
- **THEN** a `baseline-header-mismatch` violation is returned

#### Scenario: new capability passes

- **GIVEN** `baselineSpecLoader` returns `null` for the capability
- **WHEN** `baseline-header-match` rule checks the file
- **THEN** no violations are returned

#### Scenario: no loader passes

- **GIVEN** `baselineSpecLoader` is undefined in the input
- **WHEN** `baseline-header-match` rule checks the file
- **THEN** no violations are returned
