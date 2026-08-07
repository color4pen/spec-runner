# Cross-Boundary Invariants Review — glob-unify — iter 1

## Reviewer

cross-boundary-invariants

## Purpose

変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope of Change

変更対象ファイル（src/ 内）:

| ファイル | 変更内容 |
|----------|----------|
| `src/util/glob-match.ts` | `matchesGlob` を独立実装から `globMatch` 委譲に置き換え、注記コメント削除 |
| `src/core/reviewers/glob-match.ts` | 削除 |
| `src/core/reviewers/__tests__/glob-match.test.ts` | 削除 |
| `src/core/pipeline/scope.ts` | import + 呼び出し引数順変更 |
| `src/core/reviewers/activation.ts` | import + 呼び出し引数順変更 |
| `src/core/step/main-checkout-guard.ts` | import + 呼び出し引数順変更 + doc comment 更新 |
| `tests/unit/util/glob-match.test.ts` | 意味論固定 test + injection safety 移植追加 |

---

## Invariant Trace

### INV-1: `matchesGlob` consumers の引数順は変わっていないか

`matchesGlob(filePath, pattern)` の引数順は変更前後で同一。

- `staging-containment.ts` L191: `matchesGlob(p, pat)` ← 変更なし ✓
- `test-file-selection.ts` L69: `matchesGlob(f, p)` ← 変更なし ✓
- `staging-containment.test.ts` TC-019: `matchesGlob(filePath, pattern)` ← 変更なし ✓

### INV-2: `matchGlob` 消費者 3 ファイルの引数順入れ替えが正しいか

旧: `matchGlob(pattern, file)` → 新: `globMatch(file, pattern)`

| ファイル | 旧呼び出し | 新呼び出し | 正否 |
|----------|-----------|-----------|------|
| `scope.ts` L67 | `matchGlob(pattern, file)` | `globMatch(file, pattern)` | ✓ |
| `activation.ts` L87 | `matchGlob(pattern, file)` | `globMatch(file, pattern)` | ✓ |
| `main-checkout-guard.ts` L76 | `matchGlob(g, filePath)` | `globMatch(filePath, g)` | ✓ |

全 3 ファイルで引数順の入れ替えが正しい。

### INV-3: `shared-glob-match-imports.test.ts` の構造 contract が維持されているか

テストが pin している不変条件:

1. `/\bfunction\s+matchesGlob\b/g` が `src/util/glob-match.ts` に 1 件 → `export function matchesGlob(...)` でマッチ ✓
2. `test-file-selection.ts` が `glob-match.js` から import → `import { matchesGlob } from '../../../util/glob-match.js'` ✓
3. `staging-containment.ts` が `glob-match.js` から import → `import { matchesGlob } from '../../util/glob-match.js'` ✓
4. 両ファイルがローカルに `function matchesGlob` を定義しない → 定義なし ✓
5. `test-file-selection.ts` が `export { matchesGlob }` を持つ → L17 で `export { matchesGlob }` ✓

全 contract 維持。

### INV-4: `matchesGlob` の `**/` 意味論変化と消費者への影響

| 変化 | 旧 | 新 |
|------|----|----|
| `**/` の regex | `(?:.*/)?` (空 segment 許容) | `(?:.+/)?` (segment 非空) |

影響範囲の確認:

- `staging-containment.ts` の除外 patterns: `config.pipeline.stagingExcludePatterns` ← git 由来の repo 相対 POSIX path のみ。先頭 `/` や `//` は発生しない。影響なし。
- `test-file-selection.ts` の `DEFAULT_SCOPED_TEST_PATTERNS` (`**/*.test.*` 等): パスは git tracked files のみ。`//` は発生しない。影響なし。

TC-019 の `matchesGlob(".cargo-tmp/registry/cache.json", "**/.cargo-tmp/**")`:
- 新 regex: `^(?:.+/)?\.cargo-tmp/.*$`
- 入力: `.cargo-tmp/registry/cache.json` → `(?:.+/)?` は optional なので prefix なしでマッチ → **true** ✓

