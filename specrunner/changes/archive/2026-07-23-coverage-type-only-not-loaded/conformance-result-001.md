# Conformance Result — coverage-type-only-not-loaded — iter 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証スコープ

| 文書 | 確認済 |
|------|--------|
| rules.md | ✓ |
| tasks.md（全チェックボックス）| ✓ |
| design.md（D1–D5） | ✓ |
| spec.md（Requirements / Scenarios） | ✓ |
| request.md（受け入れ基準） | ✓ |
| 実装ファイル（type-only.ts / changed-line-coverage.ts） | ✓ |
| テストファイル（type-only.test.ts / changed-line-coverage-type-only.test.ts） | ✓ |
| verification-result.md（build/typecheck/test/lint/coverage 全 passed） | ✓ |

変更スコープ（`git diff main...HEAD --stat`）: src 2 ファイル変更（+539/-4 行）、tests 2 ファイル新規（+924 行）、変更フォルダ 15 ファイル追加。

---

## Judgment 1: tasks.md — チェックボックス完了確認

tasks.md の全チェックボックス（T-01 〜 T-04）がすべて `[x]` で完了。

- T-01: `src/core/verification/type-only.ts` 新規追加（476 行）— pure module、外部依存ゼロ ✓
- T-02: `EvaluateInput.typeOnlyFiles?: Set<string>` / `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]` 追加、判定 2 拡張 ✓
- T-03: orchestrator で lcov 不在ファイルのソースを読み `typeOnlyFiles` を構築、evaluate に注入 ✓
- T-04: 新規テスト 2 ファイル（T-01 判定表 / T-02 評価器 / T-03 orchestrator / 破壊確認）✓

T-04 Acceptance Criteria「全 8993 件 pass」を verification-result.md で確認 ✓

---

## Judgment 2: spec.md — Requirements & Scenarios 適合性

### Requirement: type-only 判定は許可構文の閉集合で行う

- `isTypeOnlySource(source: string): boolean` を `type-only.ts` に実装（外部依存なし）✓
- 許可構文の閉集合: コメント / `import type` / `export type` / `interface` / `type` / `declare` / 空 `export {}` ✓
- 閉集合外の構文（未知トークン `??` / `@` / `/`）は `analyzeStatements` または `consumeAllowedRest` で即 false ✓
- 偽陽性ゼロ: 早期終端バイアス（`consumeAllowedRest` は depth 0 文境界で次リーダ再判定）により runtime 文が許可文に吸収されない安全不変条件をコメントで明記 ✓

**Scenario: 型のみの構文は true**
→ TC-001（type-only.test.ts）: interface / type alias / import type / export type / declare / export {} / JSDoc / 複数行 union / #884 実例（ReviewerSnapshot + SnapshotStatus）全 true ✓

**Scenario: runtime 構文を 1 つでも含むと false**
→ TC-002（type-only.test.ts）: enum / const enum / class / function / export function / export const / export default / export * / 値 import / side-effect import / 式文 / const / let / template literal → 全 false ✓

**Scenario: 型宣言と式文が混在すると false（偽陽性の排除）**
→ TC-003（type-only.test.ts）: `type X = A;` + `foo()`（セミコロン有無いずれも）/ interface + class / export type + export const の混在 → 全 false ✓

### Requirement: lcov に SF が無い type-only ファイルは fail させず理由付きで skip する

- `evaluateChangedLineCoverage` の判定 2: `typeOnlyFiles?.has(file)` が true → `typeOnlySkipped.push({ file, reason: "type-only" })` して continue ✓
- stdout に `Type-only (no runtime code, absent from lcov): <files>` の専用行を追記（`typeOnlySkipped` 非空時のみ）✓

**Scenario: lcov に無い type-only ファイルの変更は gate を fail させない**
→ TC-004（evaluator）/ TC-013（orchestrator integration、#884 実例 ReviewerSnapshot ソース）✓

### Requirement: lcov に SF が無い runtime ファイルは従来どおり fail する

- `typeOnlyFiles?.has(file)` が false → 従来どおり `failedFiles.push({ file, reason: "not-loaded" })` ✓

**Scenario: lcov に無い runtime ファイルの変更は fail する**
→ TC-005（evaluator）/ TC-014（orchestrator integration、関数宣言含むソース）✓

### Requirement: ソース読取り失敗は fail-closed

- 読取り例外 → `typeOnlyFiles` に追加しない → 評価器で `not-loaded` fail ✓

**Scenario: ソースが読めないと fail する**
→ TC-006 / TC-015（orchestrator integration）✓

### Requirement: 既存の changed-line-coverage 挙動は不変

- 判定 3（DA レコードなし pass）: `changed-line-coverage.ts:132-143` — 変更なし ✓
- include / exclude / threshold 評価: 変更なし ✓
- `skippedFiles`（include/exclude 除外）の型・意味・出力文言: 不変 ✓
- 既存 `changed-line-coverage.test.ts`: `git diff main...HEAD` でゼロ行変更（完全無改変）✓

