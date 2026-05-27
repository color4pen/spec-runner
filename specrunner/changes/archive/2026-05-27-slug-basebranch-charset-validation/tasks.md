# Tasks: slug-basebranch-charset-validation

## T-01: 共有定数ファイル `src/util/validation-patterns.ts` を作成

**File**: `src/util/validation-patterns.ts` (新規)

2 つの正規表現を export する:

```typescript
/** Slug format: lowercase alphanumeric + hyphens, 1-64 chars, must start with alphanumeric. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Base branch format: alphanumeric, dots, underscores, slashes, hyphens. No leading dash. */
export const BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;
```

`BASE_BRANCH_REGEX` は先頭文字に `-` を許容しない (git option injection 防止)。2 文字目以降は `-` を許容する。

**Acceptance**:
- [x] `SLUG_REGEX` が `/^[a-z0-9][a-z0-9-]{0,63}$/` と一致
- [x] `BASE_BRANCH_REGEX` が先頭 `-` を reject し、`main`, `release/v1.0`, `feature/foo-bar`, `origin/main` を accept
- [x] `bun run typecheck` が green

---

## T-02: `slug-required.ts` に charset validation を追加

**File**: `src/parser/rules/slug-required.ts`

存在チェック通過後に `SLUG_REGEX` による charset 検証を追加する。`SLUG_REGEX` は `src/util/validation-patterns.ts` から import する。

```typescript
import { SLUG_REGEX } from "../../util/validation-patterns.js";

// 既存の null/empty check の後に追加:
if (!SLUG_REGEX.test(input.slug)) {
  return [
    {
      rule: "slug-required",
      severity: "error",
      message: `invalid slug '${input.slug}' in ${input.filePath}. Must match /^[a-z0-9][a-z0-9-]{0,63}$/`,
      field: "slug",
    },
  ];
}
```

**Acceptance**:
- [x] `slug: "../etc/passwd"` が error violation を返す
- [x] `slug: "--upload-pack=evil"` が error violation を返す
- [x] `slug: "UPPERCASE"` が error violation を返す
- [x] `slug: "valid-slug"` が `[]` を返す (既存挙動維持)
- [x] `slug: null` が既存の missing error を返す (既存挙動維持)
- [x] `bun run typecheck` が green

---

## T-03: `base-branch-required.ts` に charset validation を追加

**File**: `src/parser/rules/base-branch-required.ts`

存在チェック通過後に `BASE_BRANCH_REGEX` による charset 検証を追加する。`BASE_BRANCH_REGEX` は `src/util/validation-patterns.ts` から import する。

```typescript
import { BASE_BRANCH_REGEX } from "../../util/validation-patterns.js";

// 既存の null/empty check の後に追加:
if (!BASE_BRANCH_REGEX.test(input.baseBranch)) {
  return [
    {
      rule: "base-branch-required",
      severity: "error",
      message: `invalid base-branch '${input.baseBranch}' in ${input.filePath}. Must match /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/`,
      field: "baseBranch",
    },
  ];
}
```

**Acceptance**:
- [x] `baseBranch: "--upload-pack=evil"` が error violation を返す
- [x] `baseBranch: "main; rm -rf /"` が error violation を返す
- [x] `baseBranch: "main"` が `[]` を返す (既存挙動維持)
- [x] `baseBranch: "release/v1.0"` が `[]` を返す
- [x] `baseBranch: "feature/foo-bar"` が `[]` を返す
- [x] `baseBranch: null` が既存の missing error を返す (既存挙動維持)
- [x] `bun run typecheck` が green

---

## T-04: `request-new.ts` の SLUG_REGEX を共有定数に置換

**File**: `src/core/command/request-new.ts`

L12 の `const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;` を削除し、`src/util/validation-patterns.ts` から import する。

```typescript
import { SLUG_REGEX } from "../../util/validation-patterns.js";
```

**Acceptance**:
- [x] ローカル定義の SLUG_REGEX が削除されている
- [x] import 先が `../../util/validation-patterns.js`
- [x] `bun run typecheck` が green

---

## T-05: `rules-new.ts` の SLUG_REGEX を共有定数に置換

**File**: `src/core/command/rules-new.ts`

L12 の `const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;` を削除し、`src/util/validation-patterns.ts` から import する。

```typescript
import { SLUG_REGEX } from "../../util/validation-patterns.js";
```

**Acceptance**:
- [x] ローカル定義の SLUG_REGEX が削除されている
- [x] import 先が `../../util/validation-patterns.js`
- [x] `bun run typecheck` が green

---

## T-06: `command-registry.ts` の SLUG_REGEX を共有定数に置換

**File**: `src/cli/command-registry.ts`

L39 の `const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;` を削除し、`src/util/validation-patterns.ts` から import する。

```typescript
import { SLUG_REGEX } from "../util/validation-patterns.js";
```

**Acceptance**:
- [x] ローカル定義の SLUG_REGEX が削除されている
- [x] import 先が `../util/validation-patterns.js`
- [x] 既存の SLUG_REGEX 参照箇所 (L261, L287, L302) が動作する
- [x] `bun run typecheck` が green

---

## T-07: テスト — `slug-required` charset validation

**File**: `tests/unit/parser/rules/slug-required.test.ts` (既存に追加)

テストケース追加:
- `slug: "../etc/passwd"` → error violation (path traversal)
- `slug: "--upload-pack=evil"` → error violation (option injection)
- `slug: "UPPERCASE"` → error violation (case mismatch)
- `slug: "a b c"` → error violation (spaces)
- `slug: "valid-slug-123"` → `[]` (正常)
- `slug: "a"` → `[]` (最短有効)

**Acceptance**:
- [x] 全テストケースが green
- [x] 既存テストが修正なしで green
- [x] `bun run test` が green

---

## T-08: テスト — `base-branch-required` charset validation

**File**: `tests/unit/parser/rules/base-branch-required.test.ts` (既存に追加)

テストケース追加:
- `baseBranch: "--upload-pack=evil"` → error violation (git option injection)
- `baseBranch: "-flag"` → error violation (leading dash)
- `baseBranch: "main; rm -rf /"` → error violation (shell metachar)
- `baseBranch: "branch name"` → error violation (space)
- `baseBranch: "main"` → `[]` (正常)
- `baseBranch: "release/v1.0"` → `[]` (slash + dot)
- `baseBranch: "feature/foo-bar"` → `[]` (slash + hyphen)
- `baseBranch: "my_branch"` → `[]` (underscore)

**Acceptance**:
- [x] 全テストケースが green
- [x] 既存テストが修正なしで green
- [x] `bun run test` が green

---

## T-09: 全体検証

**Command**: `bun run typecheck && bun run test`

**Acceptance**:
- [x] typecheck green
- [x] test green (既存の pre-existing failure `CodeFixerStep.requiresCommit` を除く)
- [x] `grep -rn "SLUG_REGEX" src/` で共有定数と import のみ (ローカル定義 0 件)
- [x] 既存テストが無修正で green

---

## Task Dependencies

```
T-01 ─┬→ T-02 ─┐
      ├→ T-03 ─┤
      ├→ T-04 ─┤
      ├→ T-05 ─┤
      └→ T-06 ─┤
               ├→ T-07 ─┐
               ├→ T-08 ─┤
               └────────→ T-09
```

T-01 は全タスクの前提 (共有定数)。T-02〜T-06 は T-01 に依存し並列可能。T-07〜T-08 は対応する実装タスクに依存。T-09 は全タスクに依存。
