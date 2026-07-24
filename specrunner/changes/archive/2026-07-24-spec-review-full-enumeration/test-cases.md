# Test Cases: spec-review 全量列挙規律と後出し検出

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 25
- **Manual**: 0
- **Priority**: must: 14, should: 11, could: 0

---

### TC-001: Method 節に全量列挙規律が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-review prompt は finding の全量列挙を要求する > Scenario: Method 節に全量列挙規律が含まれる

---

### TC-002: 前 revision に存在した記述への指摘は late

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後出し判定は純関数として 3 値を返す > Scenario: 前 revision に存在した記述への指摘は late

---

### TC-003: fixer が書き足した記述への指摘は not-late

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後出し判定は純関数として 3 値を返す > Scenario: fixer が書き足した記述への指摘は not-late

---

### TC-004: 判定不能はすべて indeterminate

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後出し判定は純関数として 3 値を返す > Scenario: 判定不能はすべて indeterminate

---

### TC-005: iteration 2 で per-finding の後出し判定が記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する > Scenario: iteration 2 で per-finding の後出し判定が記録される

---

### TC-006: iteration 1 では finding-recency 記録が append されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: iteration 1 では後出し判定を実行しない > Scenario: iteration 1 では finding-recency 記録が append されない

---

### TC-007: late な finding を含む round でも verdict は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後出し検出は verdict を変更しない > Scenario: late な finding を含む round でも verdict は不変

---

### TC-008: late が 1 件以上で stderr 要約が出る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 後出しがある round では stderr に要約を出す > Scenario: late が 1 件以上で stderr 要約が出る

---

### TC-009: Method 節追記が既存の 5 節骨格を破壊しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_BASE` 文字列を対象に、全 h2 見出し (`## `) を抽出する
**WHEN** 抽出した h2 見出し一覧と `## Method` 節内のテキストを検査する
**THEN** Question / Contract / Method / Evidence / Completion の 5 節がすべて含まれ、かつ `## Method` 節内にそれら以外の h2 見出しが存在しない

---

### TC-010: 空白のみの対象行は indeterminate

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 (空白のみの対象行 → indeterminate)

**GIVEN** `targetLineContent` が `"   "` (空白文字のみ) であり、`priorFileContent` が非 null の有効な文字列
**WHEN** `classifyFindingRecency(targetLineContent, priorFileContent)` を呼ぶ
**THEN** `indeterminate` を返す

---

### TC-011: trim 済みで一致する行は行番号ずれがあっても late

**Category**: unit
**Priority**: should
**Source**: design.md > D4 (行番号ずれに頑健な内容一致)

**GIVEN** `targetLineContent` が `"  const x = 1;"` (前後空白あり)、`priorFileContent` が `"const y = 2;\nconst x = 1;\nconst z = 3;"` (対象行が 2 行目に存在するが行番号は使わない)
**WHEN** `classifyFindingRecency(targetLineContent, priorFileContent)` を呼ぶ
**THEN** `late` を返す（trim 後の `"const x = 1;"` が前 revision の或る行と一致するため）

---

### TC-012: LocalRuntime.readRevisionContent が現ファイル内容と指定 OID の内容を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 (LocalRuntime 実装)

**GIVEN** `cwd/file` が worktree に存在し、`priorOid` が有効な commitOid を指す
**WHEN** `LocalRuntime.readRevisionContent(file, priorOid, cwd, null)` を呼ぶ
**THEN** `current` に現 file の内容、`prior` に指定 OID 時点の file 内容が返り、例外を throw しない

---

### TC-013: LocalRuntime.readRevisionContent - 非存在 OID で prior が null

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (解決不能ケースを null に倒す)

**GIVEN** `priorOid` が存在しない OID 文字列
**WHEN** `LocalRuntime.readRevisionContent(file, priorOid, cwd, null)` を呼ぶ
**THEN** `prior` が `null` であり、例外を throw しない

---

### TC-014: LocalRuntime.readRevisionContent - 非存在 path で current が null

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 (解決不能ケースを null に倒す)

**GIVEN** `cwd/file` が worktree に存在しない
**WHEN** `LocalRuntime.readRevisionContent(file, priorOid, cwd, null)` を呼ぶ
**THEN** `current` が `null` であり、例外を throw しない

