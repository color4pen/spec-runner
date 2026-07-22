# Cross-Boundary Invariants Result — coverage-type-only-not-loaded — iter 004

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証スコープ

resume context に基づく再検証: iter 003 の IIFE 偽陽性 finding（`(` / `[` 継続トークンによる吸収）が C 案（改行を跨ぐ行頭 `(` / `[` を文末扱い）で修正されたことを確認し、新 revision に対して全境界不変条件を再検証する。

| 対象 | 確認済 |
|------|--------|
| IIFE 修正の実装（ASI 経路・block-close 経路） | ✓ |
| F-IIFE テスト群の破壊テスト | ✓ |
| runner.ts PhaseResult 境界 | ✓ |
| EvaluateResult 外部 consumer | ✓ |
| skippedFiles 不変条件 | ✓ |
| include/exclude と type-only チェックの順序 | ✓ |
| build-fixer への誤起動経路 | ✓ |
| TYPE_CONTINUATION_TOKENS の残余リスク | ✓ |

---

## 1. iter-003 finding の修正確認

### 1a. ASI 経路（改行 at depth 0）

`consumeAllowedRest()` の lines 326-345（`type-only.ts`）:

```typescript
if (tok === "\n" && depth === 0) {
  i++;
  while (i < n && tokens[i] === "\n") i++;
  const next = tokens[i];
  if (next === undefined || !TYPE_CONTINUATION_TOKENS.has(next)) {
    return true;
  }
  // Line-leading `(` / `[` after an ASI point are runtime statement leaders
  if (next === "(" || next === "[") {
    return true;  // ← 修正: 偽陰性側に倒す
  }
  continue;
}
```

`type X = A\n(function initRuntime() { ... })()` の場合:
- `type` → `consumeAllowedRest()`
- `X`, `=`, `A` 消費
- `\n` at depth 0: next は `(` → return `true`（文末）
- main loop: `(` はリーダ集合外 → return `false` ✓

### 1b. block-close 経路（depth 0 への戻り後）

lines 301-321:

```typescript
if (depth === 0) {
  let j = i;
  while (j < n && tokens[j] === "\n") j++;
  const next = tokens[j];
  if (next === undefined || !TYPE_CONTINUATION_TOKENS.has(next)) {
    return true;
  }
  if ((next === "(" || next === "[") && j !== i) {
    return true;  // ← 修正: 改行を跨ぐ場合のみ文末扱い
  }
}
```

`interface X { a: number }\n(function initRuntime() { ... })()` の場合:
- `interface` → `consumeAllowedRest()`
- `X`, `{` → depth++, `a`, `:`, `number`, `}` → depth-- = 0
- `j = i` → `\n` を跨いで `(` を発見。`j !== i` → return `true`（文末）
- main loop: `(` はリーダ集合外 → return `false` ✓

### 1c. 同一行の `(` / `[` は従来どおり継続（挙動保存確認）

`type Rows = { id: number }[]` の場合:
- `{...}` の block-close 後、`j = i`（改行なし）。`[` は `TYPE_CONTINUATION_TOKENS` 内かつ `j === i` → IIFE check 非適用 → 継続 ✓
- `type Handler = (event: string) => void;` の場合: `(` は block-close 後の継続チェックを通らず、直接 depth++ として処理される ✓

### 1d. F-IIFE テスト群の破壊テスト

`tests/unit/core/verification/type-only.test.ts` に `F-IIFE` describe ブロック（lines 290-322）が追加済み:

| テスト | 期待値 | 目的 |
|--------|--------|------|
| type 宣言 + 改行 + IIFE | false | ASI 経路の吸収封鎖 |
| interface ブロック + 改行 + IIFE | false | block-close 経路の吸収封鎖 |
| type 宣言 + 改行 + 行頭 array expression | false | `[` の吸収封鎖 |
| 同一行の array suffix `{...}[]` | true | 挙動保存 |
| 同一行の function type `(x) => void` | true | 挙動保存 |
| 改行を跨ぐ multiline function type | false | 偽陰性側への許容明示 |

コメントに DESTROY 条件を明記:「行頭 `(` `[` の文末扱いを外すと false 期待テストが true になり fail する」。破壊確認が機能している。

**判定: IIFE 偽陽性の修正を確認 ✓**

---

## 2. runner.ts PhaseResult 境界

`git diff main...HEAD -- src/core/verification/runner.ts` の出力なし（runner.ts は無改変）。runner は `runChangedLineCoverageGate` の `gateResult.status` のみを参照する（`:398`, `:599`）。`PhaseResult` の shape は今回の diff で一切変更なし。

**判定: 境界不変 ✓**

---

## 3. EvaluateResult 外部 consumer

`evaluateChangedLineCoverage` / `EvaluateResult` / `TypeOnlySkip` / `typeOnlySkipped` を参照するのは `changed-line-coverage.ts` 自身・そのテストファイルのみ（`src/` 全体で検証済み）。

変更は additive:
- `EvaluateInput.typeOnlyFiles?: Set<string>` — optional（省略時は従来動作）
- `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]` — 全経路で `[]` または populated として返される

TC-010 / TC-017 が `typeOnlyFiles` 省略時の従来動作を固定している。

**判定: 境界不変 ✓**

---

## 4. skippedFiles 不変条件

`typeOnlySkipped` と `skippedFiles` は分離されたフィールドであり、type-only ファイルは `skippedFiles` に入らない（D3 設計どおり）。TC-008 が `skippedFiles.toContain(path)` と `typeOnlySkipped.toHaveLength(0)` で両方を固定している。

**判定: 不変条件保持 ✓**

---

## 5. include/exclude と type-only チェックの順序

evaluator の処理順:
1. include/exclude glob フィルタ（step 1）→ `skippedFiles`
2. `!lcov.has(file)` + `typeOnlyFiles?.has(file)` チェック（step 2）

orchestrator は `changedLinesByFile` のキーのうち `!lcov.has(file)` のものだけソースを読む。include 外・exclude 対象のファイルは step 1 で skip され step 2 に到達しない。exclude 対象のファイルが `typeOnlyFiles` に入っても evaluator では無視される。TC-008 が確認済み。

**判定: 境界不変 ✓**

---

## 6. build-fixer への誤起動経路

gate が `status=failed` を返す条件は:
- runtime コードを持ち lcov に存在しない変更ファイルがある場合（`failedFiles` に not-loaded として記録）
- ソースが読めない変更ファイルが lcov に存在しない場合（fail-closed）

type-only ファイルは `typeOnlySkipped` に分類され `failedFiles` には入らない。build-fixer への起動シグナルは `gateResult.status === "failed"` であり、type-only ファイルに対して誤起動しない。

**判定: 境界不変 ✓**

---

## 7. TYPE_CONTINUATION_TOKENS の残余リスク（観測的 finding）

IIFE 修正で `(` と `[` は後処理された。残る継続トークンのうち、識別子として有効な単語トークン（`from`, `is`, `asserts`）は理論上の偽陽性パスが残存する。

**具体的シナリオ（手順）**:

```
Step 1: 以下のファイル src/types.ts を作成する（valid TypeScript として成立）:
        declare function from(x: string): void;  // ambient 宣言
        export type { MyEvent }                   // 型のみ（セミコロンなし）
        from(initData)                             // runtime 呼び出し

        注: MyEvent は ambient 型、initData は ambient 値と仮定
```

```
Step 2: src/types.ts は tests/ から import されないため lcov に SF として現れない
```

```
Step 3: export type { MyEvent } の行を変更し git commit する
```

```
Step 4: changed-line-coverage gate が実行される
```

```
Step 5: orchestrator が !lcov.has("src/types.ts") を検出し
        isTypeOnlySource(src) を呼び出す
```

```
Step 6: isTypeOnlySource の内部:
        - "declare function from(x: string): void;" → declare ブランチ → consumeAllowedRest()
          → `function`, `from`, `(`, `x`, `:`, `string`, `)`, `:`, `void`, `;` → true
        - "export type { MyEvent }" → export type → consumeAllowedRest()
          → `{` → depth++, `MyEvent`, `}` → depth-- = 0
          → next token（改行を跨いで）: `from`
          → `from` は TYPE_CONTINUATION_TOKENS に含まれる → continue!
          → `from` at depth 0 消費
          → `(` → depth++ = 1, `initData` → depth 1, `)` → depth-- = 0
          → next: EOF → return true
        - EOF で analyzeStatements は true を返す
```

```
Step 7: isTypeOnlySource が true を返す（偽陽性）
```

```
Step 8: src/types.ts が typeOnlyFiles に追加される
```

```
Step 9: gate が passed（runtime コード from(initData) を持つファイルを検査すり抜け）
```

**影響評価**:
- **実現条件**: (a) `from`/`is`/`asserts` 等の名前の ambient global 関数が存在し、(b) それをセミコロンなしスタイルで type 宣言の直後に呼び出している。両方を満たす必要がある。
- **`from` が TYPE_CONTINUATION_TOKENS に必要な理由**: `export type { A } from "./module"` を複数行に分割する合法パターンで `from` は継続として必要（このトークンを除くと `export type { A }\nfrom "./module"` が偽陰性になる）。
- **value import で自己破綻する**: `from` を value import すれば `isTypeOnlySource` は即 false を返すため、この偽陽性は「ambient globals にしか依存しない実行コード」という稀な組み合わせに限定される。
- **実際の影響は LOW**: IIFE（セミコロンなしかつ直後に IIFE が来るパターン）より更に稀。実プロジェクトでこのパターンが意図せず発生する可能性は極めて低い。

**判定: 低リスク観測（NOT blocking）** — IIFE 修正の効果を無効化するような実用的シナリオは構成できない。

---

## 8. まとめ

| 観点 | 結果 |
|------|------|
| IIFE 修正（ASI 経路）| 確認 ✓ |
| IIFE 修正（block-close 経路） | 確認 ✓ |
| F-IIFE 破壊テスト | 機能あり ✓ |
| runner.ts PhaseResult 境界 | 不変 ✓ |
| EvaluateResult 外部 consumer | なし ✓ |
| skippedFiles 不変条件 | 保持 ✓ |
| include/exclude + type-only 順序 | 正常 ✓ |
| build-fixer への誤起動 | なし ✓ |
| 残余 word-continuation 偽陽性 | 低リスク観測（`from`/`is`/`asserts` + ambient global の組み合わせ、実用上極めて稀） |
