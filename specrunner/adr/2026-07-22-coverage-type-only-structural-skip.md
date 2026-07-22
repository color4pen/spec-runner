# ADR: coverage gate の type-only ファイル構造的スキップ（許可構文の閉集合による字句判定）

- **Date**: 2026-07-22
- **Status**: Accepted
- **Slug**: coverage-type-only-structural-skip

## Context

`2026-07-08-lcov-changed-line-gate` で追加した changed-line-coverage gate は fail-closed を原則とする。変更対象ファイルが lcov に SF レコードとして存在しない（テスト実行でロードされていない）場合は `not-loaded` として failed を返す。

しかし **type-only ファイル**（interface / type エイリアス / `import type` / `declare` のみで構成され runtime コードを生成しないファイル）は tsc トランスパイルで消去されるため、いかなるテストからも lcov の SF レコードとして現れ得ない。これにより、type-only ファイルへのコメント 1 行の変更でも gate が構造的に必ず fail するという false-positive が発生した（#884。実例: `src/kernel/reviewer-snapshot.ts` の JSDoc 拡張が `not loaded by test suite (absent from lcov)` で verification を fail させ、build-fixer では正当に解消できず、運用でコメントを削除して回避した）。

現行の受け皿は 2 種類あったが、どちらも本件には対応できない。

- **判定 3**（DA なし行 pass）: SF レコードは lcov に存在するが変更行に DA レコードが無い場合を pass とする（TC-CLG-03）。これは「SF はあるが該当行が非実行行」のケースだけを受ける。**「SF 自体が無い」ケースは受けられない**。
- **include / exclude glob**: path ベースの除外のみ。**内容ベースの判定は存在しない**。新しい type-only ファイルを追加するたびに exclude へ手動登録が必要になり、設定の腐敗と再発を招く。

build-fixer による自動解消も構造的に不可能である。テストを追加しても type-only ファイルは lcov に載らず、dead export を追加することは coverage gate 回避として禁止されている。

## Decision

type-only ファイルを content ベースで判定し、`!lcov.has(file)` 分岐で自動的にスキップする機構を追加する。

核心的な設計選択:

1. **許可構文の閉集合による保守的字句判定**（外部依存追加なし）。「型であることの証明」を許可リストで行い、未知構文は全て runtime 扱い（false）に倒す。偽陽性（gate の抜け穴）を構造的に排除する。偽陰性（type-only なのに false）は許容し、その場合は現行どおり fail（fail-open にしない）。
2. **評価器の純粋性を保つため、型ファイル集合をデータ（`typeOnlyFiles?: Set<string>`）として注入する**。ソース読取り（I/O）は orchestrator が担い、純関数評価器は Set を受け取るだけにする。
3. **include/exclude skip（`skippedFiles`）と type-only skip（`typeOnlySkipped`）を分離する**。既存の `skippedFiles` の型・意味・出力文言は不変とし、TC-CLG-05/06 の toContain 固定を壊さない。
4. **ファイル単位判定 + not-loaded 分岐のみへの組み込み**。#884 の構造的 false-positive は「ファイル全体が消去される」場合に限られ、部分的に型を含むファイルは既存の DA なし分岐（TC-CLG-03）が既に受けている。
5. **ソース読取り失敗時は fail-closed**（`typeOnlyFiles` に追加しない → 従来どおり not-loaded fail）。

## Design Decisions

### D1: 許可構文の閉集合による自前字句走査（新規 pure module）

`src/core/verification/type-only.ts` に `isTypeOnlySource(source: string): boolean` を追加する。判定は 2 段で行う。

**(a) トークナイズ（コメント・文字列の中和）**

- `//` 行コメント / `/* */` ブロックコメント（JSDoc 含む）→ 除去。ブロック未終端 → false
- `'...'` / `"..."` 文字列（エスケープ対応）→ プレースホルダに中和。未終端 → false
- バッククォート（テンプレートリテラル）→ **false**（テンプレートリテラル型は許可集合外。偽陰性許容）
- コード文脈の裸 `/`（除算 / 正規表現）、`@`（デコレータ）→ **false**（runtime）
- 上記以外の未知文字 → **false**

