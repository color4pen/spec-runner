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
| 1 | low | testing | tests/core/pipeline/pipeline.test.ts | TC-003（guard halt 出口で publish される）は test-cases.md で must+automated と宣言されているが、TC-PUB-001 には escalation と exhaustion のシナリオのみあり guard halt 専用ケースがない。seam は `state.status === "awaiting-resume"` を条件とするため guard halt を含む全経路を構造的にカバーするが、宣言と実装の対応が取れていない。 | TC-PUB-001 コメントに "guard halt は loop 収束により同一 seam に至る（構造的カバレッジ）" 旨を一行追記すれば宣言との乖離が明確になる。blocking ではない。 | no |
| 2 | low | maintainability | src/core/attach/verify-checkpoint.ts | `stateJson` を 2 回独立して JSON.parse し `fold(eventsJsonl)` も再呼び出しする（review-001 finding #4、Fix=no）。正しさには影響しない。 | (継続して対処不要) | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.35

## Summary

review-001 のブロッキング 3 件がすべて解決されている。

**修正確認:**

- **Finding #1（high）TC-INT-003/004/005 symbolic ref**: `verified.checkpointOid` を使用するよう修正済み。`checkpointRef: verified.checkpointOid` で materialize を呼ぶ正しい経路に統一されている。✅
- **Finding #2（high）TC-010 欠落**: `tests/attach/attach-integration.test.ts` に TC-010 を追加済み。origin が verify 後に前進しても `worktreeHead === preAdvanceOid` かつ `worktreeHead !== advancedOid` を git 実機で assert している。✅
- **Finding #3（high）TC-INT-006 materialize 欠落**: TC-INT-006 に materialize ステップ（`materializer.materialize` → `git rev-parse HEAD` → `expect(worktreeHead).toBe(sourceOid)`）を追加済み。publish OID と materialize OID の一致が実機で固定された。✅

**実装の正当性（D1–D6 全体）:**

- **D1 OID 固定**: `orchestrator.ts` が fetch 直後に `git rev-parse origin/<branch>^{commit}` で OID を一度解決し、以後の ls-tree / cat-file / show はすべてその OID を使用する。TC-ORC-006 で symbolic ref の再評価がないことを spy で固定。
- **D2 OID 透過**: `VerifiedCheckpoint.checkpointOid` に OID を型で載せ、CLI が `attachCheckpoint.checkpointRef = verified.checkpointOid` で materialize する。TC-INT-003 / TC-010 / TC-INT-006 で worktree HEAD = published OID を実機 assert。
- **D3 述語 closure**: v2 `events.jsonl` 必須（TC-VC-011）、counter reversal 検査（TC-VC-012）、resume step `reads()` 必須入力 tree-precheck（TC-VC-013）をすべて typed error で拒否し、pure 述語の契約（I/O 副作用なし）を維持。
- **D4 branch 安全**: materializer が `git rev-parse --verify --quiet refs/heads/<branch>` で pre-existence を確認し `branchWasPreExisting` を manager.create に渡す。TC-WTM-025 で pre-existing → cleanup 不実行、TC-WTM-026 で non-existing → cleanup 実行を固定。
- **D5 単一 seam publish**: pipeline.ts の while ループ末尾（`notifyJobTerminal` 直前）に `state.status === "awaiting-resume"` の seam を追加。TC-PUB-001 で 1 回のみ呼び出しを assert、TC-PUB-002 で awaiting-archive 出口は seam を経由しないことも確認。`commitFinalState` の `messageLabel` 分岐（checkpoint/finalize）を TC-CFS-006 / TC-LR-020 で固定。
- **D6 citation 是正**: `src/` 内の `ADR-20260715 D7` は grep 0 件で消去確認。ADR Positive 文言は publisher 完成後の事実（cross-env resume が閉じる）に更新済み。

検証フェーズ: build / typecheck / test（7031 passed）/ lint / changed-line-coverage すべて green。

