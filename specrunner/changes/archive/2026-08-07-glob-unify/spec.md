# Spec: glob-unify

## Requirements

### Requirement: glob matching 実装が 1 つだけ存在する

`src/` 内の glob matching 実装（`**`/`*`/`?` を regex 化する関数）は `globMatch` のみ SHALL 存在する。`matchGlob` は削除される。`matchesGlob` は `globMatch` への委譲のみとし、独立実装ループを持たない。

#### Scenario: `matchGlob` が src/ tests/ に存在しない

**Given** `src/core/reviewers/glob-match.ts` が削除され、消費者が repoint された状態
**When** `src/` および `tests/` を `matchGlob` でgrep する
**Then** 0 件

#### Scenario: `matchesGlob` の本体が委譲のみ

**Given** `src/util/glob-match.ts` の実装
**When** `matchesGlob` の関数本体を検査する
**Then** `return globMatch(filePath, pattern);` のみであり、独立した while ループや regex 構築コードを含まない

---

### Requirement: `matchesGlob` の関数名が `src/util/glob-match.ts` で維持される

`matchesGlob` は `src/util/glob-match.ts` に `export function matchesGlob` として SHALL 存在し続ける。

#### Scenario: 構造テスト TC-009 が通過する

**Given** `src/core/step/__tests__/shared-glob-match-imports.test.ts` が無改変で存在する
**When** vitest を実行する
**Then** 全テストが green である

---

### Requirement: 消費者 3 ファイルの引数順が `(file, pattern)` に統一される

`src/core/pipeline/scope.ts`、`src/core/reviewers/activation.ts`、`src/core/step/main-checkout-guard.ts` の `globMatch` 呼び出しは引数順 `(file, pattern)` で SHALL 統一される。

#### Scenario: `scope.ts` の呼び出し

**Given** `src/core/pipeline/scope.ts` が更新された状態
**When** `globMatch` 呼び出しを検査する
**Then** `globMatch(file, pattern)` の順（file が第 1 引数）である

---

### Requirement: `?` wildcard が `globMatch` および `matchesGlob` で正しく動作する

`?` は「任意の 1 文字（`/` を除く）」として SHALL 扱われる。委譲後の `matchesGlob` も同動作を引き継ぐ。

#### Scenario: `?` を含むパターンが 1 文字にマッチする

**Given** `globMatch("src/foox.ts", "src/foo?.ts")` を呼び出す
**When** 実行する
**Then** `true` を返す

#### Scenario: `matchesGlob` でも `?` が wildcard として動く

**Given** `matchesGlob("src/foox.ts", "src/foo?.ts")` を呼び出す
**When** 実行する
**Then** `true` を返す（委譲により `globMatch` と同結果）

---

### Requirement: `**/` の segment 非空意味論が維持される

`a/**/b` パターンは `a//b` に SHALL マッチしない（git 準拠・minimatch 準拠意味論）。

#### Scenario: 空 segment にマッチしない

**Given** `globMatch("a//b", "a/**/b")` を呼び出す
**When** 実行する
**Then** `false` を返す

#### Scenario: 非空 segment にはマッチする

**Given** `globMatch("a/x/b", "a/**/b")` を呼び出す
**When** 実行する
**Then** `true` を返す

---

### Requirement: 本番 pattern 形状で `globMatch` が正しく動作する

本番 pattern（`src/**`、`**/*.test.*`、`vendor/**`、完全一致 path）で `globMatch` は SHALL 期待する結果を返す。

#### Scenario: 代表ケース群

**Given** 以下の呼び出し:
- `globMatch("src/foo.ts", "src/**")` → `true`
- `globMatch("vendor/lib.ts", "vendor/**")` → `true`
- `globMatch("foo.test.ts", "**/*.test.*")` → `true`
- `globMatch("src/foo.test.ts", "**/*.test.*")` → `true`
- `globMatch("exact/path.ts", "exact/path.ts")` → `true`
- `globMatch("other/path.ts", "exact/path.ts")` → `false`

**When** 実行する
**Then** 全ケースが期待する値を返す
