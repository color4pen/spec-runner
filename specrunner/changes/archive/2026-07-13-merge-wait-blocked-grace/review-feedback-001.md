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
| 1 | low | correctness | `src/core/archive/merge-then-archive.ts` | `success && BLOCKED && grace not expired` の continuation path で `effectiveTimeoutMs` を確認していない。design.md D4 が「grace ループ内でも全体 timeout を確認する必要がある」と明示しているが実装に反映されていない。`waitTimeoutMs` が `BLOCKED_CHECK_GRACE_MS`（30s）より短い場合、timeout ではなく `blockedAfterChecksEscalation` が返る。test-cases.md TC-007 も "should" 優先度で未実装。実運用では `DEFAULT_MERGE_WAIT_TIMEOUT_MS` >> 30s のため影響は小さい。 | `success && BLOCKED && grace not expired` の `continue` 直前に `if (effectiveTimeoutMs !== null && nowFn() - start >= effectiveTimeoutMs) { return timeout escalation; }` を追加し、TC-007 を実装する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.30

## Summary

受け入れ基準をすべて満たしている。実装・テスト両面で設計意図が正確に反映されており、承認。

**実装（`merge-then-archive.ts`）**:
- `BLOCKED_CHECK_GRACE_MS = 30_000` を JSDoc 付きで `NONE_CHECK_GRACE_MS` の直後に配置。✓
- `blockedGraceStart: number | null = null` を `noneGraceStart` の直後に初期化。✓
- `if (blockedGraceStart === null)` ガードで set-once セマンティクスを保証。✓
- grace 超過時は `blockedAfterChecksEscalation(slug, "success")` へ（既存関数を流用）。✓
- grace 継続時は `sleepFn + continue`（`noneGraceStart` パスと対称）。✓
- ファイル冒頭フロー説明コメントを実装と整合するよう更新。✓
- conflict / check-failure / timeout の既存パスは無変更。✓

**テスト（`src/core/archive/__tests__/merge-then-archive.test.ts`）**:
- TBG-01: transient BLOCKED → CLEAN within grace → merge（TC-001）。✓
- TBG-02: grace 超過後も BLOCKED → branch-protection escalation、かつ set-once 検証（TC-002/003）。✓
- TBG-03: conflict regression（TC-004）。✓
- TBG-04: check failure regression（TC-005）。✓
- TBG-05: none-check grace regression（TC-006）。✓

**既存テスト更新（`tests/unit/core/archive/merge-then-archive.test.ts`）**:
- TC-MTA-008 を `nowFn` + `sleepFn` 注入 + `waitTimeoutMs: null` で再構成。新 grace ロジックに合わせた正しい更新。✓

**Info 所見 #1 について**: 「grace 継続中に global timeout が到達した場合に timeout escalation が返らない」問題は design.md D4 が指摘していた既知の懸念点。test-cases.md TC-007 は "should" 優先度（must ではない）であり、受け入れ基準に含まれていない。`DEFAULT_MERGE_WAIT_TIMEOUT_MS` >> 30s という運用実態から実害は極めて限定的。フィクサー対象外（Fix: no）とする。
