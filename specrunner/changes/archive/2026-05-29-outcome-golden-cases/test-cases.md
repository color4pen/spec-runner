# Test Cases: grounded 検査の golden case を追加して contract の床を固める

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 10
- **Manual**: 3
- **Priority**: must: 9, should: 3, could: 1

---

## Floor 参照（複製なし）

以下の既存テストが `contract/golden-cases.md` の floor の一部を担保しており、本ファイルでは複製しない:
- `parseReviewVerdict` approved 抽出 → TC-018（`tests/unit/parser/review-verdict.test.ts`）
- `parseReviewVerdict` 空→null → TC-021（`tests/unit/parser/review-verdict.test.ts`）

---

### TC-001: golden-case 専用テストファイルの存在と floor 参照コメント

- **Category**: unit
- **Priority**: must
- **Source**: T-01 / request.md 要件 1 / design.md D1

**GIVEN** `tests/unit/contract/golden-cases.test.ts` が新規作成されている

**WHEN** ファイルの内容を確認する

**THEN**
- ファイルが `tests/unit/contract/golden-cases.test.ts` に存在する
- ファイル冒頭のコメントに `contract/golden-cases.md` 対応の回帰ネットである旨が記載されている
- TC-018 / TC-021（`tests/unit/parser/review-verdict.test.ts`）への参照コメントがある
- `parseReviewVerdict` のテストコードは複製されていない

---

### TC-002: parseFixableFindings — Fix=yes 行がある場合に count > 0 を返す（must-pass）

- **Category**: unit
- **Priority**: must
- **Source**: T-02 must-pass ケース / request.md 要件 2 / contract/golden-cases.md「弾いてはいけない」

**GIVEN** `## Findings` セクションに以下を含む文字列:
```
## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | yes |
```

**WHEN** `parseFixableFindings(content)` を呼び出す

**THEN** 戻り値が `1`（> 0）である

---

### TC-003: parseFixableFindings — 空文字列で count = 0 を返す（must-fail-safe）

- **Category**: unit
- **Priority**: must
- **Source**: T-02 must-fail-safe ケース 1 / request.md 要件 2

**GIVEN** 入力が空文字列 `""`

**WHEN** `parseFixableFindings("")` を呼び出す

**THEN** 戻り値が `0` である

---

### TC-004: parseFixableFindings — Findings セクションなしで count = 0 を返す（must-fail-safe）

- **Category**: unit
- **Priority**: must
- **Source**: T-02 must-fail-safe ケース 2 / request.md 要件 2

**GIVEN** `## Findings` を含まない文字列（例: `"# Code Review\n\n## Summary\n\nNo issues.\n"`）

**WHEN** `parseFixableFindings(content)` を呼び出す

**THEN** 戻り値が `0` である

---

### TC-005: parseFixableFindings — Fix 列なし旧形式で count = 0 を返す（must-fail-safe / backward compat）

- **Category**: unit
- **Priority**: must
- **Source**: T-02 must-fail-safe ケース 3 / design.md D2 / review-findings.ts Design D5

**GIVEN** `## Findings` セクションはあるが `Fix` 列を含まない旧形式テーブル:
```
## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |
```

**WHEN** `parseFixableFindings(content)` を呼び出す

**THEN** 戻り値が `0` である（Fix 列不在 = backward compat で 0）

---

### TC-006: VerificationStep.parseResult — `## Verdict: failed` 入力で verdict ≠ "passed"（must-fail-safe）

- **Category**: unit
- **Priority**: must
- **Source**: T-03 must-fail-safe ケース / request.md 要件 2 / contract/golden-cases.md「通してはいけない」

**GIVEN** `"## Verdict: failed"` を含む文字列と最小限の `StepDeps` スタブ（slug のみ）

**WHEN** `VerificationStep.parseResult(content, deps)` を呼び出す

**THEN**
- `result.verdict` が `"passed"` でない
- `result.verdict` が `"failed"` である

---

