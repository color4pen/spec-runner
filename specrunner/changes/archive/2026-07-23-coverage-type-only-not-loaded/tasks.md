# Tasks: changed-line-coverage の type-only ファイル not-loaded 誤検出解消

> 依存順:
> T-01（type-only 判定 pure module）→ T-02（評価器組み込み）→ T-03（orchestrator 配線）。T-04（テスト）は各実装後。
> 実装は `node:fs/promises` / `node:path` と既存 `util` のみを用い、外部依存（typescript / AST parser 等）を追加しない。`bun:*` / `Bun.*` は使わない。
> runner.ts / runner の coverage 配線テストには変更を加えない（ゲート内部の変更のみで完結する。runner テストは `runChangedLineCoverageGate` を mock している）。

## T-01: type-only 判定の pure module `type-only.ts` を追加する

- [x] `src/core/verification/type-only.ts`（新規）に純関数 `isTypeOnlySource(source: string): boolean` を追加する。外部依存なし（`node:*` すら不要な純字句処理）。
- [x] トークナイズ（コメント・文字列の中和）を実装する:
  - `//` 行コメント / `/* */` ブロックコメント（JSDoc `/** */` 含む）を除去する。ブロックコメント未終端 → false。
  - `'...'` / `"..."` 文字列（バックスラッシュエスケープ対応）をプレースホルダに中和する。未終端 → false。
  - バッククォート（テンプレートリテラル）を検出したら false（許可集合外、偽陰性許容）。
  - コード文脈の裸 `/`（コメント開始でない）→ false（除算/正規表現 = runtime）。コード文脈の `@`（デコレータ）→ false。
  - 単語 `[A-Za-z_$][\w$]*` / 数値 / 区切り記号をトークン化する。上記いずれにも該当しない文字 → false。
- [x] top-level statement 分類を実装する（`{` `(` `[` で depth++、`}` `)` `]` で depth--。depth 0 の文の先頭トークンを判定）。許可リーダのみ true 経路とし、それ以外は false:
  - `;`（空文）。
  - `import` の直後が `type` → 許可。それ以外の `import`（値 import / default import / `import "..."` side-effect）→ false。
  - `export` の直後が `type` / `interface` / `declare` → 許可。`export` の直後が `{` かつ即 `}`（空）→ 許可。それ以外の `export`（`*` / `default` / `const` / `let` / `var` / `function` / `class` / `enum` / `=` / 非空 `{...}`）→ false。
  - `interface` / `type` / `declare` → 許可。
  - 上記以外の先頭トークン（`class` / `enum` / `function` / `const` / `let` / `var` / 識別子で始まる式文 等）→ false。
- [x] consume-to-end（許可文の終端検出）を安全側=早期終端バイアスで実装する:
  - depth 0 の `;` で終端。
  - depth 0 で文境界（閉じ括弧で depth が 0 に戻った直後、または depth 0 の改行）に達したら、直後トークンが型継続トークン（`|` `&` `?` `:` `.` `,` `<` `>` `(` `[` `)` `]` `=>` `extends` `keyof` `typeof` `infer` `readonly` `in` `as` `is` `asserts` `from`）でない限り終端し、直後トークンを次の文のリーダとして再分類する。直前トークンが二項/開き演算子で明らかに継続する場合（複数行 union の行頭 `|` 等）は終端しない。
  - 許可文を消費中に EOF に達し、禁止構文を 1 つも検出しなければ true。
- [x] 安全不変条件をコメントで明記する: runtime を emit し得る文は depth 0 で必ず許可リーダ集合外のトークンで始まり、consume は depth 0 の文境界を越えてリーダ再分類なしに次文へ進入しないため、runtime 文が許可文へ吸収されない（偽陽性の構造的排除）。この不変条件はゲート実行時点で typecheck が passed 済み（入力が正しい TS）であることに依存する。

**Acceptance Criteria**:
- 型のみ構文（interface / type / import type / declare / コメントのみ、複数行 union、空 `export {}`、それらの組み合わせ）で true を返す。
- runtime 構文（enum / const enum / class / 関数宣言 / 値 export / 値 import / side-effect import / `export *` / `export default` / 式文）を 1 つでも含むと false を返す。
- `type X = A` + 式文 `foo()`（セミコロン有無いずれも）の混在で false を返す。
- 空ファイル / 空白のみ / コメントのみ → true。
- `typecheck` が green。

## T-02: 評価器 `evaluateChangedLineCoverage` に type-only skip 分岐を組み込む

- [x] `src/core/verification/changed-line-coverage.ts` の `EvaluateInput` に optional な `typeOnlyFiles?: Set<string>` を追加する（省略時は従来挙動）。
- [x] `EvaluateResult` に `typeOnlySkipped: TypeOnlySkip[]` を追加する。`export interface TypeOnlySkip { file: string; reason: "type-only" }`（reason は `export type SkipReason = "type-only"` として定義してもよい）を追加する。
- [x] 判定 2（`!lcov.has(file)`）を拡張する:
  - `typeOnlyFiles?.has(file)` が true → `typeOnlySkipped.push({ file, reason: "type-only" })` して continue（fail させない）。
  - それ以外 → 従来どおり `failedFiles.push({ file, reason: "not-loaded" })`。
