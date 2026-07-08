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
| 1 | low | testing | `src/core/archive/__tests__/post-merge-integrity.test.ts` | iteration 001 finding #3 未解消。TC-PMI-02 に `failedStep`（TC-024）と `resumeCommand`（TC-023）の exact 値アサーションが追加されていない。部分文字列マッチのみで固定されている。should 優先度のため非ブロッキング。 | TC-PMI-02 に `expect(escalation).toContain("post-merge integrity check (main)")` と `expect(escalation).toContain("specrunner job archive --with-merge my-job")` を追加する。 | no |
| 2 | low | testing | `src/core/archive/__tests__/post-merge-integrity.test.ts` | iteration 001 finding #4 未解消。TC-026（`git worktree add` 失敗 → warn + `{ ok: true }`）・TC-027（`git rev-parse` 失敗 → warn + `{ ok: true }`）が未実装。should 優先度のため非ブロッキング。 | `makeSpawnFn` で `"git worktree add"` / `"git rev-parse"` を非 0 exit にしたテストを追加し、`{ ok: true }` と `stderrWrite` 呼び出しをアサートする。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.05

## Summary

iteration 001 の HIGH 指摘 2 件が正しく修正された。

**修正確認**:
- **Finding #1（HIGH）**: `tests/unit/config/schema.test.ts` に `describe("validateConfig: archive.postMergeVerify (TC-001–TC-008)")` ブロックが追加され、absent/empty-array valid、string valid、object valid、非配列・空文字列・run 欠落・run 空文字列 → CONFIG_INVALID の 8 シナリオがすべて実装・固定済み。
- **Finding #2（HIGH）**: `src/core/archive/__tests__/merge-then-archive.test.ts` に TC-015（`merge-during-wait with postMergeVerify set → integrity check NOT invoked`）が追加され、wait loop 内 MERGED 検出経路で `runPostMergeIntegrityCheck` が呼ばれないことをアサート済み。

**実装品質（変化なし）**: `post-merge-integrity.ts` のモジュール分離・SpawnFn 注入・transport-auth の条件付き適用（unwrapped spawn での cleanup）・best-effort worktree cleanup（finally ブロック）・escalation フォーマット（PR 番号・SHA 帰属・MERGED 事実・NOT rolled back・fix steps）はすべて設計通り。`merge-then-archive.ts` の挿入点（Step 5.5、fresh-merge パスのみ）、resume 経路（Step 2）および merge-during-wait 経路（wait loop 内 MERGED）への非挿入も正しい。config schema・CLI wiring・docs も仕様に適合。

**残存 LOW 指摘**（非ブロッキング）: TC-023/TC-024 の exact アサーション未追加、TC-026/TC-027 のインフラ耐障害性テスト未実装。いずれも should 優先度で、実装コードの正しさは TC-PMI-04/TC-PMI-05 で間接的に保護されている。

受け入れ基準をすべて満たし、`typecheck && test` は green（6094 tests）。
