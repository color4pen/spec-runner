# Test Cases: mock-pipeline-loopnames-sync

## Overview

`buildMockPipeline` の `loopNames`/`loopFixerPairs` 既定値を本番 (`run.ts`) と同期させる変更のテストシナリオ。  
構造的 sync（import による同一参照）が成立しているか、既存テストが本番経路で引き続き pass するかを検証する。

---

## Category: run.ts 定数の export

### TC-SC-01 [must]

- **Source**: request.md 要件 5 / tasks.md Task 1
- **Category**: run.ts constants

**GIVEN**: `src/core/pipeline/run.ts` に `STANDARD_LOOP_NAMES` が export 追加されている  
**WHEN**: モジュールを import する  
**THEN**:
- 値が `["spec-review", "verification", "code-review"]` の 3 要素である
- `"delta-spec-validation"` を含まない
- 型が `readonly string[]` である

---

### TC-SC-02 [must]

- **Source**: request.md 要件 5 / tasks.md Task 1
- **Category**: run.ts constants

**GIVEN**: `src/core/pipeline/run.ts` に `STANDARD_LOOP_FIXER_PAIRS` が export 追加されている  
**WHEN**: モジュールを import する  
**THEN**:
- エントリ数が 4 である（`code-review`, `spec-review`, `verification`, `delta-spec-validation`）
- 各キーが正しい fixer 名にマップされている:
  - `"code-review"` → `"code-fixer"`
  - `"spec-review"` → `"spec-fixer"`
  - `"verification"` → `"build-fixer"`
  - `"delta-spec-validation"` → `"delta-spec-fixer"`
- 型が `Readonly<Record<string, string>>` である

---

### TC-SC-03 [should]

- **Source**: design.md / tasks.md Task 1
- **Category**: run.ts constants

**GIVEN**: `createStandardPipeline` が `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` をスプレッドして使う形に変更されている  
**WHEN**: `bun run typecheck` を実行する  
**THEN**: 型エラーがなく通過する（`readonly string[]` → `string[]` のスプレッド変換が正しい）

---

## Category: buildMockPipeline 既定値の同期

### TC-SC-04 [must]

- **Source**: request.md 受け入れ基準 / tasks.md Task 2
- **Category**: buildMockPipeline sync

**GIVEN**: `buildMockPipeline` が `STANDARD_LOOP_NAMES` を import して Pipeline に渡している  
**WHEN**: `grep -n "delta-spec-validation" tests/core/pipeline/pipeline.test.ts` を実行する  
**THEN**: `buildMockPipeline` 関数本体の `loopNames` 定義行に `"delta-spec-validation"` が含まれない

---

### TC-SC-05 [must]

- **Source**: request.md 受け入れ基準 / tasks.md Task 2
- **Category**: buildMockPipeline sync

**GIVEN**: `buildMockPipeline` が `STANDARD_LOOP_FIXER_PAIRS` を import して Pipeline に渡している  
**WHEN**: `buildMockPipeline()` でデフォルト構築した Pipeline に対して動作を確認する  
**THEN**: `loopFixerPairs` は 4 エントリ（旧来の 1 エントリ `{ "delta-spec-validation": "delta-spec-fixer" }` ではない）を持つ形で動作する

---

### TC-SC-06 [must]

- **Source**: request.md 受け入れ基準 / tasks.md Task 2
- **Category**: buildMockPipeline sync

**GIVEN**: `buildMockPipeline` の import 文に `STANDARD_LOOP_NAMES`, `STANDARD_LOOP_FIXER_PAIRS` が追加されている  
**WHEN**: `bun run typecheck` を実行する  
**THEN**: 型エラーがなく通過する（import パス `run.js` が解決可能で型が一致する）

---

## Category: sanity check テスト（新規ファイル）

### TC-SC-07 [must]

- **Source**: request.md 要件 4 / tasks.md Task 4
- **Category**: sanity check

**GIVEN**: `tests/unit/core/pipeline/buildMockPipeline.test.ts` が新規作成されている  
**WHEN**: `STANDARD_LOOP_NAMES` の値を assert する  
**THEN**:
- `expect(STANDARD_LOOP_NAMES).toEqual(["spec-review", "verification", "code-review"])` が pass する
- `expect(STANDARD_LOOP_NAMES).not.toContain("delta-spec-validation")` が pass する

---

### TC-SC-08 [must]

