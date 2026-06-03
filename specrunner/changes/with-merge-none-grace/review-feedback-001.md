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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/unit/core/archive/merge-then-archive.test.ts | TC-003（grace 内に `none → success` 直接遷移）の独立 TC がない。TC-MTA-011 は `none → pending → success` の 3 poll シナリオのみ。ループ構造上は正しく動くが、直接遷移ケースが明示されていない。 | `none` 後の次 poll で `SUCCESS_ROLLUP` を返す 2-poll シナリオの TC を追加すると明示度が上がる。 | no |
| 2 | LOW | testing | tests/unit/core/archive/merge-then-archive.test.ts | TC-008（plain archive で GitHub API 呼び出しが発生しない、should 優先度）の自動 TC が存在しない。orchestrator.ts を touch していないため挙動は維持されているが、テストとして明示されていない。 | 既存の orchestrator 単体テストで `githubClient` 非依存を確認するか、本テストファイルに "plain archive path does not call getCheckStatus" を追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 10 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.55

## Summary

実装は設計書・要件すべてに適合している。

`none` を `success` から分離し、`noneGraceStart` を set-once で記録する独立クロック（D1/D2）が正しく実装されている。初回 `none` で elapsed=0 のため必ず 1 回 sleep してから grace 判定に進む（即 merge 排除）。`effectiveTimeoutMs` を grace 分岐が一切参照しないため、`waitTimeoutMs: null`（無制限）環境でも grace は 60 秒で bounded（D3）。production コード変更が `merge-then-archive.ts` のみで `orchestrator.ts` は無変更、client-closed を維持（D4）。

テストは must 6 件すべてをカバー（TC-MTA-002/011/012/013 + 既存 TC 回帰）。`sleepFn`/`nowFn` 注入で実時間 0 秒での grace 境界検証が確立されている（D5）。`bun typecheck && bun test` green（265 files / 3052 tests）を確認。

findings は info 2 件のみで、いずれも実動作に影響しない。
