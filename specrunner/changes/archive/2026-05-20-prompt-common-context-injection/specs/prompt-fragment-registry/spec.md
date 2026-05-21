## Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される MUST。

`SPEC_RUNNER_COMMON_CONTEXT` は 4 層構成 (System context / 思想原則 / 責任範囲 / System facts) を含み、3 人称 / system 視点で記述される MUST。「あなたは」を含んではならない (MUST NOT)。

`AUTHORITY_SPEC_GUARD` は spec authority lifecycle の規律として「書く側の規律」「見る側の規律」セクションを含む MUST。このリファクタリングにより AUTHORITY_SPEC_GUARD は 4 セクション (MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律) から 2 セクション (書く側の規律 / 見る側の規律) に縮小する — 旧 MUST NOT / 正規経路 セクションは廃止する (MUST)。system-wide 禁止事項 (authority spec 直接編集禁止) は `SPEC_RUNNER_COMMON_CONTEXT` に移行したため、AUTHORITY_SPEC_GUARD は role-specific な書き手 / 見る側の手順に限定される MUST。

`DELTA_SPEC_FORMAT` は delta spec のフォーマットルール (セクションヘッダー / Requirement 形式 / Scenario 必須 / normative keyword) を含む MUST。ADDED / MODIFIED 分類の「agent がしない」原則と正規 path は `SPEC_RUNNER_COMMON_CONTEXT` に移行したため、DELTA_SPEC_FORMAT はフォーマット詳細に限定される MUST。旧形式セクションヘッダー (`## ADDED Requirements` 等) の使用禁止は引き続き明記する MUST。

#### Scenario: fragments.ts から 5 const を import できる

- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `SPEC_RUNNER_COMMON_CONTEXT`, `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` を import する
- THEN 5 つすべてが non-empty string として取得できる

#### Scenario: SPEC_RUNNER_COMMON_CONTEXT が 4 層を含む

- GIVEN `SPEC_RUNNER_COMMON_CONTEXT` を import する
- WHEN 内容を検査する
- THEN System context / 思想原則 / 責任範囲 / System facts の 4 層に相当するキーワードを含む

#### Scenario: SPEC_RUNNER_COMMON_CONTEXT が 3 人称で記述されている

- GIVEN `SPEC_RUNNER_COMMON_CONTEXT` を import する
- WHEN 内容を検査する
- THEN 「あなたは」を含まない

#### Scenario: AUTHORITY_SPEC_GUARD が role-specific セクションのみ含む

- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 内容を検査する
- THEN 「書く側の規律」「見る側の規律」を含み、「MUST NOT (全 agent 共通)」セクションを含まない

#### Scenario: DELTA_SPEC_FORMAT がフォーマット詳細のみ含む

- GIVEN `DELTA_SPEC_FORMAT` を import する
- WHEN 内容を検査する
- THEN `## Requirements` を含み、`ADDED / MODIFIED の分類は agent がしない` という冒頭文を含まない

### Requirement: Builder 純粋関数

prompt builder は `buildSystemPrompt(base: string, fragments: readonly string[]): string` の純粋関数として `src/prompts/builder.ts` で提供される MUST。`SPEC_RUNNER_COMMON_CONTEXT` を base の前に自動 prepend し、base と fragments を `\n\n` 区切りで連結する MUST。結果は `[SPEC_RUNNER_COMMON_CONTEXT, base, ...fragments].join("\n\n")` と等価である MUST。

registry / class / interface は含まない。

#### Scenario: builder が common context を自動 prepend する

- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", ["f1", "f2"])` を呼び出す
- THEN 戻り値が `SPEC_RUNNER_COMMON_CONTEXT + "\n\nbase\n\nf1\n\nf2"` と等しい

#### Scenario: fragments が空の場合は common context + base を返す

- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", [])` を呼び出す
- THEN 戻り値が `SPEC_RUNNER_COMMON_CONTEXT + "\n\nbase"` と等しい

