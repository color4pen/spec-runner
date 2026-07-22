# Design: changed-line-coverage の not-loaded 判定を type-only ファイルで誤検出させない

## Context

changed-line-coverage gate（`src/core/verification/changed-line-coverage.ts`）は、変更対象ファイルが lcov に存在しない場合を fail-closed で fail させる（判定 2: `if (!lcov.has(file))` → `failedFiles.push({ file, reason: "not-loaded" })`、`:97-101`）。

しかし **型のみのファイル**（interface / type エイリアス / `import type` / `declare` / コメントのみで runtime コードを生成しないファイル）は tsc のトランスパイルで消去され、いかなるテストからも lcov に SF レコードとして載り得ない。そのため、こうしたファイルはコメント 1 行の変更でも判定 2 で構造的に必ず fail する（#884）。実装当時 type-only であった `src/kernel/reviewer-snapshot.ts` の JSDoc 拡張が `not loaded by test suite (absent from lcov)`（`:148-149`）で verification を fail させ、build-fixer では正当に解消できず（テスト追加では lcov に載らず、dead export 追加は coverage 回避として禁止）、運用でコメントを削除して回避した。

現状の受け皿は 2 種類ある:

- **判定 3**（`:113-116`）: ファイルは lcov に存在するが変更行に DA レコードが無い場合。非実行行（型定義・コメント）として pass。TC-CLG-03 が固定。
- **include / exclude glob**（`:85-95`）: path ベースの除外のみ。**内容ベースの判定は存在しない**。

欠けているのは **ファイル全体が消去されて lcov に SF レコード自体が無い**場合の扱いだけである。判定 3 は「SF はあるが DA が無い」ケースしか受けられない。

### 現状構造（変更の土台）

- 判定コアは純関数 `evaluateChangedLineCoverage(input: EvaluateInput): EvaluateResult`（`:77-173`）。入力は `lcov` / `changedLinesByFile` / `include` / `exclude` / `minChangedLineCoverage` のみで、**ファイル内容も hunk テキストも参照しない**。
- orchestrator `runChangedLineCoverageGate`（`:214-318`）が coverage コマンド実行 → lcov 読取 → `getChangedFilesAndLines` で変更行導出 → 純関数呼び出し → `PhaseResult` 生成、という I/O を担う。ファイルパスは repo-root 相対 POSIX（git 出力そのまま）。
- `EvaluateResult` は `{ status, failedFiles, skippedFiles: string[], stdout }`。`skippedFiles` は include/exclude で除外されたファイルのフラットな string 配列で、既存テスト TC-CLG-05 / TC-CLG-06 が `toContain(<path>)` で固定している。この型・意味は module 内部と自身のテストだけが参照する（外部 consumer なし）。
- `changed-lines.ts:125-173` の per-file `git diff --unified=0` テキストは hunk header の行番号抽出後に破棄され、行番号 Set のみが残る。
- runner.ts はゲートを `runChangedLineCoverageGate` として呼ぶだけ（`:398`, `:599`）で、`PhaseResult` しか参照しない。runner の coverage 配線テストは `runChangedLineCoverageGate` を丸ごと mock している（`runner-coverage-gate.test.ts:31-37`）。よって**ゲート内部の変更は runner.ts にも runner テストにも波及しない**。
- `package.json`: `typescript` は devDependency のみ。runtime import 不可。AST parser 依存は無い。
- verification の実行順は「build/typecheck/test/lint/security（または `verification.commands`）→ changed-line-coverage gate」で、先行 phase が failed ならゲートは fail-fast で skip される（runner.ts `:386-409`, `:587-610`）。**ゲートが実際に走る時点では typecheck は必ず passed**である。

## Goals / Non-Goals

**Goals**:

- ファイルのソース全文を入力に取り、そのファイルが**確実に runtime コードを生成しない**場合に限り true を返す保守的な pure 関数を追加する（許可構文の閉集合による字句判定、外部依存追加なし）。
- 判定 2（`!lcov.has(file)`）で fail する前に、対象ファイルのソースを読み上記判定を適用する。type-only と判定された場合は fail せず skip 扱いにし、理由（type-only）付きで結果に記録して観測可能にする。ソースが読めない場合は現状どおり fail（fail-closed）。
- runtime コードを持つファイルの not-loaded fail（TC-CLG-04）、DA 無し行の pass（TC-CLG-03）、include/exclude/threshold の挙動を不変に保つ。既存の changed-line-coverage テストは無変更で green。

