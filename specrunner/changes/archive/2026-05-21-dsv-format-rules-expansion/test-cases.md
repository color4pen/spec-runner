# Test Cases: dsv-format-rules-expansion

## Summary

delta-spec-validator に 6 つの format rule を追加し、`DeltaSpecRuleInput` に `baselineSpecLoader` を追加する変更のテストシナリオ。

---

## Category: TYPE_SYSTEM — 型システム基盤

### TC-001: DeltaSpecViolationReason に 6 reason が追加されている

- **Priority**: must
- **Source**: tasks.md Task 1a / request.md 要件 1-6

**GIVEN** `src/core/spec/delta-spec-validator.ts` をコンパイルした状態で  
**WHEN** `DeltaSpecViolationReason` 型を参照する  
**THEN** `"removed-section-format"` / `"renamed-section-format"` / `"non-standard-requirement-header"` / `"missing-scenario"` / `"missing-normative-keyword"` / `"baseline-header-mismatch"` の 6 reason が union に含まれている

---

### TC-002: DeltaSpecRuleName に 6 rule 名が追加されている

- **Priority**: must
- **Source**: tasks.md Task 1b / request.md 要件 9

**GIVEN** `src/core/spec/rules/types.ts` をコンパイルした状態で  
**WHEN** `DeltaSpecRuleName` 型を参照する  
**THEN** `"removed-section-format"` / `"renamed-section-format"` / `"requirement-header-required"` / `"scenario-required-per-requirement"` / `"normative-keyword-required"` / `"baseline-header-match"` の 6 名が union に含まれている

---

### TC-003: DeltaSpecRuleInput に baselineSpecLoader が optional フィールドとして追加されている

- **Priority**: must
- **Source**: tasks.md Task 1c / design.md DJ1

**GIVEN** `src/core/spec/rules/types.ts` をコンパイルした状態で  
**WHEN** `DeltaSpecRuleInput` interface を参照する  
**THEN** `baselineSpecLoader?: (capability: string) => Promise<string | null>` が存在し、optional (`?`) である

---

### TC-004: baselineSpecLoader が省略可能であること（後方互換）

- **Priority**: must
- **Source**: design.md DJ1

**GIVEN** 既存の `DeltaSpecRuleInput` 構築コードが `baselineSpecLoader` を含まない場合  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが発生しない（後方互換が維持されている）

---

## Category: PARSER — spec-content-parser 共有ヘルパー

### TC-010: loadSpecFiles — specs/ 配下の spec.md を全件返す

- **Priority**: must
- **Source**: tasks.md Task 2a

**GIVEN** change folder 内に `specs/foo/spec.md` と `specs/bar/spec.md` が存在する  
**WHEN** `loadSpecFiles(input)` を呼び出す  
**THEN** `[{ specPath: ".../specs/foo/spec.md", content: "...", capability: "foo" }, { specPath: ".../specs/bar/spec.md", content: "...", capability: "bar" }]` の 2 件が返る

---

### TC-011: loadSpecFiles — specs/ ディレクトリが存在しない場合は空配列を返す

- **Priority**: must
- **Source**: tasks.md Task 2a

**GIVEN** change folder に `specs/` ディレクトリが存在しない  
**WHEN** `loadSpecFiles(input)` を呼び出す  
**THEN** 空配列 `[]` が返り、例外は発生しない

---

### TC-012: loadSpecFiles — specs/ 配下のフラットな .md ファイルは skip する

- **Priority**: should
- **Source**: tasks.md Task 2a

**GIVEN** change folder 内に `specs/README.md` (flat file) と `specs/foo/spec.md` が存在する  
**WHEN** `loadSpecFiles(input)` を呼び出す  
**THEN** `specs/foo/spec.md` の 1 件のみ返り、`specs/README.md` は含まれない

---

### TC-013: extractSection — 指定 header のセクション内容を返す

- **Priority**: must
- **Source**: tasks.md Task 2b