**Scenario: DA レコードが無い変更行は従来どおり pass（判定 3 不変）**
→ TC-007（evaluator）✓

**Scenario: exclude 宣言ファイルは type-only 判定に関わらず対象外**
→ TC-008（evaluator）: exclude 一致ファイルが `typeOnlyFiles` にあっても `skippedFiles` に入り `typeOnlySkipped` には入らないことを確認 ✓

---

## Judgment 3: design.md — 設計決定（D1–D5）適合性

**D1: type-only 判定は許可構文の閉集合による自前の字句走査**
→ `type-only.ts` 476 行、`node:*` すら import なし、外部依存ゼロ ✓
→ 未知構文 `??` → false（疑わしきは false の方向）✓

**D2: 字句走査の構造 — トークナイザ + top-level statement 分類 + 安全な consume**
→ Phase 1 `stripCommentsAndStrings`: `//` / `/* */` 除去、文字列中和、バッククォート → null（false）、未終端ブロックコメント → null ✓
→ Phase 2 `tokenize`: 単語 / 数値(`#NUM`) / `=>` / `...` / 区切り記号 / `/` / `@` / `??`（未知）✓
→ Phase 3 `analyzeStatements`: depth 追跡、`TYPE_CONTINUATION_TOKENS` 集合による ASI 判定、`consumeAllowedRest` の早期終端バイアス ✓
→ 安全不変条件をモジュール冒頭 JSDoc および `consumeAllowedRest` コメントで明記 ✓

**D3: 純関数評価器への組み込みは `typeOnlyFiles: Set<string>` のデータ注入**
→ `EvaluateInput.typeOnlyFiles?: Set<string>`（optional、既存呼び出し側は省略可）✓
→ `EvaluateResult.typeOnlySkipped: TypeOnlySkip[]`（全経路で `[]` または記録済み配列を返す）✓
→ `skippedFiles` の型・意味・出力文言「Skipped (not in coverage surface)」は不変 ✓
→ `SkipReason = "type-only"` / `TypeOnlySkip` インターフェース定義 ✓
→ `typeOnlyFiles` 省略時は従来の not-loaded fail-closed が完全不変（TC-010 / TC-017）✓

**D4: orchestrator が判定 2 候補のソースを読み分類、読取り失敗は fail-closed**
→ `changedLinesByFile` のうち `!lcov.has(file)` のみ `fs.readFile` → `isTypeOnlySource` 適用 ✓
→ 読取り例外 → catch で何もしない → `typeOnlyFiles` に追加されない → fail-closed ✓
→ `path.resolve(cwd, file)` で worktree HEAD 断面から読む ✓

**D5: 挙動保存（R3）**
→ 判定 3（DA なし pass）、include/exclude/threshold: 変更なし ✓
→ 既存テストファイル無変更 ✓

---

## Judgment 4: request.md — 受け入れ基準適合性

| AC | 内容 | 根拠 |
|----|------|------|
| AC1 | 判定表テストで type-only → true / runtime → false を網羅固定 | TC-001, TC-002, TC-003, TC-009（type-only.test.ts）✓ |
| AC2 | lcov 不在 type-only ファイルが fail せず skip 理由付きで記録（#884 解消） | TC-004, TC-013（#884 実例ソース使用）✓ |
| AC3 | runtime ファイルの not-loaded fail が不変（TC-CLG-04 相当） | TC-005, TC-014 ✓ |
| AC4 | ソース読取り失敗時に fail（fail-closed） | TC-006, TC-015 ✓ |
| AC5 | 修正前の挙動に戻すと該当テストが fail することを破壊確認として記録 | TC-004 / TC-013 コメントに「type-only skip 分岐を除去すると failedFiles 記録・status failed で fail する」と明記 ✓ |
| AC6 | 既存 changed-line-coverage テスト 26 件が無改変で green | `changed-line-coverage.test.ts` diff ゼロ行、verification-result.md で 8993 件 passed ✓ |
| AC7 | `typecheck && test` が green | verification-result.md: typecheck passed, test 8993 passed ✓ |

---

## 検証できなかった項目

None。全判定項目を observable な事実（ソースコード、テストコード、diff 出力、verification-result.md）で確認した。

---

## Findings 詳細

### 軽微な観察（非ブロッキング）

**`SkipReason` 型が export されているが内部で使用されていない**

`changed-line-coverage.ts:34` に `export type SkipReason = "type-only"` が定義されているが、`TypeOnlySkip` インターフェース（:39）は `reason: "type-only"` をリテラル型で直接記述しており `SkipReason` を参照していない。動作・型安全性への影響はなく、code-review でも非ブロッキングとして記録済み。
