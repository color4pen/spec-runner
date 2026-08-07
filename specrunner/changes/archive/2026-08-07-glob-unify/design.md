# Design: glob matcher 統一 (glob-unify)

## Context

`src/util/glob-match.ts` に `globMatch` と `matchesGlob` の 2 実装が同居し、`src/core/reviewers/glob-match.ts` に第 3 実装 `matchGlob`（引数順が逆: `(pattern, filePath)`）が存在する。

1,927 ケースの差分実測で不一致 18 件・全て本番に存在しない入力形状に限られることが確認済み。本番 pattern 形状（`src/**`、`**/*.test.*`、`vendor/**`、完全一致）では 3 実装が完全に一致する。

消費者の現状:

| 関数 | 引数順 | 消費者 |
|------|--------|--------|
| `globMatch` | `(file, pattern)` | `protected-paths.ts`、`changed-line-coverage.ts` |
| `matchesGlob` | `(file, pattern)` | `staging-containment.ts`、`bite-evidence/test-file-selection.ts`（re-export） |
| `matchGlob` | `(pattern, file)` | `core/pipeline/scope.ts`、`core/reviewers/activation.ts`、`core/step/main-checkout-guard.ts` |

`src/core/step/__tests__/shared-glob-match-imports.test.ts` が `/\bfunction\s+matchesGlob\b/` を 1 件ピンしているため、`matchesGlob` の関数名と `function` キーワードは維持が必要。

## Goals / Non-Goals

**Goals**:
- glob matching 実装を `globMatch` 1 つに統一する
- `matchGlob` を src/ tests/ から完全に排除する
- `matchesGlob` を `globMatch` への thin wrapper に置き換える（名前は維持）
- 消費者 3 ファイルの引数順を `(file, pattern)` に統一する
- 意味論差分（`?` wildcard・`**/` segment 非空）を テストとして固定する

**Non-Goals**:
- `node:path.matchesGlob` への置換（Node >= 22.5 必要、engines は >= 20）
- brace・negation 等の pattern 構文拡張

## Decisions

### D1: 生存実装は `globMatch`（architect 評価済み）

`?` をサポートし、`**/` の segment 非空意味論（`(?:.+/)?`）が minimatch/git 準拠。

却下した代替案:
- `matchesGlob` を生存させる → `?` 非サポートで機能が狭い
- `matchGlob` を生存させる → `***` 誤 match・空 segment 許容の 2 つの癖がある
- `path.matchesGlob` → engines 制約（>= 20）で不可

### D2: `matchesGlob` は `globMatch` への thin wrapper として存続

```ts
export function matchesGlob(filePath: string, pattern: string): boolean {
  return globMatch(filePath, pattern);
}
```

理由: `shared-glob-match-imports.test.ts` が `/\bfunction\s+matchesGlob\b/` を 1 件ピンしており、`export { globMatch as matchesGlob }` 形式では pattern が 0 件になりテストが失敗する。

`matchesGlob` 消費者（`staging-containment.ts`、`test-file-selection.ts`）にとって `?` が literal → wildcard の意味変化が生じるが、本番 pattern に `?` は存在せず露出ゼロ。

### D3: `matchGlob` 消費者は call site で引数順を直接修正

`matchGlob(pattern, file)` → `globMatch(file, pattern)` へ各 call site を修正。逆順 wrapper は次の読者を混乱させるため採用しない。対象 3 ファイルで各 1 箇所。

Import パスはいずれも `../../util/glob-match.js`（3 ファイルとも `src/core/*/` に位置するため同一相対パス）。

### D4: `src/core/reviewers/__tests__/glob-match.test.ts` を削除し有用ケースを統合

`matchGlob` が削除されるため対応テストファイルも削除。injection safety テスト（regex metacharacter escape）は `tests/unit/util/glob-match.test.ts` に移植する。

## Risks / Trade-offs

**[Risk] `matchesGlob` の `**/` 意味論が微妙に変化**
`(?:.*/)?`（空 segment 許容）→ `(?:.+/)?`（segment 非空）へ変わる。
Mitigation: 本番 path は git 由来の repo 相対 POSIX path のみ。先頭 `/`・`//` は発生しない。差分実測 1,927 ケース済み。

**[Risk] `main-checkout-guard.ts` の doc comment に `step → reviewers: matchGlob` 記載**
Mitigation: import 変更と同時に `step → util: globMatch` へ更新する。

## Open Questions

なし（architect 評価済み・差分実測済み）
