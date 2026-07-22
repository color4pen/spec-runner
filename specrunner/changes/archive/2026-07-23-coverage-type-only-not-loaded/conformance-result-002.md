# Conformance Result — coverage-type-only-not-loaded — iter 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証スコープ

Iter 002 は cross-boundary-invariants reviewer（iter 003/004）が発見した IIFE 偽陽性修正を含む最終 revision に対する再検証。

| 文書 | 確認済 |
|------|--------|
| rules.md | ✓ |
| tasks.md（全チェックボックス） | ✓ |
| design.md（D1–D5） | ✓ |
| spec.md（Requirements / Scenarios） | ✓ |
| request.md（受け入れ基準） | ✓ |
| src/core/verification/type-only.ts（IIFE fix 含む最終版） | ✓ |
| src/core/verification/changed-line-coverage.ts | ✓ |
| tests/unit/core/verification/type-only.test.ts（F-IIFE ブロック追加後） | ✓ |
| tests/unit/core/verification/changed-line-coverage-type-only.test.ts | ✓ |
| cross-boundary-invariants-result-003.md（finding） | ✓ |
| cross-boundary-invariants-result-004.md（修正確認） | ✓ |
| verification-result.md（build/typecheck/test/lint/coverage 全 passed） | ✓ |

変更スコープ（`git diff main...HEAD --stat`）: src 2 ファイル変更（+539/-4 行）、tests 2 ファイル新規（+972 行）、変更フォルダ 15 ファイル以上追加。

---

## Judgment 1: tasks.md — チェックボックス完了確認

tasks.md の全チェックボックス（T-01 〜 T-04）がすべて `[x]` で完了。

- **T-01**: `src/core/verification/type-only.ts`（新規）— pure module、外部依存ゼロ。トークナイザ (Phase 1/2) + statement 分類 (Phase 3) の 3 フェーズ構成 ✓
- **T-02**: `EvaluateInput.typeOnlyFiles?: Set<string>` / `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]` 追加。判定 2（`!lcov.has(file)`）拡張 ✓
- **T-03**: orchestrator `runChangedLineCoverageGate` で lcov 不在ファイルのみソースを読み `typeOnlyFiles` を構築、`evaluateChangedLineCoverage` に注入 ✓
- **T-04**: 新規テスト 2 ファイル（判定表/評価器/orchestrator/破壊確認）。verification-result.md で全 8993 件 passed ✓

---

## Judgment 2: spec.md — Requirements & Scenarios 適合性

### Requirement: type-only 判定は許可構文の閉集合で行う

`isTypeOnlySource(source: string): boolean` を `type-only.ts` に実装（外部依存なし）。許可構文の閉集合（コメント / `import type` / `export type` / `interface` / `type` / `declare` / 空 `export {}`）以外は即 false。

**IIFE 偽陽性修正（iter-003 finding への対応）**: `TYPE_CONTINUATION_TOKENS` に `(` / `[` が含まれることで、セミコロンなしスタイルの `type X = A\n(function(){ ... })()` を誤って type-only と判定する偽陽性パスが存在した。修正は以下の 2 経路に適用された:

- **ASI 経路**（`type-only.ts:341-344`）: depth 0 改行後の次トークンが `(` / `[` なら文末扱い（return true → main loop で false）
- **block-close 経路**（`type-only.ts:315-319`）: 閉じ括弧で depth が 0 に戻った後、改行を跨いだ（`j !== i`）`(` / `[` は文末扱い

同一行の `(` / `[`（array suffix `{}[]`、call-signature `(x) => void`）は従来どおり継続として正しく処理される。

**破壊確認**: `F-IIFE` describe ブロック（type-only.test.ts 行 290-322）が 6 テストで修正を固定。DESTROY 条件（行頭 `(` / `[` 文末扱いを外すと false 期待テストが true になり fail）をコメントで明記 ✓

**Scenario: 型のみの構文は true**
→ TC-001（interface / type alias / import type / export type / declare / export {} / JSDoc / 複数行 union / #884 実例）✓
→ F-IIFE: 同一行 array suffix `{}[]` / function type `(x) => void` は true を維持 ✓

**Scenario: runtime 構文を 1 つでも含むと false**
→ TC-002（enum / const enum / class / function / export function / export const / export default / export * / 値 import / side-effect import / 式文 / const / let / template literal）✓
→ F-IIFE: `type X = A\n(IIFE)` → false、`interface X {...}\n(IIFE)` → false ✓

**Scenario: 型宣言と式文が混在すると false（偽陽性の排除）**
→ TC-003: `type X = A;` + `foo()`（セミコロン有無いずれも）/ interface + class / export type + export const の混在 → 全 false ✓

### Requirement: lcov に SF が無い type-only ファイルは fail させず理由付きで skip する

`evaluateChangedLineCoverage` の判定 2: `typeOnlyFiles?.has(file)` が true → `typeOnlySkipped.push({ file, reason: "type-only" })` して continue。stdout に `Type-only (no runtime code, absent from lcov): <files>` を追記（非空時のみ）✓

**Scenario: lcov に無い type-only ファイルの変更は gate を fail させない**
→ TC-004（evaluator）/ TC-013（orchestrator、#884 実例 ReviewerSnapshot + SnapshotStatus ソース）✓

### Requirement: lcov に SF が無い runtime ファイルは従来どおり fail する

`typeOnlyFiles?.has(file)` が false → 従来どおり `failedFiles.push({ file, reason: "not-loaded" })` ✓

**Scenario: lcov に無い runtime ファイルの変更は fail する**
→ TC-005（evaluator）/ TC-014（orchestrator、関数宣言含むソース）✓

### Requirement: ソース読取り失敗は fail-closed

