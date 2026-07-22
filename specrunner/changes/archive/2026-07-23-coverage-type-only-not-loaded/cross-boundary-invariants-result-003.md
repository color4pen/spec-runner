# Cross-Boundary Invariants Result — coverage-type-only-not-loaded — iter 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証スコープ

diff が変更していないコードの暗黙の前提を新しい挙動が黙って破っていないかを検出する。

| 対象 | 確認済 |
|------|--------|
| `src/core/verification/runner.ts`（unchanged、PhaseResult / gateResult 利用側） | ✓ |
| `src/core/verification/changed-line-coverage.ts`（modified: EvaluateResult 形状変化）| ✓ |
| `src/core/verification/type-only.ts`（new: isTypeOnlySource の安全不変条件）| ✓ |
| `tests/unit/core/verification/changed-line-coverage.test.ts`（existing 26 tests） | ✓ |
| `EvaluateResult` の外部 consumer 調査 | ✓ |
| `skippedFiles: string[]` 不変条件 | ✓ |
| `TYPE_CONTINUATION_TOKENS` 集合の安全性（偽陽性パス） | ✓ |
| orchestrator の `typeOnlyFiles` 構築タイミングと evaluator の include/exclude 順序 | ✓ |
| 隣接機構 build-fixer への stdout の流れ | ✓ |

変更スコープ（`git diff main...HEAD --stat`）: `src/` 2 ファイル（`changed-line-coverage.ts` +63/-4、`type-only.ts` +476 新規）、`tests/` 2 ファイル新規（+924 行）。

---

## 1. PhaseResult / runner.ts 境界（unchanged 側の前提）

`runner.ts` は `runChangedLineCoverageGate` を呼び出し `gateResult.status` のみを参照する（`:398`, `:599`）。`PhaseResult` の shape は今回の diff で一切変更されていない。`runner.ts` の coverage 配線テストは `runChangedLineCoverageGate` を丸ごと mock しており、ゲート内部の変更は runner テストに波及しない。

**判定: 境界不変 ✓**

---

## 2. EvaluateResult の外部 consumer（additive change の確認）

`evaluateChangedLineCoverage` / `EvaluateResult` / `TypeOnlySkip` / `typeOnlySkipped` は、`changed-line-coverage.ts` 自身とそのテストファイル以外から import されていないことを確認した（`src/` 全体で grep）。

変更は additive:
- `EvaluateInput.typeOnlyFiles?: Set<string>` — optional（省略時は従来動作）
- `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]` — 全経路で `[]` または populated として返される

既存の `evaluateChangedLineCoverage` 呼び出し（`typeOnlyFiles` 省略）は従来どおり not-loaded で fail-closed になる。TC-CLG-05/06 が依存する `skippedFiles.toContain(...)` は不変。

**判定: 境界不変 ✓**

---

## 3. skippedFiles 不変条件

既存テスト TC-CLG-05/06 は `result.skippedFiles.toContain(path)` で path-glob 除外を固定している。新コードは `skippedFiles` に type-only ファイルを追加せず、別フィールド `typeOnlySkipped` に分離している（D3）。TC-008 もこれを明示的に固定している（exclude ファイルが `typeOnlySkipped` に入らないことを確認）。

**判定: 不変条件保持 ✓**

---

## 4. orchestrator の typeOnlyFiles 構築順序

orchestrator は `changedLinesByFile` のうち `!lcov.has(file)` のもののみを読む。evaluator は step 1（include/exclude）→ step 2（lcov 不在）の順で処理する。include 外・exclude 対象のファイルは step 1 で skip され、step 2 の `typeOnlyFiles?.has(file)` には到達しない。exclude されたファイルが `typeOnlyFiles` に入っても evaluator では無視される。TC-008 でこれを確認済み。

**判定: 境界不変 ✓**

---

## 5. build-fixer への波及

gate が failed を返す場合、`stdout` に `not loaded by test suite (absent from lcov)` が含まれ、build-fixer への起動シグナルとなる（`runner.ts:398,599`）。type-only ファイルは `typeOnlySkipped` に分類され failed には入らないため、build-fixer は type-only ファイルに対して誤修正を試みない。これは意図どおりの動作（type-only ファイルにテストを追加しても lcov には載らないため、build-fixer での修正は原理上不可能）。

**判定: 境界不変 ✓**

---

## 6. 安全不変条件（偽陽性ゼロ）の検査 — 主要 finding

設計（design.md D2 / type-only.ts コメント）は「runtime コードを emit し得る文は depth 0 で必ず許可リーダ集合に無いトークンで始まる。consume-to-end は depth 0 の文境界を越えて次の文へリーダ再分類なしに進入しないため、runtime 文が許可文へ吸収されることはない（偽陽性の構造的排除）」と主張する。

