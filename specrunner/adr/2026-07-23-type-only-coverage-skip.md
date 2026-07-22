# ADR-20260723: type-only ファイルの coverage not-loaded を閉集合字句判定でスキップする

**Date**: 2026-07-23
**Status**: accepted

## Context

`changed-line-coverage` gate（`src/core/verification/changed-line-coverage.ts`）は、変更ファイルが lcov に SF レコードとして存在しない場合に fail-closed で fail させる（判定 2: `if (!lcov.has(file))` → `failedFiles.push({ file, reason: "not-loaded" })`）。

しかし **型のみのファイル**（interface / type エイリアス / `import type` / `declare` / コメントのみで構成され、TypeScript コンパイルで emit が生成されないファイル）はいかなるテストからも lcov の SF レコードに載り得ない。そのため、こうしたファイルはコメント 1 行の変更でも構造的に必ず fail する（issue #884）。実例として `src/kernel/reviewer-snapshot.ts` の JSDoc 拡張が `not loaded by test suite (absent from lcov)` で verification を fail させ、build-fixer では正当に解消できず（テスト追加では lcov に載らず、dead export 追加は coverage 回避として禁止）、運用でコメントを削除して回避した。

既存の受け皿には 2 種類ある:

- **判定 3**: lcov に SF は存在するが変更行に DA レコードが無い場合 → 非実行行として pass（TC-CLG-03 が固定）。これは「SF はあるが DA が無い」ケースしか受けられない。
- **include / exclude glob**（`:85-95`）: path ベースの除外のみ。内容ベースの判定は存在しない。

欠けているのは**ファイル全体が消去されて SF レコード自体が無い**場合の扱いであり、型のみファイルにはこの受け皿が無かった。

型のみファイルの検出には複数の実装方針が考えられる:

1. **TypeScript compiler API / AST parser の runtime 利用**: 意味的に正確だが、外部 devDependency を runtime import することになり依存極小の設計方針（Minimal-deps North Star）に反する。
2. **Bun.Transpiler 等による transpile 実行・出力空確認**: runtime 依存の可搬性リスクと、gate 内でのコード実行という新たな攻撃面を増やす。
3. **除外 glob への手動登録運用**: 新しい型のみファイルが追加されるたびに設定が腐り偽陽性が再発する。
4. **変更行単位の型・コメント判定**: hunk テキストの API 変更（`changed-lines.ts` の plumbing 変更）が必要で、ファイル単位判定で実例が解消する以上は過剰。
5. **許可構文の閉集合による保守的な字句判定（外部依存なし）**: 「型であることの証明」を許可リストで行い、未知構文は全て runtime 扱いにする。依存追加なし、偽陽性ゼロを構造的に保証できる。

また、判定結果を評価器（`evaluateChangedLineCoverage`）に渡す方法として:

- **評価器内で直接 fs.readFile を呼ぶ**: 純関数評価器に I/O を混入させ、テスト fixture での網羅固定が困難になる。
- **コールバック注入**: sync コールバック内で sync fs を強いるか、純粋性の議論が濁る。
- **`skippedFiles: string[]` への型混入**: TC-CLG-05/06 が `toContain` で固定しており既存テストを壊す。意味的にも「include 対象外」と「type-only skip」は異なる。
- **ソース読取り結果を Set としてデータ注入**: 評価器を決定的・同期・純粋に保ち、fixture テストで全分岐を固定できる。既存呼び出しは `typeOnlyFiles` を省略することで影響を受けない（additive change）。

## Decision

### D1: 型のみファイルの検出は許可構文の閉集合による自前の字句走査（`src/core/verification/type-only.ts` 新規 module）

純関数 `isTypeOnlySource(source: string): boolean` を追加する。判定は「型であることの証明」を**許可構文の閉集合**で行い、閉集合で説明し尽くせない構文が 1 つでもあれば false（runtime の可能性）を返す。

許可する top-level 構文の閉集合:

- 空行 / コメント（`//`、`/* */`、JSDoc `/** */`）
- `import type ...`（named / default / namespace 形の型 import）
- `export type ...`（`export type X = ...`、`export type { A }`、`export type * from ...` の re-export 含む）
- `interface` 宣言（`export interface` 含む）
- `type` エイリアス宣言（`export type` 含む、複数行 union 含む）
- `declare` 宣言（ambient、runtime emit なし）
- 値を伴わない `export {}`（空）/ `export type { ... }`

上記以外の top-level 構文は全て false。特に `enum` / `const enum` / `class` / 関数宣言 / 値 import / 値 export / 式文は false。

**安全不変条件「疑わしきは false」**: トークナイザ + top-level statement 分類 + consume-to-end の 2 段構造で、早期終端バイアスにより判定の誤りは常に「余分にリーダ判定が走り未知リーダで false になる」偽陰性側に倒れ、runtime 構文が許可文へ吸収される偽陽性側には倒れない。この不変条件は、gate が走る時点で typecheck が必ず passed であること（runner.ts の fail-fast による保証）に依存している。偽陰性（type-only なのに false）は許容し、現行どおり fail する（fail-open にしない）。

外部依存（typescript 等）は追加しない。

### D2: ソース読取り結果を Set としてデータ注入（評価器の純粋性を保つ）

