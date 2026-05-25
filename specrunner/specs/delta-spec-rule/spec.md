## Purpose

TBD
## Requirements

### Requirement: DeltaSpecRuleName union type

`src/core/spec/rules/types.ts` の `DeltaSpecRuleName` union 型 SHALL 以下の 11 rule name を string literal union で列挙する: `"canonical-spec-structure" | "no-legacy-flat-dir" | "no-legacy-flat-file" | "no-specs-for-required-type" | "removed-section-format" | "renamed-section-format" | "requirement-header-required" | "scenario-required-per-requirement" | "normative-keyword-required" | "baseline-header-match" | "no-authority-spec-direct-edit"`
- この union は「valid な rule name の制約」であり、registry に登録される rule 集合の列挙ではない（`no-specs-for-required-type` は union に含むが registry には登録しない）

#### Scenario: typo in rule name causes compile error

- **GIVEN** a rule file declares `DeltaSpecRule<DeltaSpecRuleName>`
- **WHEN** the `name` property is set to `"canonical-spec-strcuture"` (typo)
- **THEN** the TypeScript compiler reports a type error

#### Scenario: new rule name is type-safe

- **GIVEN** a rule file declares `DeltaSpecRule<DeltaSpecRuleName>`
- **WHEN** the `name` property is set to `"no-authority-spec-direct-edit"`
- **THEN** the TypeScript compiler accepts it without error

### Requirement: DeltaSpecRule interface に TName type parameter を追加

`DeltaSpecRule` interface を `DeltaSpecRule<TName extends string = string>` に拡張し、`name` フィールドの型を `TName` に変更する。

- default `string` で backward compatibility を維持する
- `DeltaSpecRule` は `ValidationRule` を extend しない（sync vs async の差異により独立 interface を維持）

### Requirement: DeltaSpecRuleRegistry に TName type parameter を追加

`DeltaSpecRuleRegistry` を `DeltaSpecRuleRegistry<TName extends string = string>` に拡張する。

- `register(rule: DeltaSpecRule<TName>)` の引数型を `DeltaSpecRule<TName>` にする
- `TName` 外の name を持つ rule の register は tsc が compile error として拒否する

### Requirement: DSV rule 4 ファイルを DeltaSpecRule<DeltaSpecRuleName> で specialize

以下 4 ファイルの型注釈を `DeltaSpecRule<DeltaSpecRuleName>` に変更する:

- `src/core/spec/rules/canonical-spec-structure.ts`
- `src/core/spec/rules/no-legacy-flat-dir.ts`
- `src/core/spec/rules/no-legacy-flat-file.ts`
- `src/core/spec/rules/no-specs-for-required-type.ts`

rule 内で typo（例: `"canonical-spec-strcuture"`）を書くと tsc が compile error として検知する。

### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` SHALL `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返し、10 rule を登録する:

`noLegacyFlatFile`, `noLegacyFlatDir`, `canonicalSpecStructure`, `removedSectionFormat`, `renamedSectionFormat`, `requirementHeaderRequired`, `scenarioRequiredPerRequirement`, `normativeKeywordRequired`, `baselineHeaderMatch`, `noAuthoritySpecDirectEdit`

`no-specs-for-required-type` は D9 設計で early-return 用途のため registry には登録しない。

#### Scenario: registry contains 10 rules

- **GIVEN** `createDeltaSpecRegistry()` is called
- **WHEN** the returned registry is inspected
- **THEN** it contains 10 registered rules

### Requirement: canonical-spec-structure rule SHALL validate new delta spec format

The `canonical-spec-structure` rule SHALL check for the presence of `## Requirements` as the valid section header in delta spec files. The old section headers (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) SHALL be detected as a new violation reason `legacy-section-header` with severity `error`.

Validation logic:
- `## Requirements` present with at least one `### Requirement:` block → pass
- `## Requirements` absent → `missing-requirements-section` violation (unchanged)
- `## Requirements` present but no `### Requirement:` blocks → `empty-section` violation (unchanged)
- Any of `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` present → `legacy-section-header` violation with suggested fix: "Replace with ## Requirements (tool auto-classifies ADDED/MODIFIED)"

`## Removed` and `## Renamed` sections are optional and SHALL NOT be validated by this rule (their content is validated by the merger at finish time).

#### Scenario: new format passes validation

- **GIVEN** a delta spec file at `specs/<cap>/spec.md` containing `## Requirements` and `### Requirement:` blocks
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** no violations are returned

#### Scenario: old format ADDED header triggers violation

- **GIVEN** a delta spec file containing `## ADDED Requirements`
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** a `legacy-section-header` violation is returned

#### Scenario: old format MODIFIED header triggers violation

- **GIVEN** a delta spec file containing `## MODIFIED Requirements`
- **WHEN** the `canonical-spec-structure` rule checks the file
- **THEN** a `legacy-section-header` violation is returned

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

### Requirement: DeltaSpecViolationReason union SHALL include authority-spec-direct-edit

`src/core/spec/delta-spec-validator.ts` の `DeltaSpecViolationReason` union SHALL `"authority-spec-direct-edit"` を含む。この reason は `no-authority-spec-direct-edit` rule が authority spec (`specrunner/specs/<capability>/spec.md`) の直接編集を検出した場合に使用される。