**Non-Goals**（request のスコープ外を継承）:

- 変更行単位の型・コメント判定（hunk テキストの plumbing 変更が必要。ファイル単位判定で #884 の実例は解消する）。
- lcov 生成側（coverage provider）の設定変更。
- `test-coverage.ts`（TC-ID 検査。本件と無関係）。
- vacuous green（全 skip で pass）側の checker 精度（逆方向の既知問題）。

## Decisions

### D1: type-only 判定は許可構文の閉集合による自前の字句走査（新規 pure module）

`src/core/verification/type-only.ts`（新規）に純関数 `isTypeOnlySource(source: string): boolean` を追加する。判定は「型であることの証明」を**許可構文の閉集合**で行い、閉集合で説明し尽くせない構文が 1 つでもあれば false（runtime の可能性）を返す。

許可する top-level 構文（判定表 D2）:

- 空行 / コメント（`//`、`/* */`、JSDoc `/** */`）
- `import type ...`（named / default / namespace 形の型 import）
- `export type ...`（`export type X = ...`、`export type { A }`、`export type * from ...` の re-export 含む）
- `interface` 宣言（`export interface` 含む）
- `type` エイリアス宣言（`export type` 含む、複数行 union 含む）
- `declare` 宣言（ambient、runtime emit なし）
- 値を伴わない `export {}`（空）/ `export type { ... }`

上記以外の top-level 構文は全て false。特に `enum` / `const enum` / `class` / 関数宣言 / 値 import（`import { x }` / `import x` / `import "..."`）/ 値 export（`export const/function/class/default` / `export *` / `export =`）/ 式文（`foo()` / `x = 1` 等）は false。

- **Rationale**: 偽陽性（runtime コードを持つのに type-only と判定 = gate の抜け穴）を**構造的に不可能**にする。未知構文を全て runtime 扱いに倒すため、判定不能は現状維持の fail に落ち、この変更で検出力は一切下がらない。偽陰性（type-only なのに false）は許容し、その場合は現行どおり fail する（fail-open にしない）。
- **Alternatives considered**:
  - `typescript` / AST parser の runtime 依存追加 → 却下: 依存極小の North Star に反する。閉集合の字句判定で必要十分。
  - `Bun.Transpiler` 等で transpile 実行し出力空を確認 → 却下: runtime（bun/node）依存の可搬性リスクと、gate 内でのコード実行という新たな面を増やす。純字句判定で足りる。
  - exclude glob への手動登録運用 → 却下: 新しい型のみファイルの追加ごとに設定が腐り偽陽性が再発する。

### D2: 字句走査の構造 — トークナイザ + top-level statement 分類 + 安全な consume（偽陽性ゼロを保証する不変条件）

判定は 2 段で行う。**「疑わしきは false」**に一貫して倒すことで、runtime 構文を type-only へ取り込むことを構造的に排除する。

**(a) トークナイズ（コメント・文字列の中和）**