**GIVEN** content に `## Removed\n- "foo"\n## Other\n...` が含まれる  
**WHEN** `extractSection(content, "## Removed")` を呼び出す  
**THEN** `'- "foo"\n'` が返る（次の `##` 以前のテキスト）

---

### TC-014: extractSection — セクションが存在しない場合は null を返す

- **Priority**: must
- **Source**: tasks.md Task 2b

**GIVEN** content に `## Removed` セクションが存在しない  
**WHEN** `extractSection(content, "## Removed")` を呼び出す  
**THEN** `null` が返る

---

### TC-015: extractSection — セクションが最後（EOF まで）の場合も正しく抽出する

- **Priority**: should
- **Source**: tasks.md Task 2b

**GIVEN** content が `## Removed\n- "foo"\n- "bar"\n` で終わる（その後に `##` がない）  
**WHEN** `extractSection(content, "## Removed")` を呼び出す  
**THEN** `'- "foo"\n- "bar"\n'` が返る

---

### TC-016: parseRequirementBlocks — 正常な Requirement block を解析する

- **Priority**: must
- **Source**: tasks.md Task 2c

**GIVEN** Requirements セクション内容に `### Requirement: Foo\nThe system SHALL ...\n#### Scenario: bar\n...` が含まれる  
**WHEN** `parseRequirementBlocks(sectionContent)` を呼び出す  
**THEN** `header: "### Requirement: Foo"`, `name: "Foo"`, `hasScenario: true`, `body` に "The system SHALL ..." が含まれる block が返る

---

### TC-017: parseRequirementBlocks — Scenario なしの block は hasScenario: false

- **Priority**: must
- **Source**: tasks.md Task 2c

**GIVEN** Requirements セクション内容に `### Requirement: NoScenario\nThe system SHALL ...\n` が含まれる（`#### Scenario:` なし）  
**WHEN** `parseRequirementBlocks(sectionContent)` を呼び出す  
**THEN** `hasScenario: false` の block が返る

---

### TC-018: parseRequirementBlocks — body は header 直後〜最初の Scenario の前まで

- **Priority**: must
- **Source**: tasks.md Task 2c / design.md DJ5

**GIVEN** `### Requirement: X\nbody text here\n#### Scenario: s1\nscenario text\n`  
**WHEN** `parseRequirementBlocks(sectionContent)` を呼び出す  
**THEN** `body` は `"body text here\n"` であり、scenario text は含まれない

---

### TC-019: parseRequirementBlocks — Requirements セクションが空の場合は空配列を返す

- **Priority**: should
- **Source**: tasks.md Task 2c

**GIVEN** Requirements セクション内容が空文字列  
**WHEN** `parseRequirementBlocks("")` を呼び出す  
**THEN** 空配列 `[]` が返る

---

## Category: RULE_REMOVED — removed-section-format rule

### TC-020: 正常 — `## Removed` に `- "name"` 形式の行のみ → violations なし

- **Priority**: must
- **Source**: tasks.md Task 3b ケース 1

**GIVEN** spec.md の `## Removed` セクションが `- "Foo Requirement"\n- "Bar Requirement"\n` のみ  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-021: 正常 — `## Removed` セクションなし → violations なし

- **Priority**: must
- **Source**: tasks.md Task 3b ケース 2

**GIVEN** spec.md に `## Removed` セクションが存在しない  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-022: regression PR#359 — `### Removed: name` heading 形式 → violation

- **Priority**: must
- **Source**: tasks.md Task 3b ケース 3 / request.md 背景 / request.md 要件 12

**GIVEN** spec.md の `## Removed` セクションに `### Removed: SomeName\n` が含まれる（PR #359 で実際に発生した形式）  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** `reason: "removed-section-format"` の violation が 1 件以上返り、`suggested` に `Replace with - "<requirement-name>" format per rules.md` が含まれる

---

### TC-023: 違反 — `- name without quotes` → violation

- **Priority**: must
- **Source**: tasks.md Task 3b ケース 4

**GIVEN** spec.md の `## Removed` セクションに `- FooRequirement\n` が含まれる（引用符なし）  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** `reason: "removed-section-format"` の violation が返る

---

