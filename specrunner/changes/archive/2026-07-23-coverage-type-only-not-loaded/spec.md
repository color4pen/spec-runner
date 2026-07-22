# Spec: changed-line-coverage の type-only ファイル not-loaded 誤検出解消

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: type-only 判定は許可構文の閉集合で行う

ファイルのソース全文を入力に取り、そのファイルが確実に runtime コードを生成しないと閉集合の許可構文だけで説明し尽くせるときに限り true を返す pure 関数を提供する MUST。許可構文は「空行 / コメント / `import type` / `export type`（re-export 含む）/ `interface` 宣言 / `type` エイリアス宣言 / `declare` 宣言 / 値を伴わない `export {}` / `export type {...}`」の閉集合とする MUST。閉集合で説明し尽くせない構文が 1 つでもあれば false を返す MUST。特に `enum` / `const enum` / `class` / 関数宣言 / 値 import / 値 export / 式文を含むと false を返す SHALL。判定は外部依存（typescript 等）を追加せず自前の字句走査で行い、偽陽性（runtime コードを持つのに true）を構造的に不可能にし、偽陰性（type-only なのに false）は許容する SHALL。

#### Scenario: 型のみの構文は true

**Given** ソースが コメント / `import type { A } from "./a"` / `export type B = A | C`（複数行 union）/ `interface I { x: number; y?: string }` / `declare const k: number` / 空の `export {}` のいずれか、またはそれらの組み合わせのみで構成される
**When** type-only 判定関数を適用する
**Then** true を返す

#### Scenario: runtime 構文を 1 つでも含むと false

**Given** ソースが `enum E { A, B }` / `const enum CE { A }` / `class C {}` / `function f() {}` / `export const x = 1` / `export default X` / `export * from "./a"` / `import { a } from "./a"`（値 import）/ `import "./a"`（side-effect）/ `foo()`（式文）のいずれかを含む
**When** type-only 判定関数を適用する
**Then** false を返す

#### Scenario: 型宣言と式文が混在すると false（偽陽性の排除）

**Given** ソースが `type X = A` に続いて式文 `foo()` を含む（セミコロン有無いずれも）
**When** type-only 判定関数を適用する
**Then** false を返す（型宣言部分に式文が吸収されない）

### Requirement: lcov に SF が無い type-only ファイルは fail させず理由付きで skip する

changed-line-coverage gate は、変更ファイルが lcov に存在しない（SF レコードが無い）とき、fail-closed で fail させる前に対象ファイルのソースを読み type-only 判定を適用する MUST。type-only と判定されたファイルは fail させず skip 扱いにし、理由（type-only）付きで結果に記録して結果表示に含める MUST。

#### Scenario: lcov に無い type-only ファイルの変更は gate を fail させない

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/types.ts` が lcov に SF レコードとして一切存在せず、かつそのソースが type-only（interface / type / コメントのみ）である
**When** gate が判定する
**Then** status は failed にならず、`src/types.ts` は failedFiles に含まれず、type-only の skip として理由付きで結果に記録される

### Requirement: lcov に SF が無い runtime ファイルは従来どおり fail する

changed-line-coverage gate は、変更ファイルが lcov に存在せず、かつそのソースが type-only でない（runtime コードを含む）とき、従来どおり fail-closed で fail させる MUST。

#### Scenario: lcov に無い runtime ファイルの変更は fail する

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/bar.ts` が lcov に SF レコードとして存在せず、かつそのソースが runtime コード（関数・値等）を含む
**When** gate が判定する
**Then** status は failed で、失敗ファイル一覧に `src/bar.ts` が reason `not-loaded` で含まれる

### Requirement: ソース読取り失敗は fail-closed

changed-line-coverage gate は、lcov に存在しない変更ファイルのソースを読み取れない場合、type-only と判定せず従来どおり fail-closed で fail させる MUST。読取り失敗を type-only skip として素通りさせない SHALL。

#### Scenario: ソースが読めないと fail する

**Given** `include: ["src/**"]` を宣言し、変更ファイル `src/gone.ts` が lcov に存在せず、かつそのソースファイルが読取り不能（不在等）である
**When** gate が判定する
**Then** status は failed で、失敗ファイル一覧に `src/gone.ts` が含まれる

### Requirement: 既存の changed-line-coverage 挙動は不変

type-only 判定の追加は、判定 2（lcov 不在）にのみ介入し、それ以外の既存挙動を変えない MUST。lcov に存在し変更行に DA レコードが無いファイルの pass（非実行行の受け皿）、include / exclude glob による除外、`minChangedLineCoverage` 閾値の評価は不変である MUST。既存の changed-line-coverage テストは無変更で green を保つ SHALL。

#### Scenario: DA レコードが無い変更行は従来どおり pass（判定 3 不変）

**Given** 変更ファイル `src/x.ts` が lcov に存在し、その変更行がいずれも lcov 上 DA レコードを持たない
**When** gate が判定する
**Then** status は passed（type-only 判定は介入しない）

#### Scenario: exclude 宣言ファイルは type-only 判定に関わらず対象外

**Given** `include: ["src/**"]`・`exclude: ["src/generated/**"]` を宣言し、変更ファイル `src/generated/api.ts` が lcov に存在しない
**When** gate が判定する
**Then** `src/generated/api.ts` は skippedFiles に入り fail の原因にならない（従来どおり）
