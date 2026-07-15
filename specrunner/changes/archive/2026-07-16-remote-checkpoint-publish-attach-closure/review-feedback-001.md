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
| 1 | high | testing | tests/attach/attach-integration.test.ts:278,330,369 | TC-INT-003/004/005 が materialize に `origin/${BRANCH}`（symbolic ref）をハードコードしており、`verified.checkpointOid` を使っていない。受け入れ基準「OID が read/verify/materialize を貫くことをテストで固定する」(TC-009 must) が integration レベルで未固定。実装（CLI は正しく verified.checkpointOid を渡す）と乖離しており regression を検出できない。 | TC-INT-003（または新規テスト）で `runAttachVerification` の `verified.checkpointOid` を取得し `checkpointRef: verified.checkpointOid` で materialize を呼ぶ。worktree 内で `git rev-parse HEAD` が `verified.checkpointOid` と一致することを assert する。 | yes |
| 2 | high | testing | tests/attach/attach-integration.test.ts (欠落) | TC-010「検証後に origin が動いても検証済み OID を materialize する」(must) に対応する integration test が存在しない。test-cases.md は automated: completed と記載するが実装なし。verify 後に origin が前進するシナリオを検証する歯がない。 | verify 後に source clone で origin の branch を別コミットで前進させ、materialize が pre-advance OID を checkout することを git rev-parse HEAD で assert する integration test を追加する。 | yes |
| 3 | high | testing | tests/attach/attach-integration.test.ts:397-461 | TC-INT-006 は `verified.checkpointOid === sourceOid` を assert するが materialize まで進んでいない。コメントに "verify + materialize" とあるが materialize は実行されておらず、T-09 受け入れ基準「publish した OID と materialize した OID が一致する」の後段が未固定。 | TC-INT-006 を延長して `materializer.materialize(verified.checkpointOid)` を実行し、worktree HEAD OID が `sourceOid` と一致することを assert する。 | yes |
| 4 | low | maintainability | src/core/attach/verify-checkpoint.ts:83,121,131 | `stateJson` を 2 回独立して JSON.parse（rawVersion 取得と _journal 取得）しており、`composeSplitLayoutFromContent` 内分を含めると合計 3 回 parse。`fold(eventsJsonl)` も line 131 で再呼び出し（composeSplitLayoutFromContent 内で既に実行済み）。正しさに影響はないが冗長。 | 最初の parse 結果を変数に持ち回り、fold 結果を composeSplitLayoutFromContent の corruption 判定と共有する。blocking ではないため fixer の判断に委ねる。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.40

## Summary

実装コード（D1–D6 全体）は設計と一致しており、7031 テストが green、typecheck・lint・changed-line-coverage も clean。以下の実装観点は確認済みで問題なし:

- D1: fetch 直後の OID 一度解決（`orchestrator.ts` rev-parse → 全 git コマンドで OID 使用、TC-ORC-006 で固定）
- D2: `VerifiedCheckpoint.checkpointOid` 透過と CLI の `verified.checkpointOid` 使用（TC-ORC-004, TC-MA-001）
- D3: 述語 closure（TC-VC-011 events-missing / TC-VC-012 counter-reversal / TC-VC-013 reads() 欠落）
- D4: 既存 local branch 非破壊（TC-WTM-025/026）
- D5: loop 末尾単一 seam publish（TC-PUB-001）と push 失敗でも例外なし（TC-CFS-004）
- D6: ADR Positive 文言是正・D7 citation 除去（grep 確認済み）

ブロッキングは**テスト固定の欠落**。受け入れ基準が「統合テストで固定する」と明示している TC-009（OID-through-materialize）と TC-010（origin 前進後の materialize OID 固定）、および T-09 E2E の materialize アサーションが integration test に実装されていない。実装が正しい事実と、テスト網に穴がある事実は独立しており、穴があることで将来の regression が検出できない状態になっている。