### TC-024: 違反 — 自由形式テキスト → violation

- **Priority**: must
- **Source**: tasks.md Task 3b ケース 5

**GIVEN** spec.md の `## Removed` セクションに `The old feature was removed.\n` が含まれる（自由文）  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** `reason: "removed-section-format"` の violation が返る

---

### TC-025: edge — 空ファイル → violations なし

- **Priority**: should
- **Source**: tasks.md Task 3b ケース 6

**GIVEN** spec.md が空文字列  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である（例外も発生しない）

---

### TC-026: edge — `## Removed` + 空行のみ → violations なし

- **Priority**: should
- **Source**: tasks.md Task 3b ケース 7

**GIVEN** spec.md の `## Removed` セクションに空行のみが含まれる  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である（空行は非空行ではないため skip）

---

## Category: RULE_RENAMED — renamed-section-format rule

### TC-030: 正常 — `- "old" → "new"` Unicode arrow → violations なし

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 1

**GIVEN** spec.md の `## Renamed` セクションが `- "OldName" → "NewName"\n`  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-031: 正常 — `- "old" -> "new"` ASCII arrow → violations なし

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 2

**GIVEN** spec.md の `## Renamed` セクションが `- "OldName" -> "NewName"\n`  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-032: 正常 — `- "old" => "new"` fat arrow → violations なし

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 3

**GIVEN** spec.md の `## Renamed` セクションが `- "OldName" => "NewName"\n`  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-033: 正常 — `## Renamed` セクションなし → violations なし

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 4

**GIVEN** spec.md に `## Renamed` セクションが存在しない  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-034: 違反 — `- old → new` (引用符なし) → violation

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 5

**GIVEN** spec.md の `## Renamed` セクションに `- OldName → NewName\n` が含まれる  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** `reason: "renamed-section-format"` の violation が返り、`suggested` に `Replace with - "old" → "new" format per rules.md` が含まれる

---

### TC-035: 違反 — 自由形式テキスト → violation

- **Priority**: must
- **Source**: tasks.md Task 4b ケース 6

**GIVEN** spec.md の `## Renamed` セクションに `Renamed the old feature to something new.\n` が含まれる  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** `reason: "renamed-section-format"` の violation が返る

---

### TC-036: edge — 空ファイル → violations なし

- **Priority**: should
- **Source**: tasks.md Task 4b ケース 7

**GIVEN** spec.md が空文字列  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-037: 違反 — 片側だけ引用符あり → violation

- **Priority**: should
- **Source**: request.md 要件 2 (regex 仕様)

**GIVEN** spec.md の `## Renamed` セクションに `- "OldName" → NewName\n` が含まれる（new 側の引用符なし）  
**WHEN** `renamedSectionFormat.check(input)` を実行する  
**THEN** `reason: "renamed-section-format"` の violation が返る

---

## Category: RULE_REQ_HEADER — requirement-header-required rule

### TC-040: 正常 — 全 h3 が `### Requirement:` prefix → violations なし

- **Priority**: must
- **Source**: tasks.md Task 5b ケース 1

**GIVEN** spec.md の `## Requirements` セクションに `### Requirement: Foo\n` と `### Requirement: Bar\n` のみ含まれる  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-041: 違反 — `### REQ-001: something` → violation

- **Priority**: must
- **Source**: tasks.md Task 5b ケース 2 / request.md 要件 3

**GIVEN** spec.md の `## Requirements` セクションに `### REQ-001: Old Requirement\n` が含まれる  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** `reason: "non-standard-requirement-header"` の violation が返り、`suggested` に `Use ### Requirement: prefix for all requirement headers` が含まれる

---

### TC-042: 違反 — `### Feature: something` → violation

- **Priority**: must
- **Source**: tasks.md Task 5b ケース 3

**GIVEN** spec.md の `## Requirements` セクションに `### Feature: Something\n` が含まれる  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** `reason: "non-standard-requirement-header"` の violation が返る

---

### TC-043: 正常 — `## Requirements` セクションなし → violations なし

- **Priority**: must
- **Source**: tasks.md Task 5b ケース 4

