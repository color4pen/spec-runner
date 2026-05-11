# Test Cases: fix-local-runtime-and-finish-preflight

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration/e2e): 15
- **Manual**: 4
- **Priority**: must: 11, should: 6, could: 2

## Test Cases

### TC-001: completionVerdict fallback — resultContent null + completionVerdict 定義済み

**Category**: unit
**Priority**: must
**Source**: design.md D1, tasks.md 2.1

**GIVEN** local runtime path の runAgentStep で、step に `completionVerdict: "success"` が設定されており、agent 実行の resultContent が null である
**WHEN** executor が実行結果を処理する
**THEN** verdict として `step.completionVerdict`（"success"）が採用され、escalation にならない

---

### TC-002: completionVerdict fallback — resultContent null + completionVerdict 未定義

**Category**: unit
**Priority**: should
**Source**: design.md D1

**GIVEN** local runtime path の runAgentStep で、step に `completionVerdict` が設定されておらず、agent 実行の resultContent が null である
**WHEN** executor が実行結果を処理する
**THEN** 既存の escalation fallback が維持される（completionVerdict なし null は escalation）

---

### TC-003: completionVerdict fallback — resultContent 非 null 時は fallback を使わない

**Category**: unit
**Priority**: must
**Source**: design.md D1, request.md 受け入れ基準

**GIVEN** local runtime path の runAgentStep で、step に `completionVerdict` が設定されており、agent 実行の resultContent に文字列が返る
**WHEN** executor が実行結果を処理する
**THEN** resultContent から verdict がパースされ、`step.completionVerdict` は使用されない

---

### TC-004: setsBranch フラグ — propose 完了後に state.branch が設定される

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 1.2, 2.2

**GIVEN** local runtime path の runAgentStep で、ProposeStep（`setsBranch: true`, `completionVerdict: "success"`）が実行対象であり、jobState.branch が未設定（undefined/null）である
**WHEN** executor が propose step の完了を処理する
**THEN** `state.branch` が `"feat/${slug}"` 形式で設定される

---

### TC-005: setsBranch フラグ — branch が既に設定済みの場合は上書きしない

**Category**: unit
**Priority**: must
**Source**: design.md D2（`!jobState.branch` 条件）

**GIVEN** local runtime path の runAgentStep で、step に `setsBranch: true` が設定されており、jobState.branch が既に値を持っている
**WHEN** executor が step の完了を処理する
**THEN** `state.branch` は変更されない（既存の branch 値が維持される）

---

### TC-006: step 名ハードコード禁止（TC-003 相当）

**Category**: unit
**Priority**: must
**Source**: design.md D2, request.md 受け入れ基準, tasks.md 2.3

**GIVEN** executor.ts の local runtime path のソースコード
**WHEN** step 名の文字列リテラル（`"propose"` 等）の使用を検査する
**THEN** `step.name` を条件分岐に使った branch 設定ロジックが存在しない（setsBranch フラグを使っている）

---

### TC-007: setsBranch フラグ — managed runtime path には影響しない

**Category**: unit
**Priority**: should
**Source**: design.md Risks, Non-Goals

**GIVEN** managed runtime path（`_updatedState` 分岐）で step を実行し、step に `setsBranch: true` が設定されている
**WHEN** executor が managed runtime path で step の完了を処理する
**THEN** `state.branch` の自動設定ロジックは実行されない（managed path は `_updatedState` で先に return する）

---

### TC-008: review-verdict parser — 既存パターン（`- **verdict**: approved`）

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.1

**GIVEN** agent の出力文字列が `- **verdict**: approved` 形式である
**WHEN** `parseReviewVerdict` を呼び出す
**THEN** `"approved"` が返される

---

### TC-009: review-verdict parser — 大文字 V + bold（`**Verdict**: approved`）

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.1, request.md 要件 3

**GIVEN** agent の出力文字列が `**Verdict**: approved` 形式である（大文字 V、`- ` prefix なし）
**WHEN** `parseReviewVerdict` を呼び出す
**THEN** `"approved"` が返される

---

