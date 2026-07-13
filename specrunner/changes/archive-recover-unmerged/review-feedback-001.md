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

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.0

## Summary

### Verification

- `bun run typecheck`: green（出力なし）
- `bun run test`: 6539 tests passed, 0 failures

### 実装評価

4 つの設計決定（D1–D4）が仕様通りに実装されている。

**D1 (`deferArchivedTransition`)**: `orchestrator.ts` に `deferArchivedTransition?: boolean`（default `false`）を追加。`true` のとき `markJobArchived` の呼び出しをスキップし、`git mv` / commit / push / headSha 捕捉は従来通り実行される。plain `job archive` は option 未指定のため既存挙動を完全に保つ。

**D2 (archiveRecorded シグナル)**: `merge-then-archive.ts` の Step 1 を `listWithSourceDirs({ includeArchived: true })` へ変更し、`sourceChangeDir` から `archiveRecorded = path.basename(path.dirname(sourceChangeDir)) === "archive"` を導出。`jobStatus === "archived"` 依存を廃止しつつ crash-resume / 順序エラーの区別を維持している。

**D3 (post-merge 遷移)**: `performPostMergeTransition` ヘルパを新設し、merge 成功経路（fresh merge, merge-during-wait, crash resume）すべての `runPostMergeCleanup` 直前に配置。best-effort（`stderrWrite` で warning 出力）で実装されており、遷移失敗が cleanup を妨げない。`postMergeVerify` が失敗する場合（integrity check 不通過）は cleanup 前に return するため `markJobArchived` は呼ばれず、ステータスが `awaiting-archive` のまま再実行可能になる点も正しい。

**D4 (section 2b)**: `listWithSourceDirs` に section 2b（worktree archive 走査）を追加。section 1b（main checkout archive）と対称な構造で、`includeArchived` gate が同一の caller 集合に影響を限定する。

### テストカバレッジ（test-cases.md 対照）

- **must 13 件すべて確認済み**:
  - TC-001: `deferArchivedTransition: true` 確認（orchestrator.test.ts + merge-then-archive.test.ts）
  - TC-002: archive 済み entry から job が解決され "No job found" を返さない
  - TC-003: worktree archive dir が `includeArchived: true` で発見（real-fs テスト）
  - TC-004/005: archiveRecorded vs !archiveRecorded の crash-resume / 順序エラー分岐
  - TC-006: fresh merge で `markJobArchived` → `runPostMergeCleanup` の呼び出し順序をアサート
  - TC-007: plain archive は記帳時に `archived` へ（TC-010 が担保）
  - TC-008: status 集合・遷移表は不変（lifecycle.ts 未変更 + 全テスト通過で確認）
  - TC-009/010: `deferArchivedTransition` 有無で `markJobArchived` 呼び出しが切り替わる
  - TC-014: merge-during-wait で `markJobArchived` → cleanup, integrity check なし
  - TC-015: merge escalation で `markJobArchived` も cleanup も呼ばれない
  - TC-017: `bun run typecheck && bun run test` が green
- **should 4 件**: TC-012/013（real-fs）・TC-016（best-effort warning）は明示的に実装済み。TC-011（記帳済み folder への再実行で新規 commit なし）は "should" かつ sub-module（`archiveChangeFolder` / `commitArchive`）の idempotent 契約に依拠しており許容範囲内。

### 既知トレードオフ（設計文書済み）

- merge 成功後に main へ取り込まれた state.json の status は `awaiting-archive` のまま（post-merge 遷移は worktree への書き込みのみ）。`ps --all` の表示に cosmetic な影響があるが、design.md が明示的に許容している。スコープ外。
- section 2 と 2b で `.git/specrunner-worktrees/` の `readdir` を二重に実行する。コストは無視できるレベルであり、設計の対称性を保つために意図的。

### スコープ外確認

- `--with-merge` なし `job archive` の挙動は不変（既存テスト通過）
- merge-wait grace（H-1）は変更なし
- config / verification 系は変更なし
- archive-record（folder-move）ロジック自体は変更なし