---

### TC-015: ManagedRuntime.readRevisionContent は prior を常に null で返す

**Category**: unit
**Priority**: should
**Source**: design.md > D4 (managed では prior を解決できず常に indeterminate に倒れる)

**GIVEN** `ManagedRuntime` の `readRevisionContent` を任意の有効な引数で呼ぶ
**WHEN** `ManagedRuntime.readRevisionContent(file, priorOid, cwd, branch)` を呼ぶ
**THEN** `prior` が `null` であり（managed では任意 OID を解決不能）、例外を throw しない

---

### TC-016: readRevisionContent 未実装の runtimeStrategy で全 finding を indeterminate にする

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 (fail-to-indeterminate)

**GIVEN** `readRevisionContent` メソッドを持たない fake `runtimeStrategy`、findings が 1 件以上
**WHEN** `computeFindingRecency(findings, priorOid, cwd, branch, runtimeStrategy)` を呼ぶ
**THEN** 全 finding の `recency` が `indeterminate`

---

### TC-017: late が 0 件のとき stderrWrite を呼ばない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (late が 0 件では stderr 出力しない)

**GIVEN** `iteration === 2`、全 finding の recency が `not-late` または `indeterminate`
**WHEN** `recordFindingRecency(params)` を呼ぶ
**THEN** `stderrWrite` が呼び出されない

---

### TC-018: finding が 0 件のとき appendFindingRecency を呼ばない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (結果が空なら return)

**GIVEN** `iteration === 2`、agent findings が 0 件（`origin === "scope"` のみ、または空リスト）
**WHEN** `recordFindingRecency(params)` を呼ぶ
**THEN** `appendFindingRecency` が呼び出されない

---

### TC-019: fold() が finding-recency 行を FoldResult.findingRecency に収集する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 (fold finding-recency 収集テスト)

**GIVEN** `type: "finding-recency"` の EventRecord を含む `events.jsonl`
**WHEN** `fold()` で読み込む
**THEN** `FoldResult.findingRecency` に per-finding の recency 判定を持つ record が復元される

---

### TC-020: finding-recency の append が state に materialize されない（journal-only）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 (journal-only 記録、state.json 非変更)

**GIVEN** `appendFindingRecency` を呼んだ後
**WHEN** `NormalizedJobState` を読む
**THEN** `findingRecency` が state に存在せず、state.json が変更されていない

---

### TC-021: 未知 type の journal 行が fold() で無視される（前方互換）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 (前方互換テスト)

**GIVEN** `type: "unknown-future-type"` の行を含む `events.jsonl`
**WHEN** `fold()` で読み込む
**THEN** エラーを throw せず、未知 type 行は無視される

---

### TC-022: scope finding が後出し判定対象から除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 (origin === "scope" を除外)

**GIVEN** `findings` に `origin === "scope"` の finding と通常の agent finding が混在する iteration 2 の spec-review 完了
**WHEN** `applySuccessPostPersistEffects` の後出し検出ブロックが走る
**THEN** `origin === "scope"` の finding は `computeFindingRecency` に渡されず、agent finding のみが判定対象になる

---

### TC-023: 後出し検出ブロックの例外が step 完了を壊さない

**Category**: unit
**Priority**: should
**Source**: design.md > Risks / Trade-offs (best-effort、例外を握り潰す)

**GIVEN** `computeFindingRecency` が例外を throw するよう fake を設定した iteration 2 の spec-review 完了
**WHEN** `applySuccessPostPersistEffects` が走る
**THEN** 例外が try/catch で握り潰され、step が正常完了する（後出し検出の失敗が step 完了をブロックしない）

---

### TC-024: typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 全コード変更（T-01 〜 T-06）を適用した状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーがなく exit code 0 で終了する

---

### TC-025: test suite が全件 green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 全コード変更（T-01 〜 T-06）を適用した状態
**WHEN** `bun run test` を実行する
**THEN** 既存テスト（prompt drift-guard / judge-verdict / step-completion / event-journal）を含む全テストが通過し exit code 0 で終了する

---

## Result

```yaml
result: completed
total: 25
automated: 25
manual: 0
must: 14
should: 11
could: 0
blocked_reasons: []
```