#### Scenario: violation reason is valid type

- **GIVEN** code creates a `DeltaSpecViolation` object
- **WHEN** `reason` is set to `"authority-spec-direct-edit"`
- **THEN** the TypeScript compiler accepts it without error

### Requirement: DeltaSpecRuleInput SHALL provide optional changedFiles

`src/core/spec/rules/types.ts` の `DeltaSpecRuleInput` interface に `changedFiles?: string[]` を追加する。

- `changedFiles` は repo root からの相対パスの配列（`git diff <baseBranch>..HEAD --name-only` の出力）
- optional — undefined の場合、`no-authority-spec-direct-edit` rule は PASS を返す SHALL
- 呼び出し側 (`DeltaSpecValidationStep.run`) が `git diff` を事前実行し、結果を inject する

#### Scenario: existing tests compile without changedFiles

- **GIVEN** existing unit tests create `DeltaSpecRuleInput` without `changedFiles`
- **WHEN** `bun run typecheck` is executed
- **THEN** no type errors are reported

#### Scenario: step injects changedFiles

- **GIVEN** `DeltaSpecValidationStep` is running
- **WHEN** it calls `validateDeltaSpecPaths`
- **THEN** a `changedFiles` array computed from `git diff <baseBranch>..HEAD --name-only` is passed

### Requirement: no-authority-spec-direct-edit rule SHALL detect authority spec edits

`src/core/spec/rules/no-authority-spec-direct-edit.ts` に `no-authority-spec-direct-edit` rule を定義する。severity は `error`。

rule は `input.changedFiles` から `specrunner/specs/` prefix を持つパスを検出し、`authority-spec-direct-edit` violation を返す SHALL。`specrunner/changes/` prefix のパス（delta spec）は除外する。`changedFiles` が undefined の場合は空配列を返す（skip）。

#### Scenario: authority spec edit detected

- **GIVEN** `changedFiles` contains `specrunner/specs/foo/spec.md`
- **WHEN** `no-authority-spec-direct-edit` rule checks the input
- **THEN** an `authority-spec-direct-edit` violation is returned for that path

#### Scenario: delta spec only passes

- **GIVEN** `changedFiles` contains only `specrunner/changes/slug/specs/foo/spec.md`
- **WHEN** `no-authority-spec-direct-edit` rule checks the input
- **THEN** no violations are returned

#### Scenario: source code only passes

- **GIVEN** `changedFiles` contains only `src/core/foo.ts`
- **WHEN** `no-authority-spec-direct-edit` rule checks the input
- **THEN** no violations are returned

#### Scenario: undefined changedFiles passes

- **GIVEN** `changedFiles` is undefined
- **WHEN** `no-authority-spec-direct-edit` rule checks the input
- **THEN** no violations are returned

#### Scenario: mixed files — only authority spec violates

- **GIVEN** `changedFiles` contains `specrunner/specs/foo/spec.md`, `specrunner/changes/slug/specs/foo/spec.md`, and `src/core/bar.ts`
- **WHEN** `no-authority-spec-direct-edit` rule checks the input
- **THEN** exactly one violation is returned for `specrunner/specs/foo/spec.md`

### Requirement: delta-spec-fixer prompt SHALL include baseline rollback instruction

`src/core/step/delta-spec-fixer.ts` の initial message と continuation message に `authority-spec-direct-edit` violation 用の rollback 指示を含める SHALL:

- `git checkout <baseBranch> -- <violated-path>` で authority spec の編集を revert
- 変更内容を対応する delta path (`specrunner/changes/<slug>/specs/<capability>/spec.md`) に書き直す

#### Scenario: fixer receives authority-spec-direct-edit violation

- **GIVEN** delta-spec-validation-result.md contains an `authority-spec-direct-edit` violation
- **WHEN** delta-spec-fixer reads the prompt
- **THEN** the prompt instructs to revert the authority spec edit and write changes to delta path

### Requirement: commit-push SHALL warn instead of halt on authority spec violation

`src/core/step/commit-push.ts` の authority spec violation 検出経路（staged-changes path と HEAD-diff path の両方）SHALL `throw` ではなく `stderrWrite` で warning を出力し、pipeline を続行する。`findAuthoritySpecViolations()` 検出ロジック自体は維持する。

#### Scenario: staged authority spec triggers warning

- **GIVEN** staged files include `specrunner/specs/foo/spec.md`
- **WHEN** `commitAndPush` is called
- **THEN** a warning is written to stderr AND the commit proceeds (no throw)

#### Scenario: agent self-commit with authority spec triggers warning

- **GIVEN** agent committed files including `specrunner/specs/foo/spec.md`
- **WHEN** `commitAndPush` detects the HEAD diff
- **THEN** a warning is written to stderr AND the push proceeds (no throw)

#### Scenario: delta spec only — no warning

- **GIVEN** staged files include only `specrunner/changes/slug/specs/foo/spec.md`
- **WHEN** `commitAndPush` is called
- **THEN** no warning is written and commit proceeds normally
