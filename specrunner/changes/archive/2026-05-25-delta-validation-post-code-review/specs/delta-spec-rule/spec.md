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

### Requirement: createDeltaSpecRegistry() の戻り型を DeltaSpecRuleRegistry<DeltaSpecRuleName> に変更

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` SHALL `DeltaSpecRuleRegistry<DeltaSpecRuleName>` を返し、10 rule を登録する:

`noLegacyFlatFile`, `noLegacyFlatDir`, `canonicalSpecStructure`, `removedSectionFormat`, `renamedSectionFormat`, `requirementHeaderRequired`, `scenarioRequiredPerRequirement`, `normativeKeywordRequired`, `baselineHeaderMatch`, `noAuthoritySpecDirectEdit`

`no-specs-for-required-type` は D9 設計で early-return 用途のため registry には登録しない。

#### Scenario: registry contains 10 rules

- **GIVEN** `createDeltaSpecRegistry()` is called
- **WHEN** the returned registry is inspected
- **THEN** it contains 10 registered rules

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
