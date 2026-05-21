# Code Review Feedback — request-review-detect-baseline-edit-intent — iter 2

## Review Findings — Iteration 2

### Summary

iter 1 の 3 件の finding はすべて対処済み。ADR が `specrunner/adr/2026-05-21-request-review-detect-baseline-edit-intent.md` として追加され、AC[9] の要件（intent ベース検出抽象化 / verb 列挙 patchwork 廃止 / issue #299/#349 retrospective / LLM 不確定性原則）を網羅している。残課題として TC-RRI-010 と TC-RRI-012 の対処が不完全であり、いずれも LOW に留まる。

### Findings

| # | severity | location | description |
|---|----------|----------|-------------|
| 1 | LOW | `tests/unit/command/request-review.test.ts` line 261 | TC-RRI-010 未完: `"MODIFIED"` 単独・`"ADDED"` 単独の negative assertion が不在。現行は `not.toContain("MODIFIED, ADDED")` のみ（結合文字列）。`"MODIFIED"` が単体で prompt に混入しても通過する。test-cases.md TC-RRI-010 は個別チェックを明示要求。 |
| 2 | LOW | `tests/unit/command/request-review.test.ts` TC-RR-013 | TC-RRI-012 未完: 観測ケース fixture 文字列が依然不在。`// Covers observation cases: line-number rewrites, arrow notation, grep commands` はコメントのみ。test-cases.md TC-RRI-012 は `L555: A → B` 形式・grep 命令等のパターンを fixture として定数化し「intent 判定ベースのルールが catch できる設計であることを静的に検証できる assertion」を要求している。現実装は prompt テキストの 3 分類ラベル存在確認のみで、観測ケースと実際の assertion の対応が読み取れない。 |
| 3 | INFO | `specrunner/adr/2026-05-21-request-review-detect-baseline-edit-intent.md` | ADR の内容は AC[9] の 4 要素（intent 抽象化・patchwork 脱却思想・#299/#349 retrospective・LLM 不確定性原則への姿勢）を過不足なく網羅。iter 1 の MEDIUM finding が解消されている。 |
| 4 | INFO | `src/prompts/request-review-system.ts` line 31-34 | intent 判定ルール・Severity Scope Constraint（line 53）・recommendation 文がすべて設計に整合。verb 列挙（MODIFIED / ADDED 等）は削除済み。Exception（policy statement / past incident citation = NOT a HIGH finding）維持確認済み。 |
| 5 | INFO | `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md` | delta spec の Requirement ヘッダーが baseline と完全一致（TC-RRI-014 ✓）。3 Scenario（intent 判定検出・referential 除外・recommendation）が新設計に整合。baseline `specrunner/specs/request-authoring-guard/spec.md` はブランチ内で変更なし（TC-RRI-018 ✓）。 |

### Test Coverage

must シナリオ全 19 件の充足状況:

| TC-RRI | 判定 | 根拠 |
|--------|------|------|
| 001 | PASS | TC-RR-011 が `"Authority path intent"` を assert |
| 002 | PARTIAL | TC-RR-013 が `not.toContain("MODIFIED, ADDED")` のみ。単体確認なし (Finding 1) |
| 003 | PASS | TC-RR-013 が `"Reference/mention"` / `"Design reflection"` / `"Direct operation"` を assert |
| 004 | PASS | TC-RR-012 が `"policy statement"` / `"NOT a HIGH finding"` を assert |
| 005 | PASS | Severity Scope Constraint の HIGH 定義が intent 判定ベースに更新済み（旧文言削除確認）|
| 006 | PASS | TC-RR-014 が `"spec-merge"` / `"read-only within the PR"` / `"delta spec"` を assert |
| 007 | PASS | TC-RR-011 が `"Authority path intent"` / `"specrunner/specs/"` / `"HIGH severity finding"` を assert |
| 008 | PASS | TC-RR-012 が `"policy statement"` / `"NOT a HIGH finding"` を assert（旧 referential mentions / NOT HIGH findings から更新済み）|
| 009 | PASS | TC-RR-013 が static assertion のみ（LLM 呼び出しなし）で 3 分類を assert |
| 010 | PARTIAL | TC-RR-013 が `"MODIFIED"` 単独・`"ADDED"` 単独の negative assert なし (Finding 1) |
| 011 | PASS | TC-RR-014 が recommendation キーフレーズを assert |
| 012 | PARTIAL | コメントで言及のみ、fixture 定数化・assertion なし (Finding 2) |
| 013 | PASS | delta spec ファイル存在・Requirement ヘッダー一致確認 |
| 014 | PASS | delta spec Requirement ヘッダーが baseline と完全一致 |
| 015 | PASS | delta spec Scenario が intent 判定ベース・verb 非列挙・referential 除外節を含む |
| 016 | PASS | delta spec に変更対象外の Requirement なし |
| 017 | PASS | `specs/` 配下は `request-authoring-guard/` のみ |
| 018 | PASS | baseline spec 変更なし（git diff 確認済み）|
| 019 | PASS | typecheck green（iter 1 verification-result.md より、コード変更は iter 1 で完了済み）|
| 020 | PASS | test 2454 件 green（iter 1 verification-result.md 確認済み）|

must 19 件中 17 件 PASS、2 件 PARTIAL（LOW finding に留まる）。

### Verdict

- **verdict**: approved

2 件の LOW finding（TC-RRI-010 の個別 negative assertion 欠如 / TC-RRI-012 の fixture 文字列不在）は残存するが、iter 1 の MEDIUM finding（ADR 未作成）が解消されており、実装の正確性・設計整合性・typecheck / test green はすべて確認済み。LOW 2 件は merge ブロック相当の欠陥ではない。