- **Source**: request.md 要件 4 / tasks.md Task 4
- **Category**: sanity check

**GIVEN**: `tests/unit/core/pipeline/buildMockPipeline.test.ts` が新規作成されている  
**WHEN**: `STANDARD_LOOP_FIXER_PAIRS` の値を assert する  
**THEN**:
- 4 エントリすべてのマッピングが正しいことを確認する `toEqual` が pass する
- ファイル単体 (`bun run test -- tests/unit/core/pipeline/buildMockPipeline.test.ts`) が green になる

---

## Category: 既存テストの回帰（buildMockPipeline 経由）

### TC-SC-09 [must]

- **Source**: request.md 要件 2 / design.md Impact on existing tests
- **Category**: regression

**GIVEN**: `buildMockPipeline` の既定値が新定数に切り替わっている  
**WHEN**: TC-060 (code-review needs-fix → code-fixer → approved) を実行する  
**THEN**: テストが引き続き pass する（`loopFixerPairs` に `code-review` → `code-fixer` が追加されるため動作が改善されるが期待値は維持）

---

### TC-SC-10 [must]

- **Source**: request.md 要件 2 / design.md Impact on existing tests
- **Category**: regression

**GIVEN**: `buildMockPipeline` の既定値が新定数に切り替わっている  
**WHEN**: TC-061 (code-review exhausted) を実行する  
**THEN**: テストが引き続き pass する（`loopNames` の変化が TC-061 の期待値に影響しない）

---

### TC-SC-11 [should]

- **Source**: request.md 要件 2 / design.md Impact on existing tests
- **Category**: regression

**GIVEN**: `buildMockPipeline` の既定値が新定数に切り替わっている  
**WHEN**: TC-062〜TC-066（`#269` bypass テスト群）を実行する  
**THEN**: 全テストが pass する（dsv が loopNames から除外されても bypass ロジックの検証には影響しない）

---

### TC-SC-12 [should]

- **Source**: request.md 要件 2 / design.md Impact on existing tests
- **Category**: regression

**GIVEN**: `buildMockPipeline` の既定値が新定数に切り替わっている  
**WHEN**: TC-068 (stdout iter format) を実行する  
**THEN**: テストが pass する（`loopName: "spec-review"` は変更していないためフォーマット出力は同じ）

---

## Category: stale コメントの修正

### TC-SC-13 [should]

- **Source**: request.md 要件 3 / tasks.md Task 3
- **Category**: comment cleanup

**GIVEN**: `tests/core/pipeline/pipeline.test.ts` の TC-063 付近（旧 L418-421）のコメントが更新されている  
**WHEN**: ファイル内の該当箇所を確認する  
**THEN**: コメントに「`createStandardPipeline` includes dsv in loopNames」という記述が存在しない

---

### TC-SC-14 [should]

- **Source**: request.md 要件 3 / tasks.md Task 3
- **Category**: comment cleanup

**GIVEN**: TC-063 のコメントが書き換えられている  
**WHEN**: 新しいコメントを読む  
**THEN**: 「standard pipeline は dsv を loopNames に含まない (PR #274 以降)」趣旨の記述がある（事実と一致した内容になっている）

---

## Category: 全体 green

### TC-SC-15 [must]

- **Source**: request.md 受け入れ基準 / tasks.md Task 5
- **Category**: build & test

**GIVEN**: Task 1〜4 の変更がすべて完了している  
**WHEN**: `bun run typecheck && bun run test` を実行する  
**THEN**: 型エラーゼロ・テスト全 pass で終了する

---

### TC-SC-16 [must]

- **Source**: request.md 受け入れ基準 / tasks.md Task 6
- **Category**: build & test

**GIVEN**: Task 2 の変更（`buildMockPipeline` 既定値修正）が完了している  
**WHEN**: `grep -n "delta-spec-validation" tests/core/pipeline/pipeline.test.ts` を実行する  
**THEN**:
- 出力に `buildMockPipeline` 関数本体の `loopNames:` 行が含まれない
- 残存する dsv 参照はステップ定義（Map エントリ）または TC-063 等の個別 Pipeline 構築箇所のみである

---

## Priority Summary

| Priority | Count | TC IDs |
|----------|-------|--------|
| must     | 10    | TC-SC-01, 02, 04, 05, 06, 07, 08, 09, 10, 15, 16 |
| should   | 5     | TC-SC-03, 11, 12, 13, 14 |
| could    | 0     | — |