- [x] `stdout` は、`typeOnlySkipped` が非空のときのみ専用の 1 行（例: `  Type-only (no runtime code, absent from lcov): <files カンマ区切り>`）を追記する。既存の passed サマリ行・`Skipped (not in coverage surface)` 行の文言は変更しない。
- [x] `skippedFiles: string[]`（include/exclude 除外）の型・意味・出力文言は不変に保つ。type-only skip は `skippedFiles` に入れない。
- [x] `EvaluateResult` を返す全経路で `typeOnlySkipped` を含める（passed / failed 両方）。

**Acceptance Criteria**:
- `typeOnlyFiles` に含まれる lcov 不在ファイルは failedFiles に入らず `typeOnlySkipped` に理由付きで記録され、他の failure が無ければ status は passed。
- `typeOnlyFiles` に含まれない lcov 不在ファイルは従来どおり `failedFiles`（reason `not-loaded`）で fail。
- `typeOnlyFiles` を省略した呼び出しでは従来挙動（lcov 不在 → not-loaded fail）が完全に不変。
- `typecheck` が green。

## T-03: orchestrator `runChangedLineCoverageGate` でソースを読み `typeOnlyFiles` を構築する

- [x] `src/core/verification/changed-line-coverage.ts` に `isTypeOnlySource` を import する。
- [x] `evaluateChangedLineCoverage` 呼び出し前に `typeOnlyFiles: Set<string>` を構築する:
  - `changedLinesByFile` のキーのうち `!lcov.has(file)` のファイルについてのみ処理する。
  - `fs.readFile(path.resolve(cwd, file), "utf-8")` でソースを読む。読めたら `isTypeOnlySource(src)` が true のとき `typeOnlyFiles.add(file)`。
  - 読取りが例外（不在等）→ `typeOnlyFiles` に**追加しない**（評価器で not-loaded fail = fail-closed）。
- [x] 構築した `typeOnlyFiles` を `evaluateChangedLineCoverage(...)` の入力に渡す。
- [x] `PhaseResult` 生成ロジック（phase 名・exitCode・durationMs 等）は不変。ソース読取りは worktree の HEAD 断面（既存の lcov 読取りと同一 disk 断面）から行う。

**Acceptance Criteria**:
- lcov に無い type-only ソースを持つ変更ファイルがあると、gate の `PhaseResult` は status passed（他 failure が無い場合）で、type-only skip が `stdout` に可視化される。
- lcov に無い runtime ソースを持つ変更ファイルは status failed（従来どおり）。
- 変更ファイルのソースが読めない場合は status failed（fail-closed）。
- `typecheck` が green。

## T-04: 新規テストで受け入れ基準を固定する（既存テストは無改変）

- [x] **判定表テスト（T-01）**: `tests/unit/core/verification/type-only.test.ts`（新規）に `isTypeOnlySource` の判定表を網羅する。
  - true: interface / `type`（複数行 union 含む）/ `import type` / `export type`（re-export）/ `declare` / 空 `export {}` / コメントのみ / 空ファイル / 組み合わせ。
  - false: `enum` / `const enum` / `class` / 関数宣言 / `export const` / `export function` / `export default` / `export *` / 値 import / side-effect import / 式文 / `type X = A` + `foo()` 混在 / テンプレートリテラル含み。
- [x] **評価器テスト（T-02）**: `tests/unit/core/verification/changed-line-coverage-type-only.test.ts`（新規、既存 `changed-line-coverage.test.ts` は触らない）に評価器の分岐を固定する。
  - `typeOnlyFiles` に含まれる lcov 不在ファイル → skip、`typeOnlySkipped` に `{ file, reason: "type-only" }` が記録、status passed。
  - `typeOnlyFiles` に含まれない lcov 不在ファイル → `failedFiles`（reason `not-loaded`）、status failed。
- [x] **orchestrator テスト（T-03）**: 同新規ファイルに、一時ディレクトリ + 差し替え可能 spawn（既存 `runner`/`gate` テストの `makeFakeSpawn` 方式）で以下を固定する。
  - lcov に無い + disk 上に type-only ソースを書いた変更ファイル → gate passed、type-only skip が stdout に含まれる（#884 実例の再現解消: 例として複数行 `export type` union または interface + JSDoc のソースを使う）。
  - lcov に無い + disk 上に runtime ソース（関数等）を書いた変更ファイル → gate failed（TC-CLG-04 相当が不変）。
  - lcov に無い + disk 上にソースファイルが存在しない（読取り失敗）変更ファイル → gate failed（fail-closed）。
- [x] **破壊確認（mutation check）を記録する**: TC-004 / TC-013 のテストコメントに記録済み。`evaluateChangedLineCoverage` の type-only skip 分岐を除去すると TC-004（type-only ファイルが failedFiles に入り status=failed になる）および TC-013（gate が failed を返す）が fail する。これらのテストは新分岐に真に依存している。
- [x] **既存挙動不変の確認**: 既存 `tests/unit/core/verification/changed-line-coverage.test.ts` を**無改変**で green。runner の coverage 配線テストも無改変で green（全 8993 件 pass 確認済み）。

**Acceptance Criteria**:
- request の受け入れ基準（判定表の網羅固定 / lcov に SF が無い type-only ファイルが fail せず skip 理由付きで記録 / runtime ファイルは従来どおり fail / ソース読取り失敗で fail / 破壊確認の記録 / 既存 26 件無改変 green）がテストで固定される。
- `bun run typecheck && bun run test` が green。