### INV-5: `matchesGlob` の `?` 意味論変化と消費者への影響

| 変化 | 旧 | 新 |
|------|----|----|
| pattern 内の `?` | リテラル `\?` | wildcard `[^/]` |

消費者別 pattern 確認:

- `staging-containment.ts`: `stagingExcludePatterns` はユーザー設定。本番設定に `?` を含む pattern は存在しないことが差分実測で確認済み（request.md 参照）。
- `test-file-selection.ts`: `DEFAULT_SCOPED_TEST_PATTERNS` = `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]` に `?` なし。
- `applyStagingExclusions` の既存 test の patterns: `["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"]` に `?` なし。

既存 test に `?` を含む pattern を使うものは存在しない。TC-019 tests も同様。

この意味論変化は**既知の設計決定**（architect 評価済み）であり、既存 test が破れる経路はない。

ただし、これはユーザー設定可能な config path (`stagingExcludePatterns`, reviewer `paths`) に適用されるため、「`?` はリテラル」と認識して config を書いていたユーザーが今後 `?` を pattern に使うと、期待と異なる動作をする可能性がある。**暗黙の API contract が変わる**。

### INV-6: 削除された `src/core/reviewers/glob-match.ts` への参照残存確認

```
grep -rn "matchGlob\b" src/ tests/ → 0 件
grep -rn "from.*reviewers/glob-match" src/ tests/ → 0 件
```

孤立 import なし ✓

### INV-7: `activation.ts` の `matchGlob` → `globMatch` 移行による意味論差分

旧 `matchGlob`（`reviewers/glob-match.ts`）の `**/`:
- `placeholder + escape + restore` 方式で `(.*/)?` (空 segment 許容)

新 `globMatch`（`util/glob-match.ts`）の `**/`:
- `(?:.+/)?` (segment 非空)

Reviewer `paths` patterns は `.specrunner/config.json` または reviewer 定義 frontmatter で宣言される。入力 `changedFiles` は git 由来の repo 相対パス。先頭 `/` や `//` は発生しない。実質的影響なし。

旧 `matchGlob` は `?` を wildcard として扱っていた（`globToRegExp` の GLOBSTAR/QM 置換方式）。新 `globMatch` も同様。この点では変化なし。

---

## Findings

### F-1 (LOW): `matchesGlob` の `?` = literal → wildcard はユーザー設定 API の暗黙 contract 変化

`stagingExcludePatterns` および reviewer `paths` は外部ユーザーが設定するフィールドであり、旧来の「`?` はリテラル」という暗黙の API 仕様が変わる。本番 pattern に `?` が存在しないことは実測で確認済みだが、将来的に `?` を literal として使う設定を書くユーザーが意図しない wildcard 動作に遭遇するリスクがある。JSDoc の "same semantics, same supported syntax" は「`?` wildcard をサポートする」と読めるため、今後の config ドキュメントで明示するのが望ましい。

判定: **情報的観察**。実装を止めるレベルではない。

---

## Evidence Summary

| 確認項目 | 結果 |
|----------|------|
| `matchGlob` src/tests/ 残存 | 0 件 ✓ |
| 引数順 3 ファイル全て正しい | ✓ |
| `shared-glob-match-imports.test.ts` contract 全件維持 | ✓ |
| `matchesGlob` consumers: `?`/`**/` 変化による既存 test 破損経路 | なし ✓ |
| TC-019 `**/.cargo-tmp/**` 新実装での動作 | MATCHES ✓ |
| `reviewers/glob-match.ts` への orphan import | なし ✓ |
| `activation.ts` の `?` 意味論変化 | 変化なし（旧 matchGlob も `?` = wildcard） ✓ |

checked: 7, skipped: 0, unverified: 0
