# Capability: prompt-fragment-registry

## Purpose

shared prompt fragment を `src/prompts/fragments.ts` に string const として集約 export し、各 system prompt が必要 fragment を array literal で列挙して `buildSystemPrompt` 経由で構成する形に揃える。inject 漏れは test 側の対応表で構造的に検出する。

## ADDED Requirements

### Requirement: Fragment 集約 export

shared prompt fragment (`AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES`) は `src/prompts/fragments.ts` に string const として集約 export される。個別 fragment file (`authority-spec-guard.ts` / `commit-discipline.ts` / `delta-spec-format.ts` / `pipeline-rules.ts`) は存在しない。

**Scenario**: fragments.ts から 4 const を import できる
- GIVEN `src/prompts/fragments.ts` が存在する
- WHEN `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` を import する
- THEN 4 つすべてが non-empty string として取得できる

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

各 system prompt (対象: adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review) は自身が必要とする fragment を array literal で列挙し、`buildSystemPrompt(BASE, [...])` 経由で構成する。

**Scenario**: implementer-system が 3 fragment を含む
- GIVEN implementer-system prompt が builder 経由で構成されている
- WHEN IMPLEMENTER_SYSTEM_PROMPT の内容を検査する
- THEN `DELTA_SPEC_FORMAT`, `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE` の 3 fragment が含まれている

### Requirement: Inject 漏れの構造的検出

fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される。8 prompt の必須 fragment 対応表を `test.each` で assert し、列挙忘れがあれば test が失敗する。

**Scenario**: 対応表の assert が漏れを検出する
- GIVEN fragment-coverage.test.ts に 8 prompt の必須 fragment 対応表がある
- WHEN いずれかの prompt の array から必須 fragment が欠落している
- THEN 該当する test case が失敗する

### Requirement: 依存方向の片方向制約

fragment 側に inject 先 (= step 名 / prompt 名) を持たせない。依存方向は prompt → fragment の片方向とする。fragment は content (= string) のみが責務であり、`applicableTo` / `category` 等の metadata を持たない。

**Scenario**: fragments.ts が inject 先情報を持たない
- GIVEN `src/prompts/fragments.ts` の export を検査する
- WHEN export された値の型を確認する
- THEN すべて `string` 型であり、inject 先を示す metadata property は存在しない