**(b) top-level statement 分類**（brace/paren/bracket の深さを追跡し depth 0 の文を対象）

各 top-level 文の先頭トークンが以下の**許可リーダ**のいずれかに一致しなければ false:

- `;`（空文）
- `import` の直後が `type` → 許可。それ以外の `import`（値 import / side-effect import）→ false
- `export` の直後が `type` / `interface` / `declare` → 許可。`export {}` 空 → 許可。それ以外（`*` / `default` / `const` / `function` / `class` / `enum` / `=` / 非空 `{...}`）→ false
- `interface` / `type` / `declare`

consume-to-end は depth 0 の文境界を越えて次の文へリーダ再分類なしに進入しないため、runtime 文が許可文へ吸収されることはない（**安全不変条件**）。

- **Rationale**: 「疑わしきは false」に一貫して倒すことで、runtime 構文を type-only へ取り込む偽陽性を構造的に排除する。判定不能は現状維持の fail に落ちるため、この変更で gate の検出力は一切下がらない。ゲートが走る時点では typecheck が必ず passed 済みであるため、正しい TypeScript に閉集合判定を当てることが保証される。
- **却下案**: 禁止トークンのブラックリスト走査 → 列挙漏れが偽陽性（抜け穴）になり、閉集合の要件に反する。

### D2: 評価器への Set データ注入（評価器の純粋性を保つ）

`EvaluateInput` に `typeOnlyFiles?: Set<string>` を追加する。判定 2 を次のように拡張する:

```
!lcov.has(file) のとき:
  typeOnlyFiles が file を含む → skip（typeOnlySkipped に { file, reason: "type-only" } を記録）
  それ以外                     → 従来どおり failedFiles.push({ file, reason: "not-loaded" })
```

`typeOnlyFiles` が省略された既存呼び出しでは従来どおり fail-closed になり、TC-CLG-04 と既存 26 テストは無変更で green を保つ（additive change）。

- **Rationale**: ソース読取りは I/O。純関数評価器に I/O 結果をデータとして渡すことで、評価器は決定的・同期・純粋を保ち、fixture テストで全分岐を固定できる。
- **却下案**: 評価器に read+classify のコールバックを注入 → 純粋性の議論が濁る。Set のデータ注入が最も明快。

### D3: `skippedFiles`（path glob 除外）と `typeOnlySkipped` を分離する

`EvaluateResult` に `typeOnlySkipped: TypeOnlySkip[]`（`TypeOnlySkip = { file: string; reason: "type-only" }`）を追加する。`skippedFiles: string[]`（include/exclude 除外）の型・意味・出力文言は不変とし、type-only skip はそこへ入れない。

- **Rationale**: TC-CLG-05/06 が `skippedFiles.toContain(<string>)` を固定しており、構造を変えると挙動保存に反する。また `skippedFiles` の意味は「coverage 対象外（path glob）」であり、include 内にある type-only ファイルとは意味が異なるため、理由別に分離するのが正しい。
- **却下案**: `skippedFiles` を `{file, reason}[]` に変更 → 既存テストと挙動保存を破る。

### D4: orchestrator が type-only 候補を読んで Set を構築する。読取り失敗は fail-closed

`runChangedLineCoverageGate` の evaluate 呼び出し前に、`typeOnlyFiles` を構築する:

- `changedLinesByFile` のキーのうち `!lcov.has(file)`（判定 2 に到達し得る候補）についてのみ `fs.readFile(path.resolve(cwd, file), "utf-8")` でソースを読む。
- 読めたら `isTypeOnlySource(src)` を適用し、true なら `typeOnlyFiles` に追加する。
- 読めなかった場合（例外）は追加しない → 評価器で従来どおり not-loaded fail（fail-closed）。

- **Rationale**: 読取り対象を「lcov 不在の変更ファイル」に限定することで、in-lcov ファイルの無駄読みを避ける。ソース読取りは worktree の HEAD 断面（committed 状態）から行われ、lcov 読取りと同じ disk 断面で一貫する。
- **却下案**: 全変更ファイルを無条件に読む → in-lcov ファイルの無駄読みが増える。

## Alternatives Considered

