# Code Review Feedback — iteration NNN

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

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.9

## Summary

全受け入れ基準を満たしている。`typecheck && test` green（6330 tests）。

### T-01: README reword

"run serially after `code-review`" → "run as a **parallel fan-out** after `code-review` — member reviewers execute concurrently, with only their commit/push serialized (FIFO mutex)" に置換済み。実装（`runCoordinatorFanOut` + `Promise.allSettled` + `commitMutex`）と一致。`code-review` トークンが文中に残るため既存の README drift guard は変更なしで green。

### T-02: registry.ts コメント修正

JSDoc (line 27) と mapping コメント (line 166) の 2 箇所が "12-step" → "13-step" に変更。diff はコメント行のみ。`STANDARD_DESCRIPTOR.steps` エントリ数（13）と一致。design-only / fast のカウントは変更なし（元々正確）。

### T-03: domain-model.md version 修正

`` `version` は常に 1。`` → `` `version` は `1 | 2`（新規 state は 2、旧 version 1 は read 時に 2 へ normalize）。`` に置換済み。`status` 節は保持されており、"正確なフィールドはコードが正典" SoT 注記（line 21）も無変更。

### T-04: axis (a) — registry N-step guard

- 期待値は `descriptor.steps.length` から動的に取得。テスト内に 13 / 1 / 9 のリテラルは比較式に現れない（TC-011 ✅）。
- `captured.length > 0` のガードにより、アノテーション削除も fail する（TC-006 ✅）。
- `pattern.lastIndex = 0` リセットがループ前に行われており、`g` フラグ付き regex の再利用バグなし。

### T-05: axis (b) — domain-model version guard

- `schema.ts` の `/version:\s*([\d\s|]+);/` で union テキストを抽出。`version:` は schema.ts に 1 箇所のみ存在するため false-positive なし。
- `` /`version` は[^。]*。/ `` で domain-model.md の版号節を抽出。line 14 の projection 記述中の `version` トークンは `` `version` は `` のパターンを含まないため誤マッチなし。
- "常に 1" に戻すと `2` が欠落して fail する（TC-008 ✅）。バージョン集合のハードコードなし（TC-012 ✅）。

