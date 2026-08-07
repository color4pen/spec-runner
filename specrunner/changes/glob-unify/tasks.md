# Tasks: glob-unify

## T-01: `matchesGlob` を `globMatch` への委譲に置き換え、注記コメントを削除する

対象: `src/util/glob-match.ts`

- [x] L71-79（`// ---` 区切り・注記コメントブロック「2 実装は独立・統一はスコープ外」）を削除する
- [x] `matchesGlob` の独立実装（`while` ループ・`regex` 変数・`new RegExp(...)` 呼び出し）を `return globMatch(filePath, pattern);` 1 行に置き換える
- [x] `matchesGlob` の JSDoc コメントから `?` 非対応の記述（「No brace expansion, "?", or character-class support」）を削除し、`globMatch` への委譲であることを記述する

**Acceptance Criteria**:
- `src/util/glob-match.ts` に `function matchesGlob` が 1 件存在する（grep count = 1）
- `matchesGlob` の本体が `return globMatch(filePath, pattern);` のみである
- 注記コメントブロックが存在しない
- `bun run typecheck` が通る

---

## T-02: `src/core/reviewers/glob-match.ts` を削除する

- [x] `src/core/reviewers/glob-match.ts` を削除する

**Acceptance Criteria**:
- `src/core/reviewers/glob-match.ts` が存在しない

---

## T-03: `matchGlob` 消費者 3 ファイルを `globMatch` に repoint する（引数順入れ替え）

import パスはいずれも `../../util/glob-match.js`（3 ファイルとも `src/core/<subdir>/` に位置するため同一）。

**`src/core/pipeline/scope.ts`**:
- [x] L16 の import を `import { globMatch } from '../../util/glob-match.js';` に変更する
- [x] L67 の `matchGlob(pattern, file)` → `globMatch(file, pattern)` に変更する

**`src/core/reviewers/activation.ts`**:
- [x] L11 の import を `import { globMatch } from '../../util/glob-match.js';` に変更する
- [x] L87 の `matchGlob(pattern, file)` → `globMatch(file, pattern)` に変更する

**`src/core/step/main-checkout-guard.ts`**:
- [x] L17 の import を `import { globMatch } from '../../util/glob-match.js';` に変更する
- [x] L76 の `matchGlob(g, filePath)` → `globMatch(filePath, g)` に変更する
- [x] L12 の doc comment 内 `step → reviewers: matchGlob` を `step → util: globMatch` に更新する

**Acceptance Criteria**:
- `src/` および `tests/` を `\bmatchGlob\b` でgrep して 0 件
- 3 ファイルの `globMatch` 呼び出しが `(file, pattern)` 順（file が第 1 引数）
- `bun run typecheck` が通る

---

## T-04: テストを整理し、意味論固定テストを追加する

- [x] `src/core/reviewers/__tests__/glob-match.test.ts` を削除する
- [x] `tests/unit/util/glob-match.test.ts` に以下のテストを追加する:

  **`matchesGlob` 委譲テスト（`matchesGlob` が `globMatch` と同動作）**:
  - `matchesGlob("src/foox.ts", "src/foo?.ts")` → `true`（`?` が wildcard として動く）
  - `matchesGlob("src/foo.ts", "src/foo?.ts")` → `false`（`?` はゼロ文字にマッチしない）

  **意味論固定テスト（semantic-pinning）**:
  - `globMatch("a//b", "a/**/b")` → `false`（`**/` の segment 非空意味論）
  - `globMatch("a/x/b", "a/**/b")` → `true`

  **本番 pattern 代表ケース**:
  - `globMatch("src/foo.ts", "src/**")` → `true`
  - `globMatch("vendor/lib.ts", "vendor/**")` → `true`
  - `globMatch("foo.test.ts", "**/*.test.*")` → `true`
  - `globMatch("src/foo.test.ts", "**/*.test.*")` → `true`
  - `globMatch("exact/path.ts", "exact/path.ts")` → `true`
  - `globMatch("other/path.ts", "exact/path.ts")` → `false`

  **injection safety（`src/core/reviewers/__tests__/glob-match.test.ts` から移植）**:
  - `globMatch("src/auth.ts", "src/authXts")` → `false`（literal `.` が任意文字にマッチしない）
  - `globMatch("src/auth.ts", "src/auth.ts")` → `true`
  - `globMatch("(invalid)", "(invalid)")` → `true`
  - `globMatch("(invalid)", "invalid")` → `false`

注意: `matchesGlob` のテスト追加のため `import { matchesGlob }` を `glob-match.ts` から追加すること。

**Acceptance Criteria**:
- `src/core/reviewers/__tests__/glob-match.test.ts` が存在しない
- `tests/unit/util/glob-match.test.ts` に semantic-pinning・本番 pattern・injection safety の各 describe block が追加されている
- `bun run test` が green（新規テスト含む）

---

## T-05: 全体検証

- [x] `bun run typecheck` が通る
- [x] `bun run test` が通る（既存テスト無改変 + 新規テスト green）
- [x] `grep -rn '\bmatchGlob\b' src/ tests/` が 0 件
- [x] `grep -c 'function matchesGlob' src/util/glob-match.ts` が 1
- [x] `shared-glob-match-imports.test.ts` が無改変で通る

**Acceptance Criteria**:
- 受け入れ基準 6 項目が全て満たされている:
  1. src/ 内の glob matching 実装が 1 つだけ
  2. `matchGlob` が src/ tests/ で grep 0 件、`matchesGlob` は `globMatch` 委譲のみ
  3. 消費者 3 ファイルの引数順が `(file, pattern)` に統一
  4. 意味論固定 test が追加され green
  5. 既存 `tests/unit/util/glob-match.test.ts` と `matchesGlob` 消費者側 test が無改変で green
  6. `typecheck && test` が green
