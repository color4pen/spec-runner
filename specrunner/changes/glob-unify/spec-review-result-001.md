# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Architecture

**依存方向の確認**

- `src/util/glob-match.ts` は stdlib のみに依存（外部依存なし）
- 変更後、`activation.ts`（`src/core/reviewers/`）と `scope.ts`（`src/core/pipeline/`）と `main-checkout-guard.ts`（`src/core/step/`）が `src/util/` をインポートする方向は core→util で正当
- `src/core/reviewers/glob-match.ts` 削除後、消費者 import path はすべて `../../util/glob-match.js` に統一（D3）

**責務分離**

- `globMatch` = 唯一のパターン変換エンジン
- `matchesGlob` = thin wrapper（名前維持のみ）
- `matchGlob` = 完全削除（消費者は call site で arg 順修正）

### Correctness

**`globMatch` の regex 生成を手動トレース**

`a/**/b` に対して:
- `a/` → `a\/`
- `**/` → `(?:.+/)?`（`.+` で segment 非空を保証）
- `b` → `b`
- 最終 regex: `^a\/(?:.+/)?b$`

- `a//b` テスト: `a/` マッチ後、残 `/b` に対し `(?:.+/)?` は `.+` で `/` の後に別の `/` が必要だが存在せず、空マッチ後は `b` が必要なところ `/b` → **FALSE** ✓（spec 要件と一致）
- `a/x/b` テスト: `(?:.+/)` で `x/` がマッチ → **TRUE** ✓

**`matchesGlob` 委譲後の既存テスト通過確認**

`test-file-selection.test.ts` の代表ケースを `globMatch` で手動検証:
- `matchesGlob("foo.test.ts", "**/*.test.*")`: regex `^(?:.+/)?[^/]*\.test\.[^/]*$` → `(?:.+/)?` 空マッチ → TRUE ✓
- `matchesGlob("foo_testXts", "**/*.test.*")`: literal `.test.` なし → FALSE ✓
- `matchesGlob("src/a/b/foo_test.ts", "src/**test.ts")`: regex `^src\/.*test\.ts$` → TRUE ✓
- `matchesGlob(".cargo-tmp/registry/cache.json", "**/.cargo-tmp/**")`: `(?:.+/)?` 空マッチ後 `\.cargo-tmp\/.*` がマッチ → TRUE ✓

`staging-containment.test.ts` と `test-file-selection.test.ts` の全ケースが委譲後も green になることを確認。

**`shared-glob-match-imports.test.ts` 制約の確認**

- TC-009 の `/\bfunction\s+matchesGlob\b/g` が glob-match.ts で 1 件を期待
- T-01 後は `export function matchesGlob(filePath: string, pattern: string): boolean { return globMatch(filePath, pattern); }` の形で `function matchesGlob` が 1 件のみ残る → ✓
- `export { globMatch as matchesGlob }` 形式では 0 件になりテストが落ちるため wrapper 形式が必須（design D2 の理由として明記済み）

**T-03 の引数順フリップを全 call site で確認**

実際のコードを読んで確認:
- `scope.ts:67` — `matchGlob(pattern, file)` → `globMatch(file, pattern)` ✓
- `activation.ts:87` — `cond.paths!.some((pattern) => matchGlob(pattern, file))` → `cond.paths!.some((pattern) => globMatch(file, pattern))` ✓
- `main-checkout-guard.ts:76` — `matchGlob(g, filePath)` → `globMatch(filePath, g)` ✓（`g` = pattern, `filePath` = file）

**T-04 injection safety テストの引数順チェック**

旧テスト `matchGlob("src/auth.ts", "src/authXts")` は `matchGlob(pattern, file)` 形式（pattern="src/auth.ts", file="src/authXts"）。
T-04 が指示する `globMatch("src/auth.ts", "src/authXts")` は `globMatch(file, pattern)` 形式（file="src/auth.ts", pattern="src/authXts"）。
引数が入れ替わっているが `false` を返すことは同じ（escaping の動作は保持）。テスト意図（metachar escape）も保存されている ✓。

### Task Decomposition Coverage

| Task | 対応する要件 | 網羅 |
|------|-------------|------|
| T-01 | 要件 1（`matchesGlob` 委譲）・要件 2（関数名維持） | ✓ |
| T-02 | 要件 1（`matchGlob` 削除） | ✓ |
| T-03 | 要件 3（引数順統一）・要件 1（grep 0 件） | ✓ |
| T-04 | 要件 4（意味論固定 test）・要件 5（test 整理） | ✓ |
| T-05 | 受け入れ基準 6 項目の全体検証 | ✓ |

受け入れ基準 6 項目すべてに対応するタスクが存在する。

## 検証できなかった項目

None。全項目をコード読み・手動トレースで確認した。

## Findings 詳細

指摘がない場合は None と明記する。

None。
