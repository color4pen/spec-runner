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
| 1 | low | testing | tests/unit/core/archive/merge-then-archive-floor-provenance.test.ts | TC-023 未実装: gate.ts が `BiteEvidenceRecord` に `baseOid`/`candidateOid` を埋める実装は正しいが、これを positively assert するテストが存在しない。将来的な削除を検知できない。 | `deriveAchievedAssurance` への直接 unit test を追加するか、gate.test.ts に record フィールドの assertion を追加する | no |
| 2 | low | testing | specrunner/changes/assurance-provenance-floor/test-cases.md | `result: completed / total: 29 / automated: 29` は overclaim。TC-012、TC-013、TC-023、TC-025、TC-026、TC-028、TC-029（いずれも should 優先度）の明示的なテスト実装がない。TC-027 は既存 TC-021 でカバー、TC-024 は unchanged gate.test.ts でカバー。 | test-cases.md の result を実態に合わせて修正するか、不足している should テストを追加する | no |
| 3 | low | maintainability | src/core/archive/achieved-assurance.ts | P4 check（config === undefined）が testDerivation も absent にする。testDerivation の derivation は config 不要だが、early return で両 dimension を落とす。設計要件（"config absent → fail-closed"）とは整合するが、コメントが無く意図が読み取りにくい。 | P4 check の直前に「config is required for runTestsAtCommit only, but we gate both dimensions together per requirement」といったコメントを追加する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.75

## Summary

P0 修正（宣言 assurance rubber-stamp → 達成 provenance による floor 判定）は正しく実装されている。`achieved-assurance.ts` の fail-closed 一貫性、`satisfiesFloor` / `getProfile` 無変更、凍結検査 primitive の追加、`BiteEvidenceRecord` 後方互換拡張、CLI の runtime/config 注入すべてが設計方針に沿っている。17 件の must テストおよびすべての受け入れ基準（T1〜T8）が充足されており、7265 tests passed（typecheck・lint 含む）。

観察事項はいずれも should 優先度テストの欠落および test-cases.md の記述精度であり、実装の正しさに影響しない。Phase 2（per-test executor）実装時に TC-023 等の追加を推奨する。

