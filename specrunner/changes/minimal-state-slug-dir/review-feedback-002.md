# Code Review Feedback — minimal-state-slug-dir — iter 2

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

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/store/event-journal.test.ts | **TC-031 が直接テストされていない。** `transitionJob + persist` の呼び出し組み合わせを明示したテストが存在しない。TC-030 の第2ケース（`appendHistoryEntry + persist`）と TC-008（persist after legacy load）が機能的に同値をカバーしているため、ブロッカーではない。 | 将来のクリーンアップ時に `transitionJob + persist` の scenario を1件追加するとよい。 | no |
| 2 | LOW | testing | tests/store/event-journal.test.ts | **TC-029（fs.appendFile のみ使用・既存行を書き換えない）が `should` 優先度にもかかわらず未テスト。** 非ブロッカー（`should` 扱い）。 | append 呼び出し後に events.jsonl の既存行が変化しないことをアサートするテストを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.40

## Summary

review-001 の 4 件の findings はすべて解消されている。

- **HIGH finding 1（TC-003/TC-004 未実装）→ 解消。** `tests/store/event-journal.test.ts` に TC-003（cursor crash 後の fold 復元）・TC-004（partial tail drop）が実装済み。
- **HIGH finding 2（TC-005/TC-006/TC-028/TC-030 未実装）→ 解消。** 同ファイルに TC-005（fixableCount round-trip）・TC-006（fixer-empty detection via resolveResumeStep）・TC-028（attempt 1-origin sequential）・TC-030（delta-append idempotent recovery）が実装済み。
- **MEDIUM finding 3（persist が非 crash パスでも毎回 full fold）→ 解消。** `job-state-store.ts` line 340–352 に `fastPathEligible` による fast path が追加され、カウンタが in-memory events をすべてカバーする場合は fold をスキップする。
- **LOW finding 4（test-cases.md metadata 誤記）→ 解消。** must テストがすべて実装されたため `result: completed` は正確。

実装品質は高い。`fold()` の partial tail 検出・delta-append カウンタ管理・crash recovery 冪等性・legacy flat file dual-read はいずれも設計仕様（D2/D3/D4/D9）に忠実。`stateToStateJson` が `history`/`steps` を state.json から除外する実装、`loadSplitLayout` が `_journal` フィールドを validate 前に strip する実装もそれぞれ正しい。`vitest.config.ts` に `maxWorkers: 4` を追加した点も worktree lock contention 低減として適切。

`bun run typecheck && bun run test` は 272 files / 3206 tests すべて green。段1 の受け入れ基準を満たしており、段2（slug ディレクトリ移行・machine-local sidecar・列挙元組み替え）へ進める状態にある。