読取り例外 → `typeOnlyFiles` に追加しない → 評価器で `not-loaded` fail ✓

**Scenario: ソースが読めないと fail する**
→ TC-006 / TC-015（orchestrator、ファイル不在ケース）✓

### Requirement: 既存の changed-line-coverage 挙動は不変

- 判定 3（DA レコードなし pass）: `changed-line-coverage.ts:132-143` — 変更なし ✓
- include / exclude / threshold: 変更なし ✓
- `skippedFiles` の型・意味・出力文言「Skipped (not in coverage surface)」: 不変 ✓
- 既存 `changed-line-coverage.test.ts`: `git diff main...HEAD` でゼロ行変更（完全無改変）✓

**Scenario: DA レコードが無い変更行は従来どおり pass（判定 3 不変）** → TC-007 ✓
**Scenario: exclude 宣言ファイルは type-only 判定に関わらず対象外** → TC-008 ✓

---

## Judgment 3: design.md — 設計決定（D1–D5）適合性

**D1: 許可構文の閉集合による自前の字句走査**
→ `type-only.ts`、`node:*` すら import なし（外部依存ゼロ）。未知構文 `??` → false（疑わしきは false）✓

**D2: 字句走査の構造**
→ Phase 1 `stripCommentsAndStrings`: `//` / `/* */` 除去、文字列中和、バッククォート → null、未終端ブロックコメント → null ✓
→ Phase 2 `tokenize`: 単語 / `#NUM` / `=>` / `...` / 区切り記号 / `/` / `@` / `??`（未知）✓
→ Phase 3 `analyzeStatements`: depth 追跡、`TYPE_CONTINUATION_TOKENS` 集合、`consumeAllowedRest` 早期終端バイアス ✓
→ **IIFE 修正は D2 の早期終端バイアスを強化する方向の実装精緻化**。改行を跨ぐ `(` / `[` を文末扱いにすることで偽陰性側に倒す（許容された縮小、D2 設計意図「疑わしきは false」に合致）✓
→ 安全不変条件をモジュール冒頭 JSDoc および `consumeAllowedRest` コメントで明記 ✓

**D3: `typeOnlyFiles: Set<string>` のデータ注入**
→ `EvaluateInput.typeOnlyFiles?: Set<string>`（optional、既存呼び出し側は省略可）✓
→ `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]`（全経路で `[]` または populated）✓
→ `skippedFiles` 不変（TC-CLG-05/06 の `toContain` と TC-008 で固定）✓
→ `typeOnlyFiles` 省略時は従来の not-loaded fail-closed が完全不変（TC-010 / TC-017）✓

**D4: orchestrator が判定 2 候補のソースを読み分類、読取り失敗は fail-closed**
→ `changedLinesByFile` のうち `!lcov.has(file)` のみ `fs.readFile` → `isTypeOnlySource` 適用 ✓
→ 読取り例外 → catch で何もしない → `typeOnlyFiles` に追加されない → fail-closed ✓
→ `path.resolve(cwd, file)` で worktree HEAD 断面から読む ✓

**D5: 挙動保存（R3）**
→ 判定 3 / include / exclude / threshold: 変更なし ✓
→ 既存テストファイル無変更 ✓

---

## Judgment 4: request.md — 受け入れ基準適合性

| AC | 内容 | 根拠 |
|----|------|------|
| AC1 | 判定表テストで type-only → true / runtime → false を網羅固定 | TC-001, TC-002, TC-003, TC-009, F-IIFE（type-only.test.ts）✓ |
| AC2 | lcov 不在 type-only ファイルが fail せず skip 理由付きで記録（#884 解消） | TC-004, TC-013（#884 実例ソース使用）✓ |
| AC3 | runtime ファイルの not-loaded fail が不変（TC-CLG-04 相当） | TC-005, TC-014 ✓ |
| AC4 | ソース読取り失敗時に fail（fail-closed） | TC-006, TC-015 ✓ |
| AC5 | 修正前の挙動に戻すと該当テストが fail することを破壊確認として記録 | TC-004 / TC-013 コメント + F-IIFE DESTROY コメント ✓ |
| AC6 | 既存 changed-line-coverage テスト 26 件が無改変で green | `changed-line-coverage.test.ts` diff ゼロ行、verification-result.md で 8993 件 passed ✓ |
| AC7 | `typecheck && test` が green | verification-result.md: typecheck passed, test 8993 passed ✓ |

---

## 検証できなかった項目

なし。全判定項目を observable な事実（ソースコード、テストコード、diff 出力、cross-boundary-invariants レビュー結果、verification-result.md）で確認した。

---

## Findings 詳細

### 観察 O1（非ブロッキング）: `SkipReason` 型が使用されていない（iter-001 から継続）

`changed-line-coverage.ts:34` に `export type SkipReason = "type-only"` が定義されているが、`TypeOnlySkip.reason` はリテラル型 `"type-only"` を直接使用しており `SkipReason` を参照していない。動作・型安全性への影響なし。

### 観察 O2（非ブロッキング）: `from`/`is`/`asserts` 継続トークンによる低リスク偽陽性パス（iter-004 観察）

`from` が `TYPE_CONTINUATION_TOKENS` に含まれるため、`export type { A }\nfrom(initData)` のような ambient global 呼び出しが `export type { A } from "..."` の継続として吸収される理論上の偽陽性パスが残存する。実現条件は「ambient global 関数名が `from`/`is`/`asserts` でかつセミコロンなしで型 export 直後に呼び出す」という極めて稀な組み合わせ。`from` を除くと `export type { A } from "..."` の複数行分割が偽陰性になるため、トレードオフとして許容範囲。