この不変条件を敵対的に検査した結果、**`TYPE_CONTINUATION_TOKENS` に `"("` と `"["` が含まれることで偽陽性パスが存在する** ことが判明した。

### 再現シナリオ（手順）

```
Step 1: 以下の内容を持つ TypeScript ファイル src/types.ts を作成する
        （セミコロンなしスタイル、type 宣言の直後に IIFE）:

        export type Status = "ok" | "fail"
        (function() {
          initRuntime()          // runtime コード
        })()

Step 2: src/types.ts は tests/ に import されないため lcov の SF に現れない

Step 3: type 宣言行（例: Status に値を追加）を変更し git commit する

Step 4: changed-line-coverage gate が実行される

Step 5: orchestrator が !lcov.has("src/types.ts") を検出し
        isTypeOnlySource(src) を呼び出す

Step 6: isTypeOnlySource の内部:
        - "export" → "type" → consumeAllowedRest() を呼び出す
        - "Status", "=", 中和済み文字列, "|", 中和済み文字列 を消費
        - "\n" at depth 0: 次トークン "(" → TYPE_CONTINUATION_TOKENS に含まれる → continue!
        - "(" → depth++ = 1
        - "function", "(", ")" → depth 操作で depth = 1 に戻る
        - "{" → depth++ = 2
        - "initRuntime", "(", ")" → 消費
        - "}" → depth-- = 1
        - ")" → depth-- = 0
          → 次トークン "(" → TYPE_CONTINUATION_TOKENS に含まれる → continue!
        - "(" → depth++ = 1
        - ")" → depth-- = 0
          → 次トークン: EOF → return true

Step 7: isTypeOnlySource が true を返す（false positive）

Step 8: src/types.ts が typeOnlyFiles に追加される

Step 9: evaluator が src/types.ts を typeOnlySkipped に分類、failedFiles には入れない

Step 10: gate が passed を返す（runtime コードを持つファイルが検査をすり抜ける）
```

### 根本原因

`TYPE_CONTINUATION_TOKENS` に `"("` が含まれる理由は、multiline function type を正しく処理するためである:

```typescript
type Handler =
  (event: Event) => void   // "(" がないと ASI で type Handler = が空になり false 判定
```

この `"("` が、セミコロンなしスタイルで type 宣言直後の IIFE を「型式の継続」として取り込む副作用を持つ。`"["` も同様（array expression の先頭）。

### 影響範囲の評価

**実際の影響は LOW**:
- セミコロンなし TypeScript スタイルは本 repository では使用されていない（全ファイルセミコロン付き）
- `type X = A` + IIFE のパターンはコーディングスタイルとして極めて稀
- runtime コードを持つファイル（特に IIFE を含む）はモジュールロード時に実行されるため、テストスイートがそのファイルを import すれば lcov に載る
- `#884` の実例（interface + JSDoc、multiline export type union）はいずれもセミコロンまたは `{}` ブロック終端を持つため、このパスには到達しない

**設計主張との乖離**:
設計は「偽陽性を構造的に不可能にする」と明言しているが、上記シナリオでは偽陽性が発生する。この主張は「セミコロン付きの正しい TypeScript 」という暗黙の前提を伴う場合に限り成立する。

### options

**A: 現状の制約として文書化し accept する**
design.md / type-only.ts のコメントに「セミコロンなしスタイルで type 宣言直後に `(` または `[` で始まる runtime 式文が続く場合は false negative 扱い（偽陰性として現行 fail に倒れる）ではなく偽陽性となり得る」と明記し、実際の検知対象は #884 の実例（セミコロン付きまたは `{}` 終端の type-only ファイル）に限定されることを明文化する。

**B: `(` を TYPE_CONTINUATION_TOKENS から除き multiline function type を別途処理する**
multiline function type `type F =\n  (x: number) => void` の正しい処理には、type 本体が `=` の直後から始まることを検知してから `(` を continuation として扱う追加ロジックが必要になる。実装が複雑化し新たな edge case を生む可能性があるため慎重な設計が必要。

---

## 7. まとめ

| 観点 | 結果 |
|------|------|
| runner.ts PhaseResult 境界 | 不変条件保持 ✓ |
| EvaluateResult external consumer | なし（モジュール内部のみ）✓ |
| skippedFiles 不変条件 | 保持 ✓ |
| typeOnlyFiles 構築と include/exclude 順序 | 正常（step 1 先行） ✓ |
| build-fixer への誤起動 | なし ✓ |
| isTypeOnlySource 偽陽性パス | **`(` `[` 継続トークンによる IIFE 吸収パスあり（セミコロンなしスタイル限定）** ⚠ |
