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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `tests/unit/config/schema.test.ts` | TC-001〜TC-008（`archive.postMergeVerify` の config schema バリデーション）が未実装。test-cases.md が must と定義した 8 シナリオ（absent/empty-array valid、string/object valid、非配列・空文字列・run 欠落・run 空文字列 → CONFIG_INVALID）がいずれも存在しない。`shellCommandSchema` 自体は verification.commands の TC-VERIF-* で間接的に動作確認済みだが、`archive.postMergeVerify` のキーパスでの検証は未固定。 | `tests/unit/config/schema.test.ts` に `describe("validateConfig: archive.postMergeVerify ...")` ブロックを追加し TC-001〜TC-008 相当を実装する。既存の TC-VERIF-* と対称的な構造で書ける。 | yes |
| 2 | high | testing | `src/core/archive/__tests__/merge-then-archive.test.ts` | TC-015（merge-during-wait 経路で `postMergeVerify` セット時でもインテグリティチェックが呼ばれない）が未実装。test-cases.md が must と定義しているが、wait loop 中に `MERGED` を検出する経路（`merge-then-archive.ts` 行 325–331）を `postMergeVerify` セット済みで通過するテストが存在しない。実装は正しいが回帰保護がない。 | `src/core/archive/__tests__/merge-then-archive.test.ts` の wiring describe ブロックに "T-PMI-05: merged-during-wait with postMergeVerify set → integrity check NOT invoked" テストを追加する。`getPullRequest` を OPEN→MERGED の 2 回返しにし、`postMergeVerify` を設定した上で `runPostMergeIntegrityCheck` が呼ばれないことをアサートする。 | yes |
| 3 | low | testing | `src/core/archive/__tests__/post-merge-integrity.test.ts` | TC-023（`resumeCommand` 正確な値）・TC-024（`failedStep` 正確な値）が should だが未固定。TC-PMI-02 は部分文字列マッチのみ。 | TC-PMI-02 に `expect(escalation).toContain("post-merge integrity check (main)")` と `expect(escalation).toContain("specrunner job archive --with-merge my-job")` を追加する。 | yes |
| 4 | low | testing | `src/core/archive/__tests__/post-merge-integrity.test.ts` | TC-026（`git worktree add` 失敗 → warn + `{ ok: true }`）と TC-027（`git rev-parse` 失敗 → warn + `{ ok: true }`）が should だが未実装。インフラ耐障害性の回帰保護が欠ける。 | `makeSpawnFn` で `"git worktree add"` / `"git rev-parse"` を非 0 exit にしたテストを追加し `{ ok: true }` と stderrWrite 呼び出しをアサートする。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.85

## Summary

実装品質は高い。`post-merge-integrity.ts` のモジュール分離・SpawnFn 注入・transport-auth の有無による分岐・best-effort worktree cleanup（unwrapped spawn）・escalation フォーマット（PR 番号・SHA 帰属・NOT rolled back・fix steps）はすべて設計通り。`merge-then-archive.ts` の挿入点（Step 5.5、fresh-merge パスのみ）と resume/wait 経路の非挿入も正しい。config schema・CLI wiring・docs もいずれも仕様に適合している。`typecheck && test` green 確認済み（6094 tests）。

ブロッキングは **テストカバレッジの不足**のみ。test-cases.md が must と定義した 9 シナリオのうち TC-001〜TC-008（schema 検証）と TC-015（merge-during-wait + postMergeVerify セット）が未実装。実装コードは正しいが、回帰保護が欠けた状態でマージするのは不適切なため `needs-fix` とする。修正スコープは tests 2 ファイルへの追記のみ（実装コードの変更は不要）。