**GIVEN** spec.md に `## Requirements` セクションが存在しない  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** violations リストが空である（`canonical-spec-structure` の責務）

---

### TC-044: 正常 — Requirements セクション内に h3 header なし → violations なし

- **Priority**: should
- **Source**: tasks.md Task 5b ケース 5

**GIVEN** spec.md の `## Requirements` セクションに `### ` で始まる行が存在しない  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** violations リストが空である（empty-section は別 rule の責務）

---

### TC-045: 混在 — `### Requirement:` と `### Other:` が混在 → `### Other:` のみ violation

- **Priority**: must
- **Source**: tasks.md Task 5b ケース 6

**GIVEN** spec.md の `## Requirements` に `### Requirement: Foo\n` と `### Other: Bar\n` が含まれる  
**WHEN** `requirementHeaderRequired.check(input)` を実行する  
**THEN** violation が 1 件返り、`### Other: Bar` に対してのみ報告される

---

## Category: RULE_SCENARIO — scenario-required-per-requirement rule

### TC-050: 正常 — 各 Requirement に Scenario あり → violations なし

- **Priority**: must
- **Source**: tasks.md Task 6b ケース 1

**GIVEN** spec.md の各 `### Requirement:` block に `#### Scenario:` が 1 件以上含まれる  
**WHEN** `scenarioRequiredPerRequirement.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-051: 違反 — Requirement に Scenario なし → violation

- **Priority**: must
- **Source**: tasks.md Task 6b ケース 2

**GIVEN** spec.md に `### Requirement: NoScenarioReq\nbody\n` が含まれ、`#### Scenario:` がない  
**WHEN** `scenarioRequiredPerRequirement.check(input)` を実行する  
**THEN** `reason: "missing-scenario"` の violation が返り、`suggested` に `Add at least one #### Scenario: block describing observable behavior` が含まれる

---

### TC-052: 違反 — 複数 Requirement のうち 1 件のみ Scenario なし → 1 violation

- **Priority**: must
- **Source**: tasks.md Task 6b ケース 3

**GIVEN** spec.md に 2 つの Requirement があり、1 件は Scenario あり、1 件は Scenario なし  
**WHEN** `scenarioRequiredPerRequirement.check(input)` を実行する  
**THEN** violations が正確に 1 件返り、Scenario なし Requirement のみ報告される

---

### TC-053: 正常 — `## Requirements` セクションなし → violations なし

- **Priority**: must
- **Source**: tasks.md Task 6b ケース 4

**GIVEN** spec.md に `## Requirements` セクションが存在しない  
**WHEN** `scenarioRequiredPerRequirement.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-054: edge — `#### Test:` 形式は Scenario として認識されない → violation

- **Priority**: should
- **Source**: tasks.md Task 6b ケース 5

**GIVEN** spec.md の Requirement block 内に `#### Test: something\n` があるが `#### Scenario:` がない  
**WHEN** `scenarioRequiredPerRequirement.check(input)` を実行する  
**THEN** `reason: "missing-scenario"` の violation が返る（`#### Scenario:` のみが valid）

---

## Category: RULE_NORMATIVE — normative-keyword-required rule

### TC-060: 正常 — body に `SHALL` あり → violations なし

- **Priority**: must
- **Source**: tasks.md Task 7b ケース 1

**GIVEN** Requirement body に `The system SHALL perform X.\n` が含まれる  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-061: 正常 — body に `MUST` あり → violations なし

- **Priority**: must
- **Source**: tasks.md Task 7b ケース 2

**GIVEN** Requirement body に `The system MUST validate Y.\n` が含まれる  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-062: 違反 — body に SHALL も MUST もなし → violation

- **Priority**: must
- **Source**: tasks.md Task 7b ケース 3

**GIVEN** Requirement body が `The system performs X.\n` のみ（SHALL/MUST なし）  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** `reason: "missing-normative-keyword"` の violation が返り、`suggested` に `Add SHALL or MUST in Requirement body to express normative intent` が含まれる

---

