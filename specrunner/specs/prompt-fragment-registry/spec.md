## Purpose

TBD
## Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`COMMIT_DISCIPLINE` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される MUST。

`SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` は `specrunner/rules.md` に移行済みのため fragments.ts から削除する MUST。fragments.ts は `COMMIT_DISCIPLINE` と `PIPELINE_RULES` の 2 export のみを含む MUST。

#### Scenario: fragments.ts から 2 const を import できる

- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `COMMIT_DISCIPLINE`, `PIPELINE_RULES` を import する
- THEN 2 つすべてが non-empty string として取得できる

#### Scenario: 旧 fragment が fragments.ts に存在しない

- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN export 一覧を確認する
- THEN `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` は存在しない

### Requirement: Builder 純粋関数

prompt builder は `buildSystemPrompt(base: string, fragments: readonly string[]): string` の純粋関数として `src/prompts/builder.ts` で提供される MUST。base と fragments を `\n\n` 区切りで連結する MUST。結果は `[base, ...fragments].join("\n\n")` と等価である MUST。

`SPEC_RUNNER_COMMON_CONTEXT` の自動 prepend は廃止する MUST。builder.ts は fragments.ts を import しない MUST。

registry / class / interface は含まない。

#### Scenario: builder が base + fragments を連結する

- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", ["f1", "f2"])` を呼び出す
- THEN 戻り値が `"base\n\nf1\n\nf2"` と等しい

#### Scenario: fragments が空の場合は base のみを返す

- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", [])` を呼び出す
- THEN 戻り値が `"base"` と等しい

### Requirement: System prompt の builder 経由構成

全 agent system prompt (対象: adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review / test-case-gen / request-generate / request-review) は `buildSystemPrompt(BASE, [...])` 経由で構成する MUST。

各 agent の BASE 文字列の冒頭に identity priming + rules.md Read 指示の定型句を含む MUST。定型句は `specrunner/changes/<slug>/rules.md` への Read 指示を含む MUST。

#### Scenario: implementer-system が rules.md Read 指示を含む

- GIVEN implementer-system prompt が builder 経由で構成されている
- WHEN IMPLEMENTER_SYSTEM_PROMPT の内容を検査する
- THEN `specrunner/changes/<slug>/rules.md` への Read 指示を substring として含む

#### Scenario: design-system が rules.md Read 指示を含む

- GIVEN design-system prompt が builder 経由で構成されている
- WHEN DESIGN_SYSTEM_PROMPT の内容を検査する
- THEN `specrunner/changes/<slug>/rules.md` への Read 指示を substring として含む

#### Scenario: adr-gen-system が rules.md Read 指示を含む

- GIVEN adr-gen-system prompt が builder 経由で構成されている
- WHEN ADR_GEN_SYSTEM_PROMPT の内容を検査する
- THEN `specrunner/changes/<slug>/rules.md` への Read 指示を substring として含む

#### Scenario: 全 11 prompt が rules.md Read 指示を含む

- GIVEN 全 11 agent system prompt を取得する
- WHEN 各 prompt に対して rules.md Read 指示の substring 存在を確認する
- THEN 全 11 prompt が Read 指示を含む

### Requirement: Inject 漏れの構造的検出

fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される MUST。11 prompt の必須 fragment 対応表を `test.each` で assert し、列挙忘れがあれば test が失敗する MUST。

rules.md Read 指示の全 agent 含有は `tests/unit/prompts/common-context-catch.test.ts` または `tests/unit/rules-md.test.ts` で構造的に検証する MUST。

#### Scenario: 対応表が 11 prompt を網羅する

- GIVEN fragment-coverage.test.ts に prompt の必須 fragment 対応表がある
- WHEN 対応表のエントリ数を確認する
- THEN 11 prompt 分のエントリが存在する

#### Scenario: 全 prompt に rules.md Read 指示が含まれる

- GIVEN 全 11 agent system prompt を取得する
- WHEN 各 prompt に対して `specrunner/changes/<slug>/rules.md` の substring 存在を確認する
- THEN 全 11 prompt が Read 指示を含む

### Requirement: 依存方向の片方向制約

fragment 側に inject 先 (= step 名 / prompt 名) を持たせない。依存方向は prompt → fragment の片方向とする MUST。fragment は content (= string) のみが責務であり、`applicableTo` / `category` 等の metadata を持たない MUST。

#### Scenario: fragments.ts が inject 先情報を持たない

- GIVEN `src/prompts/fragments.ts` の export を検査する
- WHEN export された値の型を確認する
- THEN すべて `string` 型であり、inject 先を示す metadata property は存在しない

### Requirement: rules.md の存在と構造的保証

rules.md content の source of truth は `src/prompts/rules.ts` の `RULES_MD_CONTENT` string constant である MUST。CLI は worktree setup 時に `RULES_MD_CONTENT` を `fs.writeFile` で `specrunner/changes/<slug>/rules.md` に配置する MUST。

`specrunner/rules.md` ファイルは repo に存在しない MUST（source of truth は CLI コードに一本化）。

rules.md content はパイプライン規律として以下のセクションを含む MUST:

- System Context（pipeline 構成）
- 思想原則
- 責任範囲（step × 領域テーブル）
- System Facts（正規 path 一覧）
- ADR 配置の特記（業界慣習 MADR 不採用の明示）
- spec authority lifecycle
- delta spec 記法

#### Scenario: rules.md content が ADR 配置規律を含む

- GIVEN `RULES_MD_CONTENT` が `src/prompts/rules.ts` から export されている
- WHEN 内容を検査する
- THEN 「ADR 配置の特記」セクションが存在し、「業界慣習 MADR」「採用しない」「adr-gen 以外」のキーワードを含む

#### Scenario: rules.md content が正規 ADR path を含む

- GIVEN `RULES_MD_CONTENT` が `src/prompts/rules.ts` から export されている
- WHEN 内容を検査する
- THEN `specrunner/adr/` を含む正規 path 文字列が存在する