| 入力 | 扱い |
|------|------|
| `//` 行コメント / `/* */` ブロックコメント（JSDoc 含む） | 除去。ブロック未終端 → false |
| `'...'` / `"..."` 文字列（エスケープ対応） | プレースホルダに中和（`import type X from "./m"` の module 指定子など）。未終端 → false |
| バッククォート `` ` ``（テンプレートリテラル） | **false**（テンプレートリテラル型は許可集合外。偽陰性許容） |
| コード文脈の裸 `/`（コメント開始でない） | **false**（除算 / 正規表現 = runtime） |
| コード文脈の `@`（デコレータ） | **false**（runtime） |
| 単語 `[A-Za-z_$][\w$]*` / 数値 / 区切り記号 | トークン化 |
| 上記以外の文字 | **false**（未知入力） |

**(b) top-level statement 分類**（brace/paren/bracket の深さを追跡し depth 0 の文を対象）

各 top-level 文の先頭トークンが以下の**許可リーダ**のいずれかに一致しなければ false:

- `;`（空文）
- `import` の直後が `type` → 許可（それ以外の `import`（値 import / side-effect import）→ false）
- `export` の直後が `type` / `interface` / `declare` → 許可。`export` の直後が `{` かつ即 `}`（空）→ 許可。それ以外の `export`（`*` / `default` / `const` / `function` / `class` / `enum` / `=` / 非空 `{...}`）→ false
- `interface`
- `type`
- `declare`

**consume-to-end（許可文の終端検出、安全側に早期終端）**: リーダ確定後、depth を追跡しながらトークンを読み進め、次の位置で当該文を終端して次のリーダ判定へ戻る:

- depth 0 の `;` → 終端（消費）。
- depth 0 で文境界を検出（閉じ括弧で depth が 0 に戻った直後、または depth 0 の改行）したら、直後トークンが**型継続トークン**（`|` `&` `?` `:` `.` `,` `<` `>` `(` `[` `)` `]` `=>` `extends` `keyof` `typeof` `infer` `readonly` `in` `as` `is` `asserts`）でない限り終端し、直後トークンを新しい文のリーダとして再分類する。直前トークンが二項/開き演算子で明らかに継続する場合は終端しない（`event-types.ts` の複数行 union `\n | "..."` を正しく継続として扱う）。
- 許可文を消費中に EOF に達し、禁止構文を 1 つも見なければ true。

**安全不変条件（偽陽性ゼロ）**: runtime コードを emit し得る文は、depth 0 で必ず許可リーダ集合に無いトークンで始まる。consume-to-end は depth 0 の文境界を越えて次の文へリーダ再分類なしに進入しないため、runtime 文が許可文へ吸収されることはない。したがって偽陽性は構造的に起こらない。この不変条件は入力が**正しい TypeScript**であることに依存するが、ゲートが走る時点で typecheck は必ず passed 済み（Context 参照）であるため成立する。判定表テスト（D2 の許可/禁止と、`type X = A`（改行 ASI）+ `foo()` の混在ケース）でこの不変条件を固定する。

- **Rationale**: 早期終端バイアスにより、判定を誤る方向は常に「余分にリーダ判定が走り未知リーダで false になる」= 偽陰性側に倒れる。トークンを取り込みすぎて禁止構文を見逃す偽陽性側には倒れない。
- **Alternatives considered**: 禁止トークンのブラックリスト走査 → 却下: 列挙漏れが偽陽性（抜け穴）になり、閉集合の要件に反する。許可リストのみが「型であることの証明」を担保する。

### D3: 純関数評価器への組み込みは `typeOnlyFiles: Set<string>` のデータ注入（評価器の純粋性を保つ）

`EvaluateInput` に optional な `typeOnlyFiles?: Set<string>` を追加する。判定 2 を次のように拡張する:

```
!lcov.has(file) のとき:
  typeOnlyFiles が file を含む → skip（type-only として記録）、fail しない
  それ以外                     → 従来どおり failedFiles.push({ file, reason: "not-loaded" })
