# Test Cases: spec-paths-fix-pr252

## Overview

spec authority 文書 2 ファイルの旧 path 参照 (`specrunner/requests/`) を新構造 (`specrunner/changes/`) に置換する変更の検証シナリオ。

---

## TC-01: grep で旧 path が 0 hit

- **Category**: Acceptance Criterion
- **Priority**: must
- **Source**: request.md 受け入れ基準 #1

**GIVEN** spec-paths-fix-pr252 の変更が適用されている  
**WHEN** `grep -rn "specrunner/requests/" specrunner/specs/` を実行する  
**THEN** マッチが 0 件であること

---

## TC-02: cli-commands/spec.md の旧 path が存在しない

- **Category**: Acceptance Criterion
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** `specrunner/specs/cli-commands/spec.md` が変更適用済みである  
**WHEN** ファイル内を `specrunner/requests/` で検索する  
**THEN** マッチが 0 件であること

---

## TC-03: cli-commands/spec.md の新 path が存在する

- **Category**: Correctness
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** `specrunner/specs/cli-commands/spec.md` が変更適用済みである  
**WHEN** ファイル内を `specrunner/changes/` で検索する  
**THEN** L168-200 周辺に `specrunner/changes/active/`、`specrunner/changes/merged/`、`specrunner/changes/` の参照が含まれること

---

## TC-04: cli-commands/spec.md のメッセージ文字列が新 path に更新されている

- **Category**: Correctness
- **Priority**: must
- **Source**: tasks.md Task 1 (L188, L189, L195, L200)

**GIVEN** `specrunner/specs/cli-commands/spec.md` が変更適用済みである  
**WHEN** doctor の成功・失敗メッセージを確認する  
**THEN** `"specrunner/changes/ structure is complete"` および `"specrunner/changes/ is missing dirs: ..."` が存在し、旧形式 `"specrunner/requests/ ..."` が存在しないこと

---

## TC-05: job-state-store/spec.md の旧 path が存在しない

- **Category**: Acceptance Criterion
- **Priority**: must
- **Source**: tasks.md Task 2

**GIVEN** `specrunner/specs/job-state-store/spec.md` が変更適用済みである  
**WHEN** ファイル内を `specrunner/requests/` で検索する  
**THEN** マッチが 0 件であること

---

## TC-06: job-state-store/spec.md の新 path が存在する

- **Category**: Correctness
- **Priority**: must
- **Source**: tasks.md Task 2

**GIVEN** `specrunner/specs/job-state-store/spec.md` が変更適用済みである  
**WHEN** ファイル内を `specrunner/changes/active/` で検索する  
**THEN** L260, L275, L286, L292, L302 周辺に新 path 参照が存在すること

---

## TC-07: job-state-store/spec.md の CANONICAL_PATTERN regex が更新されている

- **Category**: Correctness
- **Priority**: must
- **Source**: tasks.md Task 2 (L282)

**GIVEN** `specrunner/specs/job-state-store/spec.md` が変更適用済みである  
**WHEN** L282 周辺の CANONICAL_PATTERN regex を確認する  
**THEN** `\/specrunner\/changes\/active\/` を含み、`\/specrunner\/requests\/active\/` を含まないこと

---

## TC-08: job-state-store/spec.md のコマンド例が更新されている

- **Category**: Correctness
- **Priority**: must
- **Source**: tasks.md Task 2 (L292)

**GIVEN** `specrunner/specs/job-state-store/spec.md` が変更適用済みである  
**WHEN** L292 周辺のコマンド例を確認する  
**THEN** `specrunner run specrunner/changes/active/readme-status-section/request.md` が存在し、旧形式 `specrunner run specrunner/requests/active/...` が存在しないこと

---

## TC-09: 対象 2 ファイル以外の spec 文書が変更されていない

- **Category**: Scope Boundary
- **Priority**: must
- **Source**: request.md 受け入れ基準 #2

**GIVEN** spec-paths-fix-pr252 の変更が適用されている  
**WHEN** `specrunner/specs/` 以下の変更ファイル一覧を取得する  
**THEN** `cli-commands/spec.md` と `job-state-store/spec.md` の 2 ファイルのみが変更されていること

---

## TC-10: typecheck が green

- **Category**: Acceptance Criterion
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3

**GIVEN** spec-paths-fix-pr252 の変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく完了すること

---

## TC-11: テストスイートが green

- **Category**: Acceptance Criterion
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3

**GIVEN** spec-paths-fix-pr252 の変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass すること

---

## TC-12: コードファイルに旧 path が含まれないこと（リグレッション確認）

- **Category**: Regression
- **Priority**: should
- **Source**: request.md スコープ外（PR #252 対応済み前提の確認）

**GIVEN** PR #252 およびこの変更が適用されている  
**WHEN** `grep -rn "specrunner/requests/" src/` を実行する（または TypeScript ソース範囲）  
**THEN** マッチが 0 件であること（コード側はすでに PR #252 で修正済みであることの確認）

---

## TC-13: `{active,merged}` 複合表記が正しく置換されている

- **Category**: Correctness
- **Priority**: should
- **Source**: tasks.md Task 1 (L168), design.md 置換ルール

**GIVEN** `specrunner/specs/cli-commands/spec.md` が変更適用済みである  
**WHEN** L168 周辺を確認する  
**THEN** `specrunner/changes/{active,merged}/` が存在し、`specrunner/requests/{active,merged}/` が存在しないこと

---

## TC-14: spec 文書の意味内容が変化していないこと

- **Category**: Semantic Integrity
- **Priority**: could
- **Source**: design.md（単純テキスト置換、設計判断不要）

**GIVEN** spec-paths-fix-pr252 の変更前後のファイルを比較する  
**WHEN** path 文字列以外の変更箇所を確認する  
**THEN** `specrunner/requests/` → `specrunner/changes/` の置換以外の差分がないこと
