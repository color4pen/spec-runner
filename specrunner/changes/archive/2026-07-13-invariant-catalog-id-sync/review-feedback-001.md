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
| 1 | low | testing | `invariant-catalog-parity.test.ts` | TC-003（unenforced 方向 — catalog にあり歯にない ID が red になる）の detection fixture がない。`computeParity` の `unenforced` 計算は TC-ICS-02 が実データで行使しているが、failure-mode を摂動で示す fixture は存在しない。test-cases.md では priority: must。request.md の acceptance criteria が要求する検出テストは undocumented 方向（B-12 desync）のみのため非ブロッキング。 | `computeParity(catalogIds, new Set([...teethIds].filter(id => id !== "B-1")))` 相当の摂動を追加すれば明示的になるが任意。 | no |
| 2 | low | testing | `invariant-catalog-parity.test.ts` | TC-006（散文中の B-x 言及が catalog に混入しない）が implicit テストのみ。セクション限定 + 行頭セルパターンの二重防御で実 doc に対して TC-ICS-02 が通過することで間接検証されているが、合成 fixture による明示テストはない。 | 将来の追加として、`\| **B-99**` でない散文行を含む fixture を作り extractModelCatalogIds が B-99 を返さないことを assert できる。任意。 | no |
| 3 | low | testing | `invariant-catalog-parity.test.ts` | `sliceSection` の throw パス（見出し未検出時）が未テスト。TC-014（priority: should）。D2 の throw 仕様は実装されているが呼ばれる path の unit test がない。 | `expect(() => sliceSection("no heading", /^## 4\./m, /^## /m)).toThrow()` を追加可能。任意。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.65

## Summary

新ファイル `invariant-catalog-parity.test.ts` の実装は設計書（D1–D6）を忠実に反映しており、全 6 件の acceptance criteria を充足している。

- TC-ICS-01: model.md §4 と conformance.md (A) の catalog 内部整合を独立 assert
- TC-ICS-02: 双方向 parity（undocumented ∪ unenforced = ∅）を固定
- TC-ICS-03: allowlist ⊆ describe を固定（孤立 invariant 参照を検出）
- TC-ICS-04: liveness（各抽出器が非空を保証し vacuous pass を防止）
- TC-ICS-05: B-12 行を doc テキストから除去した摂動で parity が red を返すことを end-to-end 検証（perturbation guard 付き）

`sliceSection` の throw 設計、allowlist の liveness 除外、`teethIds = describe ∪ allowlist`（union で部分集合を吸収）はいずれも設計意図が明確で正しい。コメント限定編集（T-05）の diff は 2 行のみで `describe` / `invariant:` 行への変更がないことを確認した。検証は build / typecheck / 6472 tests / lint / coverage すべて green。

所見 3 件はいずれも info レベルで、次イテレーションでの修正は不要。