### TC-063: 違反 — header に `SHALL` があるが body にはない → violation

- **Priority**: must
- **Source**: tasks.md Task 7b ケース 5 / design.md Task 7 注意

**GIVEN** `### Requirement: System SHALL do X\n` (header に SHALL) + body が `This requirement covers X.\n` (body に SHALL なし)  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** `reason: "missing-normative-keyword"` の violation が返る（header は body ではない）

---

### TC-064: 正常 — header に `SHALL`、body にも `SHALL` あり → violations なし

- **Priority**: should
- **Source**: tasks.md Task 7b ケース 4

**GIVEN** `### Requirement: X\nThe system SHALL do X.\n` (header + body 両方に SHALL)  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-065: 正常 — `## Requirements` セクションなし → violations なし

- **Priority**: must
- **Source**: tasks.md Task 7b ケース 6

**GIVEN** spec.md に `## Requirements` セクションが存在しない  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** violations リストが空である

---

### TC-066: 正常 — body に `shall` (lowercase) があるが大文字 SHALL なし → violation

- **Priority**: should
- **Source**: request.md 要件 5 (英語の `SHALL` または `MUST`)

**GIVEN** Requirement body に `The system shall perform X.\n` が含まれる（小文字 shall）  
**WHEN** `normativeKeywordRequired.check(input)` を実行する  
**THEN** `reason: "missing-normative-keyword"` の violation が返る（大文字 SHALL/MUST のみ valid）

---

## Category: RULE_BASELINE — baseline-header-match rule

### TC-070: 正常 — delta header が baseline header と exact match → violations なし

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 1

**GIVEN** delta spec の Requirement header `### Requirement: Foo` が baseline の Requirement header と exact match する  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations リストが空である（MODIFIED 扱い）

---

### TC-071: 正常 — delta header が baseline に存在しない (ADDED) → violations なし

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 2 / request.md 要件 6

**GIVEN** delta spec の Requirement header が baseline のいずれのヘッダーとも一致せず、normalized match もしない  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations リストが空である（ADDED 扱い）

---

### TC-072: 正常 — baselineSpecLoader が undefined → violations なし

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 3 / design.md DJ1 / DJ3

**GIVEN** `input.baselineSpecLoader` が `undefined`  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations リストが空である（baseline 不在扱い、後方互換保証）

---

### TC-073: 正常 — baselineSpecLoader が null を返す (新規 capability) → violations なし

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 4 / design.md DJ3

**GIVEN** `input.baselineSpecLoader` が `async () => null` を返す（baseline spec.md が存在しない新規 capability）  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations リストが空である（全 Requirement を ADDED 扱い）

---

### TC-074: 違反 — delta header が baseline header と case 違い → violation

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 5 / design.md DJ7

**GIVEN** baseline header が `### Requirement: Foo Bar` で、delta header が `### Requirement: foo bar` (lowercase)  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** `reason: "baseline-header-mismatch"` の violation が返り、`suggested` に `Match baseline header exactly for MODIFIED, or treat as ADDED if new` が含まれる

---

### TC-075: 違反 — delta header の余分な whitespace → violation

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 6 / design.md DJ7

**GIVEN** baseline header が `### Requirement: Foo Bar` で、delta header が `### Requirement:  Foo  Bar` (余分スペース)  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** `reason: "baseline-header-mismatch"` の violation が返る（normalized match で検出）

---

### TC-076: 正常 — baseline に `## Requirements` がない → violations なし

- **Priority**: should
- **Source**: tasks.md Task 8b ケース 7

**GIVEN** baseline spec.md が `## Requirements` セクションを持たない  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations リストが空である（baseline headers が空リスト = 全 delta が ADDED）

---

### TC-077: 混合 — exact match + ADDED + case 違い → case 違いの 1 violation のみ

- **Priority**: must
- **Source**: tasks.md Task 8b ケース 8

**GIVEN** delta に 3 件の Requirement があり、1 件は exact match、1 件は baseline に存在しない (ADDED)、1 件は case 違い  
**WHEN** `baselineHeaderMatch.check(input)` を実行する  
**THEN** violations が正確に 1 件返り、case 違いの Requirement のみ報告される