### TC-007: VerificationStep.parseResult — `## Verdict: passed` 入力で verdict = "passed"（floor 補強）

- **Category**: unit
- **Priority**: should
- **Source**: T-03 補強ケース / design.md D3

**GIVEN** `"## Verdict: passed"` を含む文字列と最小限の `StepDeps` スタブ

**WHEN** `VerificationStep.parseResult(content, deps)` を呼び出す

**THEN** `result.verdict` が `"passed"` である

---

### TC-008: VerificationStep.parseResult — verdict 行なしで verdict = null（safe default）

- **Category**: unit
- **Priority**: should
- **Source**: T-03 補強ケース / design.md D3 / verification.ts parseResult 実装

**GIVEN** `## Verdict:` 行を含まない文字列（例: `"# Verification Result\n\n## Build\n\npassed\n"`）と最小限の `StepDeps` スタブ

**WHEN** `VerificationStep.parseResult(content, deps)` を呼び出す

**THEN** `result.verdict` が `null` である（parse 失敗時の safe default）

---

### TC-009: parseFixableFindings — Fix=yes が複数行ある場合に正しい count を返す

- **Category**: unit
- **Priority**: should
- **Source**: T-02 / review-findings.ts 複数行カウント実装

**GIVEN** `## Findings` セクションに `Fix=yes` の行が 2 行、`Fix=no` の行が 1 行含まれるテーブル:
```
## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/a.ts:1 | Issue A | Fix A | yes |
| 2 | MEDIUM | style | src/b.ts:2 | Issue B | Fix B | yes |
| 3 | LOW | style | src/c.ts:3 | Issue C | Fix C | no  |
```

**WHEN** `parseFixableFindings(content)` を呼び出す

**THEN** 戻り値が `2` である

---

### TC-010: parseFixableFindings — Fix 値の大文字小文字を区別しない（case-insensitive）

- **Category**: unit
- **Priority**: could
- **Source**: T-02 / review-findings.ts `.toLowerCase() === "yes"` 実装

**GIVEN** `## Findings` セクションに Fix 列が `YES`（大文字）の行を含むテーブル

**WHEN** `parseFixableFindings(content)` を呼び出す

**THEN** 戻り値が `> 0` である（大文字も fixable としてカウント）

---

### TC-011: VerificationStep.parseResult のテストで runner の mock を使っていない（設計制約）

- **Category**: manual
- **Priority**: must
- **Source**: T-03 acceptance criteria / design.md D3 / request.md 要件 2

**GIVEN** `tests/unit/contract/golden-cases.test.ts` の `VerificationStep.parseResult` テスト

**WHEN** ファイルを静的にレビューする

**THEN**
- `vi.mock("node:child_process")` が存在しない
- `vi.mock("node:fs/promises")` が存在しない
- `spawn` の mock が存在しない
- `runVerification` の mock が存在しない

---

### TC-012: 既存テストファイルへの変更なし

- **Category**: manual
- **Priority**: must
- **Source**: T-04 acceptance criteria / request.md 要件 3・スコープ外

**GIVEN** 本変更の git diff

**WHEN** 以下のファイルを確認する:
- `tests/unit/parser/review-verdict.test.ts`
- `tests/unit/core/verification/runner.test.ts`
- `tests/unit/core/verification/parse-result.test.ts`

**THEN** 上記ファイルに変更がない（diff なし）

---

### TC-013: typecheck + test が全 green

- **Category**: manual
- **Priority**: must
- **Source**: T-04 / request.md 受け入れ基準

**GIVEN** 新規追加された `tests/unit/contract/golden-cases.test.ts` を含むコードベース

**WHEN** `bun run typecheck && bun run test` を実行する

**THEN**
- typecheck が exit 0 で完了する
- test が exit 0 で完了する（新規テスト含め全テスト green）

---

## Result

```yaml
result: completed
total: 13
automated: 10
manual: 3
must: 9
should: 3
could: 1
blocked_reasons: []
```
