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
| 1 | MEDIUM | maintainability | `src/state/schema/types.ts` | `ProfileAssurance` が named typed fields を持たない。D1・T-01・受け入れ基準はいずれも「index signature 保持 + optional typed fields を足す widening」と明示しており、spec-review-result-001.md も同様に確認している。実装は index signature のみ（`readonly [key: string]: unknown`）で named fields を省略したため、TypeScript レベルで `assurance.testDerivation` は `TestDerivationLevel \| undefined` でなく `unknown` に解決される。`satisfiesFloor` が string index 経由でアクセスする（`assurance["testDerivation"]`）のも静的型検査を活かせていない。 | `ProfileAssurance` に `readonly testDerivation?: TestDerivationLevel;`・`readonly biteEvidence?: BiteEvidenceLevel;`・`readonly specReview?: SpecReviewLevel;` の 3 フィールドを optional で追加する。`TestDerivationLevel \| undefined` は `unknown` のサブタイプなので index signature との共存はそのまま typecheck が通る。`assurance: {}` / `assurance: { level: "high" }` の既存 literal は依然 assignable（後方互換を壊さない）。`satisfiesFloor` の index アクセスはそのまま動作するが、`assurance.testDerivation` を typed アクセスに変えることで静的安全性を高められる。 | yes |
| 2 | LOW | testing | `tests/unit/cli/archive-minimum-assurance.test.ts` | TC-020 第 2 ケース「config load failure → minimumAssurance が undefined」が条件付きアサーション `if (mock.calls.length > 0)` を使っており、`runMergeThenArchive` が呼ばれなかった場合にアサーションが空振りして vacuously pass する。認証失敗で早期 return する場合は呼ばれないことをコメントで説明しているが、将来コードが変わったときに silently pass し続けるリスクがある。 | 早期 return ケース（auth 失敗）と "config なし → gate 無効" ケースをテスト上分離するか、`runMergeThenArchive` が呼ばれなかったことを明示的に assert する。または mock を整備して認証まで通るようにし、`minimumAssurance: undefined` を確実に確認する。主要ケース（TC-019・TC-020 第 1 ケース）は実装・アサーションとも問題ないため、優先度は低い。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.05

## Summary

実装の核心（`satisfiesFloor` の lattice 比較、archive Step 3.6 の fail-closed 動作、config validation、CLI 伝播）はすべて正しく動作しており、21 件の新規テスト・121 件の既存テストが全て green（typecheck / build / lint も green）。セキュリティ観点では out-of-loop authority が保たれており、fail-closed 挙動（truncated / assurance 欠落 / 未知値）も正しく実装されている。

ブロッキング findingは Finding 1 のみ。`ProfileAssurance` に named typed fields が無い点は D1・T-01・受け入れ基準の要求から外れており、spec-review で承認された「index signature 保持 + optional typed fields」という設計意図が実装で反映されていない。Fix は小さく（3 行 optional field 追加、typecheck はそのまま通る）、既存テストへの影響はない。
