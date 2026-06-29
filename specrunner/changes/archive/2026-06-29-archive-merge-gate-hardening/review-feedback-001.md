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
| 1 | low | testing | tests/unit/core/archive/merge-then-archive.test.ts | `classifyMergeFailure` は module-private のため TC-012/013/014（should）の直接単体テストは統合テスト経由でのみカバーされる。should 優先度かつ動作は統合レベルで完全に検証済み。 | 対応不要（スコープ外）。必要であれば別途 export して単体テストを追加できるが、現時点では blocking でない。 | no |
| 2 | low | testing | tests/unit/core/archive/merge-then-archive.test.ts | `nowFn` の呼び出しシーケンスを `times` 配列でエンコードしているテストが複数ある。コード側で `nowFn` の呼び出し箇所が変わるとシーケンスがずれる可能性がある。現状は正確に動作している。 | 対応不要（production code に影響なし）。将来のリファクタ時に注意。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.65

## Summary

実装・テスト・検証のすべてが受け入れ基準を満たしている。

### 主要変更の確認

**T-01 (BLOCKED deferred)**: `merge-then-archive.ts` から即時 escalation ブロックが削除され、`isBlocked` をキャプチャして check 結果判明後にのみ評価する設計に変更されている。conflict check (DIRTY/CONFLICTING) → headSha guard → check polling の順序が維持されており「conflict が BLOCKED に優先する」制約も保持されている。`TC-MTA-BLOCKED-PENDING-THEN-MERGE` が TC-001/TC-002 を同時にカバーし、`TC-MTA-008`（更新版）が `getCheckStatus` 呼び出し後に escalation することを明示的にアサートして旧来の「check 前即断」が消えたことをピン留めしている。

**T-02 (Step 5 gate 撤廃)**: `checkMergeableForMerge` 呼び出しと import が削除されている。`TC-MTA-UNKNOWN-REACHES-MERGE` が `mergeable=UNKNOWN` + CLEAN + success で `mergePullRequest` が呼ばれることを確認し、`getPullRequest` 呼び出し回数が 2 回（initial + wait-loop iter 1）であることを検証して余分な mergeable-gate poll がないことをピン留めしている（TC-005/TC-006）。

**T-03 (merge failure 分類)**: `classifyMergeFailure` が conflict / checks-failed / other の 3 バケツを正しく分類し、対応する `failedStep` と推奨アクションで escalation している。3 パスすべてをテストがカバーしている（TC-007/TC-008/TC-009）。

**T-04 (削除)**: `src/` 内に `checkMergeableForMerge` / `MERGEABLE_RETRY_COUNT` / `MERGEABLE_RETRY_DELAY_MS` / `CheckMergeableResult` への参照がゼロ（grep 確認済み）。typecheck が green であることで型レベルの参照漏れもないことを確認（TC-015）。

**conflict fail-closed**: Step 4 の DIRTY/CONFLICTING 検出が変更なし（TC-MTA-006/007 が green）。merge API の 409 → conflict escalation も TC-MTA-MERGE-FAIL-CONFLICT でカバーされており二重の fail-closed が維持されている。

**検証結果**: `bun test` 5647 tests passed、typecheck green、build green、lint clean。adapter-level の transient/permanent retry テスト（TC-PM-015/016/018/020/021）が修正なしで通過しており TC-017/018 を充足している。

### 受け入れ基準チェック

| 基準 | 状態 |
|------|------|
| BLOCKED+pending → 待機継続 → check success → merge | ✅ TC-MTA-BLOCKED-PENDING-THEN-MERGE |
| BLOCKED 継続 + check success/none → branch-protection escalation | ✅ TC-MTA-008, TC-MTA-BLOCKED-NONE-EXHAUSTED |
| mergeable UNKNOWN でも escalation せず mergePullRequest 呼び出し | ✅ TC-MTA-UNKNOWN-REACHES-MERGE |
| 405 "not mergeable"/"is expected" transient retry → merge 成功 | ✅ adapter tests (TC-PM-016/018/021) |
| 409 conflict / "has failed" → permanent → escalation | ✅ TC-MTA-MERGE-FAIL-CONFLICT/CHECKS |
| DIRTY/CONFLICTING 検出不変 | ✅ TC-MTA-006/007 |
| checkMergeableForMerge 削除後に production 参照なし / typecheck green | ✅ grep 0件 / typecheck passed |
| bun test / typecheck / build | ✅ 全 green |
