# Code Review Feedback — minimal-state-slug-dir — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/ (missing) | **T-03 crash-safety 回帰テスト (TC-003・TC-004) が未実装。** test-cases.md must-priority の「cursor 書き込み中の crash で event が失われない (TC-003)」と「末尾 partial 行を捨ててそれ以前を復元する (TC-004)」がどのテストファイルにも存在しない。tasks.md T-03 は段1 必須タスクであり、crash-safety の保証が検証不能。 | `tests/store/event-journal.test.ts` を新規作成し、(1) `events.jsonl` 完全・`state.json` 未更新の crash 相当状態で `load()` が fold 復元すること、(2) `events.jsonl` 末尾を partial 行に破損させた状態で `fold()` がそれ以前の全 record を返すことをアサートする。 | yes |
| 2 | HIGH | testing | tests/ (missing) | **T-04 fold 同値テスト (TC-005・TC-006・TC-028・TC-030) が未実装。** must-priority の「attempt が 1-origin 連番 (TC-028)」「delta-append crash 後の冪等リカバリ load 時 (TC-030)」「code-review approved + fixableCount>0 の routing が fold 経由で従来同値 (TC-005)」「fixer-empty 検出の再開が fold 経由で従来同値 (TC-006)」が未実装。既存の `transition-when.test.ts` は fold を経由せず直接 StepRun を組み立てるため journal round-trip での同値保証にならない。 | 同テストファイル内に (1) 同一 step の attempt 3 件 append → fold → attempt=1,2,3、(2) counter < fold 行数 の state.json で `persist()` → 二重 append なし、(3) `toolResult.fixableCount` を含む record を append → fold → `outcome.toolResult.fixableCount` 保持、(4) fixer attempt 数が fold で正しく数えられることをアサートする。 | yes |
| 3 | MEDIUM | performance | src/store/job-state-store.ts:339-350 | **`persist()` が非 crash パスでも毎回 `events.jsonl` を full fold している。** 正常時でも `fs.readFile(eventsPath)` + `fold()` を実行しており、長寿命 job では O(n) の読み取りが毎 step 発生する。段1 では実害が小さいが意図が不明瞭で段2 以降に問題化しうる。 | 非 crash パス（`existingCounters` 整合時）では fold をスキップするファストパスを追加するか、「常に fold する」設計判断をコメントで明示する。 | yes |
| 4 | LOW | metadata | specrunner/changes/minimal-state-slug-dir/test-cases.md | **`result: completed` かつ `must: 27` と記録されているが、must-priority テスト TC-003/004/005/006/028/030 が未実装。** 次のイテレーションで混乱の原因になる。 | result を `in-progress` に戻し、未実装 must テストを `blocked_reasons` に列挙する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 8 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 7 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 3 | 0.10 |

- **total**: 7.70

## Summary

段1 の実装コード（`event-journal.ts`・`job-state-store.ts` split layout・`appendHistoryEntry` truncation 除去）は設計に忠実で品質が高い。`fold()` の partial tail 検出・delta-append のカウンタ管理・crash recovery の冪等性・legacy flat file dual-read はいずれも正しく実装されており、3193 テストが green。

ブロッカーは実装の誤りではなく **T-03・T-04 タスクの未実施**（crash-safety 回帰テストと fold 同値テストの欠如）。これら must-priority テストを追加すれば approved になる。段2 の未実装項目（slug ディレクトリ移行・machine-local sidecar・列挙元組み替え）は本イテレーションのスコープ外のためブロックしない。

