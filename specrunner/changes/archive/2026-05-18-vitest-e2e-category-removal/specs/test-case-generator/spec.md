# test-case-generator Delta Spec

## ADDED Requirements

### Requirement: test category は unit / integration / manual の 3 種のみ

test-case-gen step が生成する test-cases.md の Category フィールドは `unit` / `integration` / `manual` の 3 種のみを許容する。`e2e` は category として生成してはならない。

Summary セクションの Automated 集計は `unit` + `integration` の合計とし、`e2e` を含めない。

#### Scenario: test-case-gen が e2e を category として出力 → 違反

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** いずれかの test case の Category に `e2e` が指定されている
- **THEN** prompt の category 体系に違反している

#### Scenario: test-case-gen が unit / integration / manual のみを出力 → 準拠

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 全ての test case の Category が `unit` / `integration` / `manual` のいずれかである
- **THEN** prompt の category 体系に準拠している

### Requirement: LLM 呼び出し / 実 API / 実 GitHub repo 依存の scenario は vitest test として表現しない

LLM 呼び出し、実外部 API 呼び出し、実 GitHub repository に依存する scenario は vitest test case として表現してはならない。これらの scenario は dogfood run (実 `specrunner run` 実行) で検証する。

LLM を mock して vitest 内で動かす形式は integration test と等価であり、e2e の追加価値を持たない。

#### Scenario: LLM mock を前提とする scenario を vitest test case として列挙 → 違反

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** LLM 呼び出しを mock して vitest 内で実行する scenario が Category `unit` または `integration` として列挙されている
- **AND** その scenario の本来の目的が「LLM 経路を含む end-to-end の動作確認」である
- **THEN** prompt の LLM 経路規律に違反している (= dogfood で verify すべき)

#### Scenario: LLM 非依存の unit / integration test → 準拠

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** test case が純粋なロジック・バリデーション・モジュール間結合のみを検証する
- **AND** LLM 呼び出し / 実 API / 実 GitHub repo に依存しない
- **THEN** vitest test case として表現することは準拠している