---

## Category: REGISTRY — Registry 登録 + caller plumbing

### TC-080: createDeltaSpecRegistry が 9 rule を登録する

- **Priority**: must
- **Source**: tasks.md Task 9a / request.md 受け入れ基準

**GIVEN** `createDeltaSpecRegistry()` を呼び出す  
**WHEN** registry に登録された rule リストを参照する  
**THEN** 9 rule が登録されている（既存 3 + 新規 6）。`no-specs-for-required-type` は含まれない

---

### TC-081: validateDeltaSpecPaths が baselineSpecLoader を省略可能として受け付ける

- **Priority**: must
- **Source**: tasks.md Task 9b / design.md DJ1

**GIVEN** 既存の `validateDeltaSpecPaths(changePath, deps, requestType)` 呼び出し（引数 4 なし）  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが発生しない（default `async () => null` が適用される）

---

### TC-082: Step の実 baselineSpecLoader が specrunner/specs/<cap>/spec.md を読む

- **Priority**: must
- **Source**: tasks.md Task 9c

**GIVEN** `src/core/step/delta-spec-validation.ts` が `baselineSpecLoader` を inject している  
**WHEN** `baselineSpecLoader("delta-spec-rule")` を呼び出す  
**THEN** `specrunner/specs/delta-spec-rule/spec.md` の内容が返る（ファイルが存在する場合）

---

### TC-083: Step の実 baselineSpecLoader がファイル不在時に null を返す

- **Priority**: must
- **Source**: tasks.md Task 9c

**GIVEN** 指定 capability の spec.md が存在しない  
**WHEN** `baselineSpecLoader("<nonexistent>")` を呼び出す  
**THEN** `null` が返り、例外は発生しない

---

## Category: INTEGRATION — 統合・回帰テスト

### TC-090: bun run typecheck が全体で green

- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 11

**GIVEN** 全実装ファイルが揃った状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-091: bun run test が全体で green

- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 11

**GIVEN** 全 unit test ファイルが揃った状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS し、失敗が 0 件である

---

### TC-092: 既存 archive delta spec で新 rule が false positive を出さない (最低 3 件)

- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 11 検証 3

**GIVEN** 最近の archive folder から 3 件の delta spec (`specs/<cap>/spec.md`) をサンプリングした入力  
**WHEN** 6 つの新 rule それぞれの `check()` を実行する  
**THEN** 全 rule で violations が 0 件である（false positive なし）

---

### TC-093: delta spec `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md` が自己整合している

- **Priority**: must
- **Source**: tasks.md Task 10 / request.md 要件 10

**GIVEN** `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md` が存在する  
**WHEN** `validateDeltaSpecPaths` を change folder に対して実行する  
**THEN** violations が 0 件である（本変更自身の delta spec が新 rule に違反しない）

---

### TC-094: removed-section-format rule の violation に severity: "error" が設定されている

- **Priority**: must
- **Source**: request.md 要件 1 / design.md DJ6

**GIVEN** `## Removed` 違反が存在する spec.md  
**WHEN** `removedSectionFormat.check(input)` を実行する  
**THEN** 返る violation の `severity` が `"error"` である

---

### TC-095: 全 6 新 rule の violation severity が "error" である

- **Priority**: must
- **Source**: request.md 要件 1-6

**GIVEN** 各 rule の違反パターン入力  
**WHEN** 各 rule の `check(input)` を実行する  
**THEN** 全 violation の `severity` が `"error"` である

---

### TC-096: spec-content-parser の loadSpecFiles は複数 capability を正しく処理する

- **Priority**: should
- **Source**: design.md DJ5

**GIVEN** change folder 内に `specs/cap-a/spec.md` と `specs/cap-b/spec.md` が存在し、それぞれ異なる violations を持つ  
**WHEN** `removedSectionFormat.check(input)` (または他の rule) を実行する  
**THEN** 両方のファイルの violations が collected されて返る（片方だけでない）
