# glob matcher 3 実装を util/glob-match.ts の globMatch に統一する

## Meta

- **type**: refactoring
- **slug**: glob-unify
- **base-branch**: main
- **adr**: false

## 背景

repo 内に glob matcher が 3 実装存在する: `src/util/glob-match.ts` の `globMatch` と `matchesGlob`（ファイル自身が「独立 2 実装・微妙に意味論が異なる」と注記: :75-77）、および `src/core/reviewers/glob-match.ts` の `matchGlob`。3 実装に同一入力を与える差分実測（1,927 ケース）を実施済みで、不一致は 18 ケース・全て本番に存在しない入力形状に限られることが確認されている。本 request で `globMatch` に統一する。

差分実測の結果（統一の安全性根拠）:

| 差分バケット | 内容 | 本番露出 |
|---|---|---|
| `?` wildcard | `matchesGlob` のみ `?` をリテラル扱い（他 2 実装は任意 1 文字） | 本番 pattern に `?` を含むものは存在しない |
| `**/` の空 segment | `globMatch` は `(?:.+/)?`（segment 非空 = minimatch/git 準拠）、他 2 実装は `(.*/)?`（先頭 `/` や `//` を許容） | 呼び出し元は git 由来の repo 相対 POSIX path のみで、先頭 `/`・`//` は発生しない |
| 不正形 `***/` | `matchGlob` の replace 順序の癖で slash 無し path に誤 match | 本番 pattern に `***` は存在しない |

本番の pattern 形状（config・`DEFAULT_SCOPED_TEST_PATTERNS`・docs 例: `src/**`、`**/*.test.*`、`vendor/**`、完全一致 path 等）に限定すると 3 実装は全ケース一致する。

## 現状コードの前提

- `src/util/glob-match.ts:17` `globMatch(filePath, pattern)` と :95 `matchesGlob(filePath, pattern)` が同居。:72-77 に「2 実装は独立・統一はスコープ外」の注記がある
- `src/core/reviewers/glob-match.ts` の `matchGlob(pattern, file)` は**引数順が逆**。消費者は `src/core/pipeline/scope.ts:16,67`・`src/core/reviewers/activation.ts:11,87`・`src/core/step/main-checkout-guard.ts:17,76` の 3 ファイル
- `matchesGlob` の消費者は `src/core/archive/protected-paths.ts`・`src/core/step/staging-containment.ts`・`src/core/verification/changed-line-coverage.ts`
- 専用 test: `tests/unit/util/glob-match.test.ts`・`src/core/reviewers/__tests__/glob-match.test.ts`。`src/core/step/__tests__/` に matcher の import 経路を pin する構造 test（shared-glob-match-imports）があり `matchesGlob` の名前を固定している

## 要件

1. `src/core/reviewers/glob-match.ts` を削除し、消費者 3 ファイルを `util/glob-match.js` の `globMatch(file, pattern)` に repoint する（**引数順の入れ替えが必要**。alias では済まない）
2. `matchesGlob` を独立実装から `globMatch` への委譲（または re-export alias)に置き換える。名前は構造 test が pin しているため維持する
3. `src/util/glob-match.ts:72-77` の「2 実装は独立」注記を削除し、単一実装であることを反映する
4. 上記差分表の 3 バケットを test として固定する: `?` を含む pattern が wildcard として動くこと、`a/**/b` が `a//b` に match しないこと（git 準拠意味論）、および本番 pattern 形状の代表ケース（`src/**`・`**/*.test.*`・`vendor/**`・完全一致）で従来と同結果であること
5. `src/core/reviewers/__tests__/glob-match.test.ts` は削除し、残すべきケースがあれば `tests/unit/util/glob-match.test.ts` に統合する

## スコープ外

- `node:path` の `matchesGlob` への置換（Node >= 22.5 が必要。package.json は node >= 20）
- pattern 構文の拡張（brace・negation 等）

## 受け入れ基準

- [ ] src/ 内の glob matching 実装（`**`/`*`/`?` を regex 化する関数）が 1 つだけになっている
- [ ] `matchGlob` が src/ tests/ で grep 0 件、`matchesGlob` は globMatch への委譲のみ
- [ ] 消費者 3 ファイルの引数順が `(file, pattern)` に統一されている
- [ ] 要件 4 の意味論固定 test が追加され green
- [ ] 既存の `tests/unit/util/glob-match.test.ts` と matchesGlob 消費者側の既存 test が無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 生存実装は `globMatch`: `?` をサポートし、`**/` の segment 非空意味論が minimatch/git 準拠であるため。`matchesGlob` 消費者にとっては「pattern 内 `?` が literal → wildcard」の意味変更になるが、本番 pattern に `?` は存在せず露出ゼロ
- 却下した代替案: `matchesGlob` を生存させる案（`?` 非対応で機能が狭い）、reviewers 側 `matchGlob` を生存させる案（`***` の誤 match と空 segment 許容という 2 つの癖を持つ）、Node 標準 `path.matchesGlob`（engines 制約で不可）
