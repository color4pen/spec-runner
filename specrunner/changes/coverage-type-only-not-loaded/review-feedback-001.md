# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更スコープの確認

`git diff main...HEAD --stat` で確認した変更:
- `src/core/verification/type-only.ts` — 新規 pure module（476行）
- `src/core/verification/changed-line-coverage.ts` — 既存ファイルへの additive 変更（+63/-4行）
- `tests/unit/core/verification/type-only.test.ts` — 新規テスト（274行）
- `tests/unit/core/verification/changed-line-coverage-type-only.test.ts` — 新規テスト（650行）
- `specrunner/changes/coverage-type-only-not-loaded/` 配下のワークフローファイル群

### 受け入れ基準の検証

**AC1: 判定表テストの網羅固定**

`type-only.test.ts` で以下を確認:
- TC-001: interface / type alias / import type / export type（re-export 含む）/ declare / export {} / JSDoc / 複数行 union / #884 実例パターン（interface + JSDoc、multiline SnapshotStatus） → 全 true ✓
- TC-002: enum / const enum / class / function / export function / export const / export default / export * / 値 import / side-effect import / 式文 / const / let / template literal → 全 false ✓
- TC-003: 型宣言 + 式文混在でも false（安全不変条件の検証） ✓
- TC-009: 空ファイル / 空白のみ / コメントのみ → true ✓

**AC2: lcov 不在 type-only ファイルが fail せず skip 記録される**

`changed-line-coverage-type-only.test.ts` の TC-004 で:
- `typeOnlyFiles` に含まれる lcov 不在ファイル → `typeOnlySkipped` に `{ file, reason: "type-only" }` 記録、status passed ✓
- TC-013（integration）: #884 実例の interface + JSDoc + multiline export type ソースで gate passed、stdout に `Type-only` 行が含まれる ✓

**AC3: runtime ファイルは従来どおり fail**

TC-005: `typeOnlyFiles` に含まれない lcov 不在ファイル → reason `not-loaded` で fail ✓
TC-014（integration）: 関数宣言を含む runtime ソース → gate failed ✓

**AC4: ソース読取り失敗時に fail（fail-closed）**

TC-006 / TC-015: disk 上にソースファイルが存在しない → gate failed（type-only skip にならない）✓

**AC5: 破壊確認の記録**

`changed-line-coverage-type-only.test.ts` の TC-004・TC-013 のコメントに明記:
「type-only skip 分岐を除去すると TC-004（failedFiles に記録、status failed）と TC-013（gate failed）が fail する」と記録済み ✓

**AC6: 既存テスト 26 件が無改変で green**

`tests/unit/core/verification/changed-line-coverage.test.ts` の diff が 0 行（未変更）であることを確認 ✓
verification-result.md で全 8993 件 passed を確認 ✓

**AC7: typecheck && test が green**

verification-result.md で確認:
- build: passed (1.0s)
- typecheck: passed (4.9s)
- test: passed (30.0s) — 8993 passed, 1 skipped
- lint: passed (5.6s)
- changed-line-coverage: passed (36.2s)

### 実装の正確性検証

**type-only.ts の安全不変条件**

設計が要求する「疑わしきは false」の早期終端バイアスを確認:
- `consumeAllowedRest` は depth 0 で文境界（`;` / 閉じ括弧 / ASI）を検出したら次トークンが `TYPE_CONTINUATION_TOKENS` 集合に無い限り終端し、次のリーダ判定に戻す。runtime 文が許可文へ吸収されることを構造的に排除 ✓
- template literal（バッククォート）は `stripCommentsAndStrings` で `null` を返し即 false ✓
- コード文脈の `/`、`@`、未知文字 `??` はいずれも false ✓

**changed-line-coverage.ts への組み込み**

D3 の設計どおり:
- `EvaluateInput` に optional `typeOnlyFiles?: Set<string>` 追加（既存呼び出し側は省略可） ✓
- `EvaluateResult` に `typeOnlySkipped: TypeOnlySkip[]` 追加（全経路で `[]` として返す） ✓
- 判定 2 の分岐: `typeOnlyFiles?.has(file)` → skip / それ以外 → 従来の not-loaded fail ✓
- `skippedFiles`（include/exclude 除外）の型・意味・出力文言は不変 ✓
- stdout の専用行 `Type-only (no runtime code, absent from lcov): ...` は `typeOnlySkipped` 非空時のみ追記 ✓

**orchestrator（D4）の配線**

- `changedLinesByFile` のうち `!lcov.has(file)` のファイルのみ読む（無駄読みなし） ✓
- 読取り例外 → `typeOnlyFiles` に追加しない（fail-closed） ✓
- `path.resolve(cwd, file)` で worktree HEAD 断面から読む ✓

**型の整合性**

typecheck passed 確認済み。`EvaluateInput.typeOnlyFiles?: Set<string>` は optional なため既存呼び出しは無変更で型エラーなし ✓

### test-cases.md との照合（must 15 件）

| TC | Priority | 対応テスト | 確認 |
|----|----------|-----------|------|
| TC-001 | must | type-only.test.ts | ✓ |
| TC-002 | must | type-only.test.ts | ✓ |
| TC-003 | must | type-only.test.ts | ✓ |
| TC-004 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-005 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-006 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-007 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-008 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-013 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-014 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-015 | must | changed-line-coverage-type-only.test.ts | ✓ |
| TC-016 | must (manual) | テストコメントに記録 | ✓ |
| TC-017 | must | 既存ファイル未変更 + changed-line-coverage-type-only.test.ts TC-017 | ✓ |
| TC-018 | must | type-only.test.ts | ✓ |
| TC-010 | must | changed-line-coverage-type-only.test.ts | ✓ |

should 3 件（TC-009 / TC-011 / TC-012）もすべて網羅済み ✓

## 検証できなかった項目

None。全受け入れ基準を observable な事実（diff、テストファイル本文、verification-result.md のフェーズ結果）で確認した。

## Findings 詳細

### 軽微な観察（非ブロッキング）

**`SkipReason` 型が定義・export されているが内部で使用されていない**

`changed-line-coverage.ts:34` に `export type SkipReason = "type-only"` が定義されているが、`TypeOnlySkip` インターフェース（:39）は `reason: "type-only"` をリテラル型で直接ハードコードしており、`SkipReason` を参照していない。外部 consumer 向けの公開 API として意図された可能性があり、動作への影響はない。将来 `TypeOnlySkip.reason: SkipReason` に揃えることで一貫性が上がるが、現状でも型安全性・挙動に問題はない。
