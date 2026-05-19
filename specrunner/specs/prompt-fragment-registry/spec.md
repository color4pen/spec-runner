## Purpose

TBD
## Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される。個別 fragment file (`authority-spec-guard.ts` / `commit-discipline.ts` / `delta-spec-format.ts` / `pipeline-rules.ts`) は存在しない。

`AUTHORITY_SPEC_GUARD` は spec authority lifecycle の統一規律として 4 セクション (MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律) を含み、書く側 (implementer / design / spec-fixer / code-fixer) と見る側 (spec-review / code-review) の両方に共通の規律を提供する MUST。

`DELTA_SPEC_FORMAT` は新形式のセクションヘッダー (`## Requirements` / `## Removed` / `## Renamed`) を説明し、ADDED / MODIFIED の分類は tool が baseline 突合で決定する旨を明示する MUST。旧形式セクションヘッダー (`## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements`) の使用禁止を明記する MUST。

`AUTHORITY_SPEC_GUARD` の「書く側の規律」節は、`## Requirements` に変更/追加したい Requirement を書く指示と、ADDED / MODIFIED の判断は tool が行う旨を記載する MUST。`## Removed` / `## Renamed` の用途説明は維持する MUST。

#### Scenario: fragments.ts から 4 const を import できる
- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` を import する
- THEN 4 つすべてが non-empty string として取得できる

#### Scenario: AUTHORITY_SPEC_GUARD が 4 セクションを含む
- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 内容を検査する
- THEN "MUST NOT" / "正規経路" / "書く側の規律" / "見る側の規律" の 4 セクションヘッダーを含む

#### Scenario: DELTA_SPEC_FORMAT が新形式を説明する
- GIVEN `DELTA_SPEC_FORMAT` を import する
- WHEN 内容を検査する
- THEN `## Requirements` を含み、`## ADDED Requirements` を含まない

#### Scenario: AUTHORITY_SPEC_GUARD が旧形式の分類基準を含まない
- GIVEN `AUTHORITY_SPEC_GUARD` を import する
- WHEN 「書く側の規律」節を検査する
- THEN 旧形式の分類基準 (`**ADDED**: baseline に存在しない` / `**MODIFIED**: baseline に存在する`) を含まず、tool が分類する旨を記載している

### Requirement: Builder 純粋関数

prompt builder は `buildSystemPrompt(base: string, fragments: readonly string[]): string` の純粋関数として `src/prompts/builder.ts` で提供される。base と fragments を `\n\n` 区切りで連結する。registry / class / interface は含まない。

**Scenario**: builder が base と fragments を連結する
- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", ["f1", "f2"])` を呼び出す
- THEN `"base\n\nf1\n\nf2"` が返される

**Scenario**: fragments が空の場合は base のみ返す
- GIVEN `buildSystemPrompt` 関数が存在する
- WHEN `buildSystemPrompt("base", [])` を呼び出す
- THEN `"base"` が返される

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

### Requirement: 依存方向の片方向制約

fragment 側に inject 先 (= step 名 / prompt 名) を持たせない。依存方向は prompt → fragment の片方向とする。fragment は content (= string) のみが責務であり、`applicableTo` / `category` 等の metadata を持たない。

**Scenario**: fragments.ts が inject 先情報を持たない
- GIVEN `src/prompts/fragments.ts` の export を検査する
- WHEN export された値の型を確認する
- THEN すべて `string` 型であり、inject 先を示す metadata property は存在しない
