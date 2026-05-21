# Tasks: vitest-e2e-category-removal

## Task 1: [x] prompt から e2e category を削除

**File**: `src/prompts/test-case-gen-system.ts`

`TEST_CASE_GEN_SYSTEM_PROMPT` 内の 3 箇所を編集する。

### 1a: Category 列挙 (L29)

```
// before:
**Category**: unit | integration | e2e | manual

// after:
**Category**: unit | integration | manual
```

### 1b: Category Determination テーブル (L43)

e2e 行を削除する:

```
// 削除対象行:
| e2e | Screen operations, full user flows | Yes (env-dependent) |
```

### 1c: Summary セクション Automated 集計 (L77)

```
// before:
- **Automated** (unit/integration/e2e): {count}

// after:
- **Automated** (unit/integration): {count}
```

### 受け入れ基準

- `TEST_CASE_GEN_SYSTEM_PROMPT` 内に文字列 `e2e` が存在しない
- `unit | integration | manual` の 3 種 category が列挙されている

## Task 2: [x] LLM 経路規律を Constraints セクションに追加

**File**: `src/prompts/test-case-gen-system.ts`

Constraints セクション (L135-140) の末尾、最後の bullet の後に以下を追加:

```
- LLM calls, real external API calls, and real GitHub repository dependencies MUST NOT be
  expressed as vitest test cases. These scenarios are verified through dogfood runs
  (actual \`specrunner run\` executions).
```

### 受け入れ基準

- prompt 内に上記規律が含まれている
- 既存 Constraints の bullet リストのフォーマットを維持している

## Task 3: [x] prompt test を新規作成

**File**: `tests/prompts/test-case-gen-system.test.ts` (新規)

`TEST_CASE_GEN_SYSTEM_PROMPT` を import し、以下 3 TC を実装する:

### TC-CATG-01: prompt 内に `e2e` 文字列が含まれない

```ts
import { describe, it, expect } from "vitest";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../src/prompts/test-case-gen-system.js";

describe("TC-CATG-01: e2e category is removed from prompt", () => {
  it("does not contain 'e2e' anywhere in the system prompt", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("e2e");
  });
});
```

### TC-CATG-02: prompt 内に 3 種 category が明示されている

```ts
describe("TC-CATG-02: three categories are present", () => {
  it("contains 'unit | integration | manual' category listing", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("unit | integration | manual");
  });
});
```

### TC-CATG-03: LLM 経路規律が明示されている

```ts
describe("TC-CATG-03: LLM/API exclusion rule is present", () => {
  it("contains dogfood verification rule for LLM calls", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("MUST NOT be");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("dogfood");
  });
});
```

### 受け入れ基準

- 3 TC が全て pass する
- import パスが `../../src/prompts/test-case-gen-system.js` である

## Task 4: [x] delta spec 作成

**File**: `specrunner/changes/vitest-e2e-category-removal/specs/test-case-generator/spec.md` (新規)

新規 capability `test-case-generator` を `## ADDED Requirements` で起票する。内容は本 change folder 内の同ファイルに記載済み。

### 受け入れ基準

- `## ADDED Requirements` セクションが存在する
- category 体系の Requirement が記述されている
- LLM 経路規律の Requirement が記述されている
- Scenario が各 Requirement に対して記述されている

## 検証

全 Task 完了後:

```bash
bun run typecheck && bun run test
```
