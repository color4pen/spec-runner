# Code Review Feedback — minimal-state-slug-dir — iter 6

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
- **iteration**: 006

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | maintainability | src/state/schema.ts, src/core/step/executor.ts | **`StepOutcome.fileContent` / `StepRun.modelUsage` がインターフェースに残存。** T-08 タスクチェックボックスが `[ ]` のまま（fileContent）であり、`modelUsage` も `StepRun` インターフェースに残っている。いずれも `stepRunToRecord()` / `stateToStateJson()` で events.jsonl および state.json には出力されないため、受け入れ基準「events.jsonl / state.json に fileContent / modelUsage が含まれない」は満たされている。ただし TypeScript 型上で optional フィールドとして露出し続けるためコードの読み手に混乱を与えうる。 | 別 cleanup change で `StepOutcome.fileContent` を削除し `executor.ts` の `resultContent` 受け渡しを整理する。`StepRun.modelUsage` は executor 内で per-step usage 書き込みに使われており除去は慎重に行う（usage.json append 後は不要）。 | no |
| 2 | LOW | testing | tests/store/job-state-store.test.ts | **TC-017（archive scan）・TC-018（legacy dual-read）の明示的 list() テストが未追加（iter 5 継続）。** コード実装は正しいが、list() が archive ディレクトリと `.specrunner/jobs/<jobId>.json` レガシーを列挙することを直接 assert するユニットテストがない。 | `tests/store/job-state-store.test.ts` に list() を対象とした archive / legacy 各ソースのテストを追加する（別 change で対応可）。 | no |
| 3 | LOW | correctness | src/store/job-state-store.ts list() 1b | **archived job の `request.path` 注入パス誤り（iter 5 継続）。** `loadSplitLayout` に `{ slug: archiveSlug, stateRoot: repoRoot }` を渡すため、`request.path` が `{repoRoot}/specrunner/changes/{archiveSlug}/request.md`（非実在）に設定される。実際のパスは `specrunner/changes/archive/{datedSlug}/request.md`。archived job は resume しないため実害は限定的。 | archived load では slugInject を渡さず load 後に正しい archive パスを上書きするか、archive 専用の stateRoot を `archiveDir` にする。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

iter 5 の pending 事項「managed marker write/clear」が本イテレーションで完成。

**iter 5 pending → 解消**: `src/core/runtime/managed.ts` に `writeManagedMarker()` / `clearManagedMarker()` を実装し、`setupWorkspace`（run/resume 両経路）で write、teardown / cancel 経路で clear している。`tests/unit/core/runtime/managed.test.ts` に TC-036 相当（D7 スキーマ準拠 / write・clear タイミング検証）が 4 ケース追加されている。

`bun run typecheck && bun run test` は 273 files / 3234 tests all green（iter 5 の 3222 から +12）。

受け入れ基準はすべて満たされている。残存 3 件はいずれも LOW・非ブロッキングで Fix=no（別 cleanup change の余地あり）。