```

観測可能性のため `EvaluateResult` に `typeOnlySkipped: TypeOnlySkip[]`（`TypeOnlySkip = { file: string; reason: "type-only" }`）を追加する。`stdout` には `typeOnlySkipped` が非空のときのみ専用の 1 行（例: `Type-only (no runtime code, absent from lcov): <files>`）を追記する。

`skippedFiles: string[]`（include/exclude 除外）の**型・意味・出力文言は不変**とし、type-only skip はそこへは入れず新フィールド `typeOnlySkipped` に分離する。

- **Rationale**:
  - ソース読取りは I/O。純関数評価器に I/O 結果を**データ（Set）として渡す**ことで、評価器は決定的・同期・純粋を保ち、fixture テストで全分岐を固定できる（Verify don't trust）。
  - `typeOnlyFiles` を省略した呼び出し（既存テストの評価器直呼び）では従来どおり fail-closed になり、TC-CLG-04 と既存 26 テストが無変更で green を保つ（additive change）。
  - `skippedFiles` を overload しない理由: TC-CLG-05/06 が `skippedFiles.toContain(<string>)` を固定しており、構造を変えると挙動保存（R3）と「既存テスト無変更」に反する。また `skippedFiles` の出力文言は「not in coverage surface」で、include 内にある type-only ファイルとは意味が異なる。理由別に分離するのが正しい。
- **Alternatives considered**:
  - 評価器に read+classify のコールバックを注入 → 却下: 同期コールバック内で sync fs を強いる/純粋性の議論が濁る。Set のデータ注入が最も明快。
  - `skippedFiles` を `{file, reason}[]` に変更 → 却下: 既存テストと挙動保存を破る。

### D4: orchestrator が判定 2 候補ファイルのソースを読み分類する。読取り失敗は fail-closed

`runChangedLineCoverageGate` の evaluate 呼び出し前に、`typeOnlyFiles` を構築する:

- `changedLinesByFile` のキーのうち `!lcov.has(file)`（= 判定 2 に到達し得る候補）についてのみ、`fs.readFile(path.resolve(cwd, file), "utf-8")` でソースを読む。
- 読めたら `isTypeOnlySource(src)` を適用し、true なら `typeOnlyFiles` に追加する。
- **読めなかった（例外）場合は追加しない** → 評価器で従来どおり not-loaded fail（fail-closed）。

構築した `typeOnlyFiles` を `evaluateChangedLineCoverage` に渡す。

- **Rationale**: 読取り対象を「lcov 不在の変更ファイル」に限定することで、in-lcov ファイルの無駄読みを避ける。include/exclude で最終的に除外されるファイルを読むことはあり得るが（評価器が exclude で先に skip するため分類結果は無視される）、挙動には影響せず、include/exclude ロジックの二重化を避けられる。ソース読取りは worktree の HEAD 断面（committed 状態）から行われ、lcov 読取りと同じ disk 断面で一貫する。変更ファイル集合は小さく、read コストは無視できる。
- **Alternatives considered**: 全変更ファイルを無条件に読む → 却下: in-lcov ファイルの無駄読みが増える。判定 2 候補に限定する方が精密。

### D5: 挙動保存（R3）

- **TC-CLG-04**（runtime ファイルの not-loaded fail）: runtime ファイルは `isTypeOnlySource` が false を返す（D1/D2 の閉集合）ため `typeOnlyFiles` に入らず、従来どおり fail。評価器を `typeOnlyFiles` 無しで直呼びする既存テストは分岐に到達すらしないため不変。
- **TC-CLG-03**（DA 無し行の pass）: 判定 3 は不変。type-only 判定は判定 2（SF 不在）にのみ介入する。
- **include / exclude / threshold**: 判定 1・判定 4 は不変。
- 既存テストは**編集しない**。新規テストは別ファイルに置く（後述 T-04）ことで「changed-line-coverage テスト 26 件が無改変で green」を満たす。

## Risks / Trade-offs

- **[Risk] 字句判定の偽陽性で runtime コードを skip（gate の抜け穴）** → **Mitigation**: D2 の許可リスト + 安全不変条件（疑わしきは false）+ 判定表テストで禁止構文（enum / const enum / class / 値 export / 値 import / 式文 / 関数宣言 / ASI 混在）を網羅固定。偽陽性が起きるには許可リーダ集合に無いトークンが許可文へ吸収される必要があり、consume の早期終端バイアスで構造的に排除する。
- **[Trade-off] 偽陰性（type-only なのに false）で一部の型のみファイルが従来どおり fail** → **許容**: request の方針どおり。テンプレートリテラル型 / インライン `import { type X }` / const 型パラメータ等の稀な形は false に倒れるが、検出力は下がらず #884 の実例（interface + JSDoc、複数行 union の `export type`）は解消する。将来必要なら別 request。
- **[Risk] working-tree と HEAD のソース差異** → **Mitigation**: verification は job worktree の committed HEAD 断面で走り、disk == HEAD。既存の lcov 読取りと同一断面で一貫する。
- **[Risk] `skippedFiles` を触って既存 toContain テストを壊す** → **Mitigation**: D3 で `skippedFiles` は不変、type-only は新フィールド `typeOnlySkipped` に分離。

## Open Questions

なし（設計判断は architect 評価で確定済み。採用: 閉集合の保守的字句判定 + ファイル単位判定 + 判定 2 分岐のみへの組み込み。却下: AST/typescript 依存、transpile 実行、exclude glob 手動運用、変更行単位判定）。