### TC-010: review-verdict parser — bold なし（`Verdict: needs-fix`）

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.1, request.md 要件 3

**GIVEN** agent の出力文字列が `Verdict: needs-fix` 形式である（bold なし）
**WHEN** `parseReviewVerdict` を呼び出す
**THEN** `"needs-fix"` が返される

---

### TC-011: review-verdict parser — `- ` prefix あり + bold なし（`- verdict: escalation`）

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.1

**GIVEN** agent の出力文字列が `- verdict: escalation` 形式である（`- ` prefix あり、bold なし）
**WHEN** `parseReviewVerdict` を呼び出す
**THEN** `"escalation"` が返される

---

### TC-012: review-verdict parser — 不正な verdict 値は拒否する

**Category**: unit
**Priority**: should
**Source**: design.md Risks（"regex 拡張で想定外マッチ"）

**GIVEN** agent の出力文字列が `**Verdict**: rejected` 形式である（`rejected` は valid な verdict 値ではない）
**WHEN** `parseReviewVerdict` を呼び出す
**THEN** null または undefined が返される（verdict として採用されない）

---

### TC-013: preflight MERGED bypass — MERGED + mergeStateStatus UNKNOWN

**Category**: unit
**Priority**: must
**Source**: design.md D4, tasks.md 4.1, request.md 要件 4

**GIVEN** `fetchPrViewWithRetry` が GitHub API から `state: "MERGED"` かつ `mergeStateStatus: "UNKNOWN"` のレスポンスを受け取る
**WHEN** UNKNOWN retry 判定ロジックに到達する前に MERGED チェックが実行される
**THEN** retry せず即座に `{ ok: true, data: parsed }` を返す（escalation しない）

---

### TC-014: preflight MERGED bypass — OPEN + UNKNOWN は retry する（既存挙動維持）

**Category**: unit
**Priority**: should
**Source**: design.md D4（bypass は MERGED に限定）

**GIVEN** `fetchPrViewWithRetry` が GitHub API から `state: "OPEN"` かつ `mergeStateStatus: "UNKNOWN"` のレスポンスを受け取る
**WHEN** UNKNOWN retry 判定ロジックに到達する
**THEN** retry ロジックが実行される（MERGED bypass は発動しない）

---

### TC-015: typecheck pass

**Category**: manual
**Priority**: must
**Source**: tasks.md 5.2, request.md 受け入れ基準

**GIVEN** 全ての変更実装が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript のコンパイルエラーが 0 件である

---

### TC-016: delta spec validate pass

**Category**: manual
**Priority**: should
**Source**: request.md 要件 5, 受け入れ基準

**GIVEN** `openspec/changes/fix-local-runtime-and-finish-preflight/` に delta spec が存在する
**WHEN** `openspec validate` を実行する
**THEN** バリデーションエラーが 0 件である

---

### TC-017: finish-orchestrator MERGED モック整合

**Category**: unit
**Priority**: should
**Source**: tasks.md 5.1

**GIVEN** finish-orchestrator.test.ts の MERGED PR テストケースで `mergeStateStatus: "UNKNOWN"` を返すモックが設定されている
**WHEN** finish orchestrator を MERGED PR に対して実行する
**THEN** `prAlreadyMerged` path（TC-106 相当）に到達し、escalation しない

---

### TC-018: local runtime propose → spec-review 正常遷移

**Category**: manual
**Priority**: could
**Source**: request.md 受け入れ基準

**GIVEN** local runtime モードで pipeline を実行し、propose step が `setsBranch: true` と `completionVerdict: "success"` を持つ
**WHEN** propose step が完了し spec-review step に遷移する
**THEN** `state.branch` が設定済みであり、spec-review step が branch 未設定エラーなく起動する

---

### TC-019: 全テスト green（回帰テスト）

**Category**: manual
**Priority**: could
**Source**: request.md 受け入れ基準, tasks.md 5.3

**GIVEN** 全ての変更実装が完了した状態
**WHEN** `bun test` を実行する
**THEN** 既存テストを含む全テストが green であり、fail が 0 件増加する
