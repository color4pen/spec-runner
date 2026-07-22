# changed-line-coverage の not-loaded 判定を type-only ファイルで誤検出させない

## Meta

- **type**: spec-change
- **slug**: coverage-type-only-not-loaded
- **base-branch**: main
- **adr**: true

## 背景

changed-line-coverage gate は、変更された対象ファイルが lcov に存在しない場合を fail-closed で fail させる(not-loaded)。しかし **型のみのファイル**(interface / type エイリアスのみで runtime コードを持たない)はコンパイルで消去され、いかなるテストからも lcov に載り得ないため、コメント 1 行の編集でも構造的に必ず fail する(#884。実例: `src/kernel/reviewer-snapshot.ts` の JSDoc 拡張が `not loaded by test suite (absent from lcov)` で verification を fail させ、build-fixer では正当に解消不能なため運用でコメントを削除して回避した)。

なお「ファイルは lcov に載っているが変更行に DA レコードが無い」場合は既存の分岐が非実行行として pass させており(TC-CLG-03)、欠けているのは**ファイル全体が消去されて lcov に SF レコード自体が無い**場合の扱いだけである。

## 現状コードの前提

- `src/core/verification/changed-line-coverage.ts:97-101` — `evaluateChangedLineCoverage` の判定 2: `if (!lcov.has(file))` → `failedFiles.push({ file, reason: "not-loaded" })`。この時点で参照できるのは file パスと変更行番号の Set のみ(**ファイル内容もhunk テキストも無い**)
- `src/core/verification/changed-line-coverage.ts:113-116` — 判定 3: lcov に存在し変更行に DA レコードが無い場合は非実行行として pass(型定義・コメントの既存の受け皿。TC-CLG-03 が固定)
- `src/core/verification/changed-line-coverage.ts:148-149` — 失敗文言 `not loaded by test suite (absent from lcov)`
- `src/core/verification/changed-lines.ts:125-173` — 変更ファイル・変更行の導出。per-file の `git diff --unified=0` テキストは hunk header の行番号抽出後に破棄される
- `src/core/verification/changed-line-coverage.ts:85-95` — 既存の除外は include / exclude の path glob のみ(内容ベースの判定は存在しない)
- `package.json` — `typescript` は devDependency であり runtime import 不可。他に AST parser 依存は無い
- 既存テスト: `tests/unit/core/verification/changed-line-coverage.test.ts`(TC-CLG-03 / TC-CLG-04 ほか 26 件)。TC-CLG-04 が not-loaded fail-closed を固定している
- gate の失敗は verification verdict "failed" → build-fixer 呼び出しに接続される(`src/core/verification/runner.ts:398,599`)が、型のみファイルの not-loaded は build-fixer が正当に解消できない(テスト追加では lcov に載らず、dead export の追加は coverage gate 回避として禁止)

## 要件

### R1: 保守的な type-only 判定(pure 関数)

ファイルのソース全文を入力に取り、そのファイルが**確実に runtime コードを生成しない**場合に限り true を返す pure 関数を追加する。判定は許可構文の閉集合で行う:

- 許可: 空行 / コメント / `import type` / `export type`(re-export 含む)/ `interface` 宣言 / `type` エイリアス宣言 / `declare` 宣言 / 値を伴わない `export {}` / `export type {...}`
- 上記で説明し尽くせない構文が 1 つでもあれば false(runtime コードの可能性)。特に `enum` / `const enum` / `class` / 値 import / 値 export / 式文は false
- **偽陽性(runtime コードを持つのに type-only と判定)を構造的に不可能にする**方向に倒す。偽陰性(type-only なのに false)は許容し、その場合は現行どおり fail する(fail-open にしない)

外部依存(typescript 等)を追加せず、構文の許可判定は自前の字句走査で実装する。判定表(構文 × 判定)をテストで網羅する。

### R2: not-loaded 分岐への組み込み

判定 2(`!lcov.has(file)`)で fail する前に、対象ファイルのソースを読み R1 判定を適用する。type-only と判定された場合は fail せず skip 扱いにし、skippedFiles に理由(type-only)付きで記録して結果表示に含める(観測可能性)。ソースが読めない場合は現行どおり fail(fail-closed)。

### R3: 挙動保存

- runtime コードを持つファイルの not-loaded fail(TC-CLG-04)は不変
- lcov 内・DA 無し行の pass(TC-CLG-03)は不変
- include / exclude glob・threshold の挙動は不変

## スコープ外

- 変更行単位の型・コメント判定(hunk テキストの plumbing 変更が必要。ファイル単位判定で #884 の実例は解消する)
- lcov 生成側(coverage provider)の設定変更
- test-coverage.ts(TC-ID 検査。本件と無関係)
- vacuous green(全 skip で pass)側の checker 精度(逆方向の既知問題)

## 受け入れ基準

- [ ] type-only ファイル(interface / type / import type / declare / コメントのみ)の判定関数が true を返し、runtime 構文(enum / const enum / class / 値 export / 値 import / 式文 / 関数宣言)を 1 つでも含むと false を返すことを判定表テストで網羅固定する
- [ ] lcov に SF が無い type-only ファイルの変更が gate を fail させず、skip 理由付きで結果に記録されることをテストで固定する(#884 実例の再現解消)
- [ ] lcov に SF が無い runtime ファイルの変更は現行どおり fail することをテストで固定する(TC-CLG-04 不変)
- [ ] ソース読取り失敗時に fail することをテストで固定する(fail-closed)
- [ ] 修正前の挙動(内容非参照の not-loaded 一律 fail)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] 既存の changed-line-coverage テスト 26 件が無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 許可構文の閉集合による保守的字句判定**。「型であることの証明」を許可リストで行い、未知構文は全て runtime 扱い(fail 維持)にすることで、偽陽性(gate の抜け穴)を構造的に排除する。判定不能は現状維持の fail に落ちるため、この変更で検出力は一切下がらない。
- **採用: ファイル単位判定 + not-loaded 分岐のみへの組み込み**。#884 の構造的偽陽性は「ファイル全体が消去される」場合に限られ、部分的に型を含むファイルは既存の DA 無し分岐(TC-CLG-03)が既に受けている。
- **却下: typescript / AST parser の runtime 依存追加** — 依存極小の方針に反する。閉集合の字句判定で必要十分。
- **却下: transpile 実行による消去確認(Bun.Transpiler 等)** — runtime(bun / node)依存の可搬性リスクと、gate 内でのコード実行という新たな面を増やす。pure 字句判定で足りる。
- **却下: exclude glob への手動登録運用** — 新しい型のみファイルの追加ごとに設定が腐り、偽陽性が再発する。
- **却下: 変更行単位の判定** — hunk テキストの API 変更が必要で、ファイル単位で実例が解消する以上は過剰。将来必要になれば別 request。
