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
| 1 | low | correctness | `src/cli/ps.ts` | `formatJobRow` の `isStale` ブランチは status ガードを持たないため、呼び出し側が `isStale=true` を非 `running` job に渡すと `running (stale?)` が表示される。`runPs` 経路では `isStaleRunning` が非 `running` で即 `false` を返すため実害なし。 | 不要。`isStaleRunning` の契約で保護されている。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 8.90

## Summary

実装は設計（D1–D4）に忠実で、受け入れ基準をすべて満たしている。

- `STALE_THRESHOLD_MS`（1 時間）は完全に撤去され、閾値の single source of truth が `isStaleRunning` の `STALE_RUNNING_THRESHOLD_MS`（15 分）に統一された。
- `isStaleRunning` の再利用（D1）、staleness を `runPs` で事前計算して `formatJobRow` に `boolean` で渡すパターン（D2）、sidecar ファイル存在確認 → 不在時 `undefined` 渡し（D3）がいずれも設計どおりに実装されている。
- test-cases.md の must ケース（TC-001〜TC-004, TC-007, TC-008, TC-012）はすべて対応するテストでカバーされており、検証フェーズで 3325 件全 pass を確認済み。
- 唯一の所見（#1）は `formatJobRow` の呼び出し側規約の話であり、`runPs` 経路では `isStaleRunning` の契約が保護している。ブロッキング要因なし。