### Alternative 1: TypeScript / AST parser の runtime 依存追加

`typescript` パッケージの AST を使って正確な type-only 判定を行う案。

- **Pros**: 言語仕様に忠実な判定。テンプレートリテラル型・const 型パラメータ等の稀な形も正確に扱える。
- **Cons**: `typescript` は devDependency のため runtime import 不可。runtime に追加すれば依存極小（Minimal-deps North Star）の原則に反する。
- **Why not**: 閉集合の字句判定で #884 の実例（interface + JSDoc、複数行 union の `export type`）を解消するのに AST は不要。

### Alternative 2: Bun.Transpiler 等によるトランスパイル実行で出力空を確認

ファイルをトランスパイルし、出力が空であることを確認する案。

- **Pros**: 実際のコンパイル結果に基づく判定のため偽陰性がゼロに近い。
- **Cons**: runtime（bun/node）依存の可搬性リスク。gate 内でのコード実行という新たな面を増やし、gate の信頼性保証が複雑化する。
- **Why not**: pure な字句判定で必要十分。gate 内でコードを実行する設計は原則に反する。

### Alternative 3: exclude glob への手動登録運用

type-only ファイルを `verification.coverage.exclude` に手動で列挙する案。

- **Pros**: 実装コストがゼロ。
- **Cons**: 新しい type-only ファイルを追加するたびに設定登録が必要になり、設定が腐敗して偽陽性が再発する。人間の判断を gate に挟む構造になる。
- **Why not**: 「LLM / 人間の判断をゲートに挟まない」原則に反する。content ベースの自動判定が正しい解。

### Alternative 4: 変更行単位の type/comment 判定

hunk テキストから変更行が型定義・コメントのみかを判定し、that 行のみ除外する案。

- **Pros**: ファイルに runtime コードが混在する場合も、変更行が型定義のみなら pass にできる。
- **Cons**: `changed-lines.ts` の hunk テキストは行番号抽出後に破棄されており、plumbing の API 変更が必要。
- **Why not**: ファイル単位判定で #884 の実例が解消する以上、plumbing 変更を伴う変更行単位判定は過剰。将来必要なら別 request。

### Alternative 5: fail-open（lcov 不在の type-only ファイルを常に skipped 扱い）

ソースを読まずに lcov 不在ファイルをデフォルトで skipped に分類する案。

- **Pros**: 実装が最もシンプル。
- **Cons**: runtime コードを含むファイルが lcov に載らないケース（テスト未作成・import 経路のバグ等）も全て素通りし、gate の意味を失う。
- **Why not**: fail-closed 原則の核心を破壊する。「type-only と証明できた場合のみスキップ」が正しい。

## Consequences

- **additive 変更**: `EvaluateInput.typeOnlyFiles` は optional のため、既存の全呼び出し・既存 26 テストは無変更で green を保つ。
- **#884 の構造的解消**: type-only ファイルへの変更（interface 宣言の追加・JSDoc 拡張・multiline export type 宣言等）が gate を fail させなくなる。
- **偽陰性の残余**: テンプレートリテラル型 / インライン `import { type X }` / const 型パラメータ等の稀な形は偽陰性（type-only なのに false）となり、従来どおり fail する。検出力は下がらない。将来必要なら別 request で対応する。
- **fail-closed の保持**: ソース読取り失敗時は従来どおり not-loaded fail。runtime コードを持つファイルは `isTypeOnlySource` が false を返すため、`typeOnlyFiles` に入らず従来どおり fail。
- **観測可能性**: `typeOnlySkipped` が非空のとき stdout に `Type-only (no runtime code, absent from lcov): <files>` を追記するため、スキップされたファイルが可視化される。

## References

- Request: `specrunner/changes/coverage-type-only-not-loaded/request.md`
- Design: `specrunner/changes/coverage-type-only-not-loaded/design.md`
- Related ADR: `specrunner/adr/2026-07-08-lcov-changed-line-gate.md`（changed-line-coverage gate の確立。本 ADR はその fail-closed 判定 2 に対する type-only 例外機構を記録する）
- Issue: #884（type-only ファイルの not-loaded 誤検出の実例）