`EvaluateInput` に optional な `typeOnlyFiles?: Set<string>` を追加し、orchestrator（`runChangedLineCoverageGate`）が evaluate 呼び出し前に構築して渡す。

- lcov 不在の変更ファイル（`!lcov.has(file)` の候補）のみ `fs.readFile` でソースを読む。
- 読めたら `isTypeOnlySource` を適用し、true なら `typeOnlyFiles` に追加する。
- **読めなかった場合は追加しない** → 評価器で従来どおり not-loaded fail（fail-closed）。

評価器側では判定 2 を拡張: `typeOnlyFiles?.has(file)` → skip（type-only として記録）/ それ以外 → 従来の not-loaded fail。

観測可能性のため `EvaluateResult` に `typeOnlySkipped: TypeOnlySkip[]` を追加し、`stdout` には `typeOnlySkipped` 非空時のみ専用行を追記する。

**`skippedFiles`（include/exclude 除外）の型・意味・出力文言は不変**とし、type-only skip は新フィールドに分離する。

### D3: 変更行単位の判定はスコープ外（将来の別 request）

ファイル全体の型のみ判定でよい（#884 の実例はこれで解消する）。変更行単位の判定は hunk テキストの plumbing 変更が必要であり、現時点では過剰。将来必要になれば別 request で対応する。

## Alternatives Considered

### 代替 1: TypeScript compiler API / AST parser の runtime 利用

- **Pros**: 意味的に正確。型システムが正しく解釈する。
- **Cons**: `typescript` は devDependency のみであり runtime import 不可。新規 runtime 依存の追加は依存極小の North Star に反する。
- **Why not**: 閉集合の字句判定で必要十分であり、AST の厳密さは必要ない。

### 代替 2: Bun.Transpiler 等による transpile 実行・出力空確認

- **Pros**: コンパイラによる emit 有無の直接確認。型のみファイルかどうかの正確な判定。
- **Cons**: runtime（bun/node）依存の可搬性リスク。gate 内でのコード実行という新たな攻撃面。
- **Why not**: pure 字句判定で足りる。gate 内でのコード実行は避けたい。

### 代替 3: exclude glob への手動登録運用

- **Pros**: 既存の除外機構を使うため実装コストゼロ。
- **Cons**: 型のみファイルが追加されるたびに設定が腐り偽陽性が再発する。運用負荷が継続的にかかる。
- **Why not**: 自動的に型のみファイルを検出する方が持続可能。手動登録は根本解決にならない。

### 代替 4: 評価器内で直接 fs.readFile を呼ぶ（I/O を純関数に混入）

- **Pros**: 実装箇所が一か所にまとまる。
- **Cons**: 評価器が純関数でなくなり、fixture テストで全分岐を固定できなくなる。非同期 I/O 化が必要。
- **Why not**: データ注入パターンで評価器の純粋性を保ちつつ orchestrator に I/O を委ねる方が設計上明快。

### 代替 5: `skippedFiles` に type-only skip を混入

- **Pros**: 既存フィールドへの追記で型変更が少ない。
- **Cons**: TC-CLG-05/06 が `skippedFiles.toContain(<path>)` を固定しており既存テストを破る。意味的にも「include 対象外（coverage surface 外）」と「type-only（coverage に載れない構造的理由）」は異なる。
- **Why not**: 意味を分離した新フィールド `typeOnlySkipped` を追加する方が正しい。

## Consequences

### Positive

- 型のみのファイルへのコメント・型追加が coverage gate で構造的 false alarm を起こさなくなる（#884 が解消される）
- 「疑わしきは false」の安全不変条件により偽陽性（runtime コードを type-only と誤判定して gate を通過させる）が構造的に不可能
- 外部依存を追加せず依存極小の North Star を維持
- 評価器の純粋性が保たれ、全分岐を fixture テストで固定可能（Verify don't trust）
- 既存テスト 26 件が無変更で green（additive change）

### Negative

- テンプレートリテラル型 / インライン `import { type X }` / const 型パラメータ等の稀な構文は偽陰性（type-only なのに false）になり、現行どおり fail が発生し得る。将来必要なら字句判定を拡張するか、別 request で別アプローチを検討する。
- 字句走査は TypeScript の構文仕様と同期しない（言語進化で新しい型構文が追加されると偽陰性が増える可能性）。ただし false 側に倒れるため安全性は維持される。

### Known Debt

- **変更行単位の判定未対応**: ファイルに runtime コードと型定義が混在するが変更行が型のみ、というケースは現行どおり判定 3（DA 無し行 pass）が受ける。hunk テキストの plumbing 変更が必要なため本 change のスコープ外（D3 参照）。
- **偽陰性の残存**: テンプレートリテラル型・インライン type import 等は false に倒れる。検出力には影響しない（fail 維持）が、利便性の向上余地がある。

## References

- Request: `specrunner/changes/coverage-type-only-not-loaded/request.md`
- Design: `specrunner/changes/coverage-type-only-not-loaded/design.md`
- Spec: `specrunner/changes/coverage-type-only-not-loaded/spec.md`
- Issue: #884
- Implementation: `src/core/verification/type-only.ts`（新規）、`src/core/verification/changed-line-coverage.ts`（変更）
- Tests: `tests/unit/core/verification/type-only.test.ts`（新規）、`tests/unit/core/verification/changed-line-coverage-type-only.test.ts`（新規）
