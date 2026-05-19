## MODIFIED Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される。個別 fragment file (`authority-spec-guard.ts` / `commit-discipline.ts` / `delta-spec-format.ts` / `pipeline-rules.ts`) は存在しない。

`AUTHORITY_SPEC_GUARD` は spec authority lifecycle の統一規律として 4 セクション (MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律) を含み、書く側 (implementer / design / spec-fixer / code-fixer) と見る側 (spec-review / code-review) の両方に共通の規律を提供する MUST。

#### Scenario: fragments.ts から 4 const を import できる
- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` を import する
- THEN 4 つすべてが non-empty string として取得できる

#### Scenario: AUTHORITY_SPEC_GUARD が 4 セクションを含む
- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 内容を検査する
- THEN "MUST NOT" / "正規経路" / "書く側の規律" / "見る側の規律" の 4 セクションヘッダーを含む

### Requirement: Inject 漏れの構造的検出

fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される。8 prompt の必須 fragment 対応表を `test.each` で assert し、列挙忘れがあれば test が失敗する MUST。

対応表は以下を満たす MUST:
- `SPEC_REVIEW` の必須 fragment に `PIPELINE_RULES` と `AUTHORITY_SPEC_GUARD` を含む
- `CODE_REVIEW` の必須 fragment に `PIPELINE_RULES` と `AUTHORITY_SPEC_GUARD` を含む

#### Scenario: 対応表の assert が漏れを検出する
- GIVEN fragment-coverage.test.ts に 8 prompt の必須 fragment 対応表がある
- WHEN いずれかの prompt の array から必須 fragment が欠落している
- THEN 該当する test case が失敗する

#### Scenario: reviewer 系 prompt に AUTHORITY_SPEC_GUARD が必須化されている
- GIVEN fragment-coverage.test.ts の EXPECTED 配列を検査する
- WHEN SPEC_REVIEW と CODE_REVIEW の必須 fragment を確認する
- THEN 両方に `PIPELINE_RULES` と `AUTHORITY_SPEC_GUARD` が含まれている

### Requirement: System prompt の builder 経由構成

各 system prompt (対象: adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review) は自身が必要とする fragment を array literal で列挙し、`buildSystemPrompt(BASE, [...])` 経由で構成する MUST。

spec-review と code-review の fragments array には `AUTHORITY_SPEC_GUARD` が含まれる MUST。

#### Scenario: implementer-system が 3 fragment を含む
- GIVEN implementer-system prompt が builder 経由で構成されている
- WHEN IMPLEMENTER_SYSTEM_PROMPT の内容を検査する
- THEN `DELTA_SPEC_FORMAT`, `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE` の 3 fragment が含まれている

#### Scenario: spec-review-system が PIPELINE_RULES と AUTHORITY_SPEC_GUARD を含む
- GIVEN spec-review-system prompt が builder 経由で構成されている
- WHEN SPEC_REVIEW_SYSTEM_PROMPT の内容を検査する
- THEN `PIPELINE_RULES` と `AUTHORITY_SPEC_GUARD` の 2 fragment が含まれている

#### Scenario: code-review-system が PIPELINE_RULES と AUTHORITY_SPEC_GUARD を含む
- GIVEN code-review-system prompt が builder 経由で構成されている
- WHEN CODE_REVIEW_SYSTEM_PROMPT の内容を検査する
- THEN `PIPELINE_RULES` と `AUTHORITY_SPEC_GUARD` の 2 fragment が含まれている
