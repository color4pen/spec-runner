# Code Review Feedback — iteration 001

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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/store/journal-integrity.ts` | `scanJournalIntegrity` の active/archive セクションは非 ENOENT の readdir エラーを再 throw する。doctor check の外側 try/catch が catch して pass に落とすため最終挙動は D7 通りだが、worktree inner scan が全例外 swallow と非対称。直接呼び出し時に例外が漏れる可能性がある。 | 将来 `scanJournalIntegrity` を公開 API 化するときに never-throw に統一する。現状は doctor check のラッパで防御済みなのでスキップ可。 | no |
| 2 | low | maintainability | `src/store/journal-integrity.ts` | `describeJournalIssue` の "at line N" は committed lines 内の 0-based index であり、ファイル上の実際の行番号と空行が間に入る場合は異なる。JSONL では通常問題ないが、診断メッセージの精度として将来改善余地あり。 | 将来の verify コマンドで改善する際に考慮する。現状はスキップ可。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.65

## Summary

設計 D1–D7 に忠実な実装。主要観点を以下に記す。

**fold() — T-01**: 末尾 partial の判定（最後の非空行の JSON.parse 失敗のみ drop）と mid-journal 破損の区別が正確。`typeof null === "object"` / `Array.isArray` を正しく排除。unknown `type` の object は forward compat として無視し、破損扱いしない。fold は任意の入力で throw しない。

**journal-integrity helper — T-02**: `detectCounterReversal` は history → step の順で最初の逆行を返し、fold 側が多い（crash recovery）は逆行と見なさない。`inspectJournalDir` は ENOENT・その他 I/O エラーのいずれも null に落とし、観測経路を壊さない。`describeJournalIssue` は doctor details と error hint で使える一行説明を生成。

**load/persist/list — T-04**: `composeSplitLayout`（tolerant）と `loadSplitLayout`（fail-closed wrapper）への分割がクリーン。list() の 5 call site すべてが tolerant パス、load() が fail-closed パスを使っていることを確認。persist() は corruption チェック → 逆行チェック → max() 吸収廃止の順で正確。`mergeStepCountsMax` は削除済み。

**job show — T-05**: UUID 経路は `JOURNAL_CORRUPTED` catch で banner 表示 + exit 0。slug 経路は list() tolerant → `inspectJournalDir` probe → issue があれば banner 出力・lineage/cost 抑止で正確。

**doctor check — T-06**: factory + 注入 scan パターン、scan 例外は pass に落とし、`required: false` で設計通り。active/worktrees/archive の scan 対象も D7 通り。

**受け入れ基準**: 23 must テストケースすべてを確認。`typecheck && test` green（460 test files / 6381 tests）。既存テストへの変更は import 行 1 行のみで、silent-skip を固定していた既存テストが存在しないことを `git diff` で確認。

