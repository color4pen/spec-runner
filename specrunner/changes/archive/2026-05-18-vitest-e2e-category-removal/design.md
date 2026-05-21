# Design: vitest-e2e-category-removal

## 概要

`src/prompts/test-case-gen-system.ts` から `e2e` category を削除し、test category 体系を `unit | integration | manual` の 3 種に整理する。同時に「LLM 経路 / 実 API は vitest で書かない」規律を prompt に明文化する。新規 capability `test-case-generator` を delta spec として起票し、spec authority でも category 体系を固定する。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/prompts/test-case-gen-system.ts` | L29 / L43-44 / L77 の `e2e` 言及を削除、Constraints セクションに LLM 経路規律を追加 |
| `tests/prompts/test-case-gen-system.test.ts` | 新規作成。TC-CATG-01 / TC-CATG-02 / TC-CATG-03 の 3 TC |
| `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` | 新規 capability delta spec (ADDED Requirements) |

## 設計詳細

### 1. prompt の e2e 削除

`TEST_CASE_GEN_SYSTEM_PROMPT` 内の 3 箇所を編集する。

#### 1a: L29 Category 列挙

```
// before:
**Category**: unit | integration | e2e | manual

// after:
**Category**: unit | integration | manual
```

#### 1b: L43-44 Category Determination テーブルの e2e 行

```
// before:
| unit | Pure logic, validation, helper functions | Yes |
| integration | DB operations, API endpoints, multi-module interaction | Yes |
| e2e | Screen operations, full user flows | Yes (env-dependent) |
| manual | UI/UX confirmation, visual verification, build artifact verification | No |

// after:
| unit | Pure logic, validation, helper functions | Yes |
| integration | DB operations, API endpoints, multi-module interaction | Yes |
| manual | UI/UX confirmation, visual verification, build artifact verification | No |
```

#### 1c: L77 Summary セクションの Automated 集計

```
// before:
- **Automated** (unit/integration/e2e): {count}

// after:
- **Automated** (unit/integration): {count}
```

### 2. LLM 経路規律の追加

Constraints セクション (L135-140) の末尾に以下の規律を追加する:

```
- LLM calls, real external API calls, and real GitHub repository dependencies MUST NOT be
  expressed as vitest test cases. These scenarios are verified through dogfood runs
  (actual `specrunner run` executions).
```

既存 Constraints の bullet リストに 1 行追加する形式。Constraints セクション内に新たなサブヘッダーは作らない。

### 3. test ファイル

`tests/prompts/test-case-gen-system.test.ts` を新規作成する。既存の prompt test (e.g. `tests/prompts/spec-review-system.test.ts`) と同じパターンに従い、`TEST_CASE_GEN_SYSTEM_PROMPT` を import して文字列検証する。

テストは prompt 文字列に対する `toContain` / `not.toContain` アサーションのみで構成する。prompt の export 名は `TEST_CASE_GEN_SYSTEM_PROMPT`。

### 4. delta spec

新規 capability `test-case-generator` を `## ADDED Requirements` で起票する。finish 時に spec-merge が `specrunner/specs/test-case-generator/spec.md` を新規作成する。baseline は本 PR で直接作成しない。

## 影響範囲

- prompt 変更は test-case-gen step の LLM 入力のみに影響する
- pipeline 構成・step 遷移・他 step の prompt には影響しない
- 既存 test (unit / integration) の挙動には影響しない
- archived test-cases.md には触れない