#### Scenario: 戻り値が SPEC_RUNNER_COMMON_CONTEXT で始まる

- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN 任意の base と fragments で呼び出す
- THEN 戻り値が `SPEC_RUNNER_COMMON_CONTEXT` で始まる

### Requirement: System prompt の builder 経由構成

全 agent system prompt (対象: adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review / test-case-gen / request-generate / request-review) は `buildSystemPrompt(BASE, [...])` 経由で構成する MUST。

これにより全 agent prompt に `SPEC_RUNNER_COMMON_CONTEXT` が自動注入される。全 11 prompt の Scenario 網羅は `tests/unit/prompts/fragment-coverage.test.ts` の構造的検証 (全 11 prompt が `SPEC_RUNNER_COMMON_CONTEXT` を含む assertion) で代替する。個別 Scenario は代表 4 prompt (implementer / test-case-gen / request-generate / request-review) を明示し、残り 7 prompt は fragment-coverage assertion でカバーする。

#### Scenario: implementer-system が builder 経由で構成されている

- GIVEN implementer-system prompt が builder 経由で構成されている
- WHEN IMPLEMENTER_SYSTEM_PROMPT の内容を検査する
- THEN `SPEC_RUNNER_COMMON_CONTEXT` を substring として含む

#### Scenario: test-case-gen-system が builder 経由で構成されている

- GIVEN test-case-gen-system prompt が builder 経由で構成されている
- WHEN TEST_CASE_GEN_SYSTEM_PROMPT の内容を検査する
- THEN `SPEC_RUNNER_COMMON_CONTEXT` を substring として含む

#### Scenario: request-generate-system が builder 経由で構成されている

- GIVEN request-generate-system prompt が builder 経由で構成されている
- WHEN REQUEST_GENERATE_SYSTEM_PROMPT の内容を検査する
- THEN `SPEC_RUNNER_COMMON_CONTEXT` を substring として含む

#### Scenario: request-review-system が builder 経由で構成されている

- GIVEN request-review-system prompt が builder 経由で構成されている
- WHEN REQUEST_REVIEW_SYSTEM_PROMPT の内容を検査する
- THEN `SPEC_RUNNER_COMMON_CONTEXT` を substring として含む

### Requirement: Inject 漏れの構造的検出

fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される MUST。11 prompt の必須 fragment 対応表を `test.each` で assert し、列挙忘れがあれば test が失敗する MUST。

全 11 prompt に `SPEC_RUNNER_COMMON_CONTEXT` が含まれていることを専用の assertion で検証する MUST。この検証は `buildSystemPrompt` の自動 prepend 機構の構造的保証として機能する。

#### Scenario: 対応表が 11 prompt を網羅する

- GIVEN fragment-coverage.test.ts に prompt の必須 fragment 対応表がある
- WHEN 対応表のエントリ数を確認する
- THEN 11 prompt 分のエントリが存在する

#### Scenario: 全 prompt に SPEC_RUNNER_COMMON_CONTEXT が含まれる

- GIVEN 全 11 agent system prompt を取得する
- WHEN 各 prompt に対して `SPEC_RUNNER_COMMON_CONTEXT` の substring 存在を確認する
- THEN 全 11 prompt が `SPEC_RUNNER_COMMON_CONTEXT` を含む

### Requirement: 依存方向の片方向制約

fragment 側に inject 先 (= step 名 / prompt 名) を持たせない。依存方向は prompt → fragment の片方向とする MUST。fragment は content (= string) のみが責務であり、`applicableTo` / `category` 等の metadata を持たない MUST。

`SPEC_RUNNER_COMMON_CONTEXT` も同様に plain string として export され、inject 先情報を持たない MUST。

#### Scenario: fragments.ts が inject 先情報を持たない

- GIVEN `src/prompts/fragments.ts` の export を検査する
- WHEN export された値の型を確認する
- THEN すべて `string` 型であり、inject 先を示す metadata property は存在しない
