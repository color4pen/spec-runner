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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | correctness | `src/cli/finish.ts:74`, `src/cli/command-registry.ts:160` | `--force` フラグが CLI で "Force merge even with failing checks (relies on admin token)" と文書化されているが、`flags.force` は orchestrator で一切参照されておらず silently 無視される。フラグを指定したユーザーは admin bypass が起きると期待するが実際には何も起きない（機能不全）。また受け入れ基準「admin 権限を前提とするコメント / 実装が解消されている」にも非準拠。 | `--force` フラグを CLI から削除し、`FinishFlags.force` および JSDoc の admin bypass 記述を除去する。または `--force` を残す場合は help text を実際の動作に合わせて書き直す。 | yes |
| 2 | medium | testing | `tests/finish-orchestrator.test.ts` | TC-012（must）「PR already merged + archive 失敗 → markJobArchived 未呼び出しで escalation」のテストが不在。実装コード（`archiveResult.ok === false` 時に escalation を return し `markJobArchived` を呼ばない）は正しいが、回帰テストが存在しない。 | `archiveChangeFolder` が `{ ok: false, escalation: "..." }` を返すようにモックし、`result.exitCode === 1` かつ job status が `archived` 以外のままであることをアサートするテストを追加する。 | yes |
| 3 | low | testing | `tests/finish-orchestrator.test.ts` | TC-013/TC-014（must）で要求される「sleepFn が呼ばれない」条件が未検証。統合テスト（TC-BLOCKED-001 / TC-UNSTABLE-001）は end-to-end の escalation を確認しているが、`pollMergeStateAfterPush` が BLOCKED/UNSTABLE 時に retry ループに入らないことの直接検証がない。 | 統合テストに `sleepFn: vi.fn()` を渡し、BLOCKED/UNSTABLE 後に sleep が呼ばれていないことをアサートする。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.60

## Summary

コアの実装（BLOCKED/UNSTABLE 検出 → escalation、`isMergeTransientFailure` の pending/failed 分離、既マージ経路の archive 実行、merge gate 設計前提の rules.md 追記）は設計仕様を正確に実装しており、typecheck + test が green であることも確認されている。

修正が必要な点は 2 件:

1. `--force` フラグの admin bypass 記述（`src/cli/finish.ts` と `src/cli/command-registry.ts`）が残っており、受け入れ基準に非準拠。`flags.force` は orchestrator で参照されておらず機能しない dead flag であるため、CLI から削除するか説明を刷新する。

2. TC-012（must）「PR already merged + archive 失敗 → escalation」のテストが未実装。実装は正しいが保証がない。

Finding 3 は情報提供のみ（fix=no）。
