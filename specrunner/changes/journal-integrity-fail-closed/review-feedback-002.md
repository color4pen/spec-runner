# Code Review Feedback — iteration 002

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
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/store/journal-integrity.ts` | `scanJournalIntegrity` の active / archive セクションは非 ENOENT の readdir エラーを再 throw する一方、worktree の inner scan は全例外を swallow する（非対称）。doctor check の外側 try/catch が pass に落とすため最終挙動は D7 通りだが、`scanJournalIntegrity` を直接呼び出した場合の例外漏れリスクが残る。 | `scanJournalIntegrity` を public API 化する際に never-throw に統一する。現状はスキップ可。 | no |
| 2 | low | maintainability | `src/store/journal-integrity.ts` | `describeJournalIssue` の `"at line N"` は committed lines（tail partial drop 後）内の 0-based index であり、ファイル上の物理的な行番号とは異なる場合がある。診断メッセージとして将来改善余地あり。 | `specrunner verify` 実装時に物理行番号への変換を検討する。現状はスキップ可。 | no |

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

設計 D1–D7 すべてに忠実な実装。前回（iteration 001）の approved 判定と一致。以下、iteration 002 として独立して検証した観点を記す。

**fold() — T-01**  
末尾 partial 判定（最後の非空行の `JSON.parse` 失敗のみ drop）と mid-journal 破損の区別が正確。`typeof null === "object"` を `Array.isArray` とともに正しく排除し、`not-an-object` 破損を検出。未知 type の object は forward compat として無視し破損扱いしない。複数行が破損しても最初の 1 件のみ記録し、残り行から best-effort に fold を継続する実装も確認。任意入力で throw しない。

**journal-integrity helper — T-02**  
`detectCounterReversal` は history 先・step 後の順で最初の逆行を返す。fold > stored（crash recovery）は逆行ではない（`null` 返却）。`inspectJournalDir` は ENOENT・その他 I/O エラーのいずれも `null` に落とし、観測経路を壊さない。`corrupt-record` が `counter-reversal` より先にチェックされる順序が正しい（腐敗時は counter も不一致になるが、優先度は corruption 側）。

**load/persist/list — T-04**  
`composeSplitLayout`（tolerant）と `loadSplitLayout`（fail-closed wrapper）の分割がクリーン。`list()` の 5 call site すべてが tolerant パスを使うことを再確認。`persist()` は「corruption → 逆行 → recoveredCounters 設定」の順で正確。`mergeStepCountsMax` は削除済み。`load-by-job-id.ts` の worktree fallback catch が `JOURNAL_CORRUPTED` を明示的に再 throw する実装（誤って canonical 解決にフォールスルーしないための重要な安全弁）を確認。

**job show — T-05**  
UUID 経路は `JOURNAL_CORRUPTED` catch → banner 表示 + exit 0。slug 経路は `list()`（tolerant）→ `inspectJournalDir` probe → issue あり時は banner 出力・lineage/cost 抑止で設計通り。header（Job ID / Status 等）は projection 由来なので corruption 時も表示される。

**doctor check — T-06**  
factory + 注入 scan パターン。scan 例外は pass に落とし（doctor exit code を汚さない）、`required: false`、active / worktrees / archive の scan 対象が D7 通り。

**受け入れ基準**  
23 must テストケースすべてを独立して追跡確認。`typecheck && test` green（460 test files / 6381 tests）。silent-skip を固定していた既存テストが存在しないことも確認済み。
