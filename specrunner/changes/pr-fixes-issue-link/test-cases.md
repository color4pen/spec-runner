# Test Cases: PR の Fixes 行を job state の issueNumber から導出する

## Summary

- **Total**: 9 cases
- **Automated** (unit/integration): 7
- **Manual**: 2
- **Priority**: must: 6, should: 3, could: 0

---

### TC-001: issueNumber を持つ job の PR body に `Fixes #<issueNumber>` が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PR body の Fixes 行は jobState.issueNumber を優先源とする > Scenario: issueNumber を持つ job の PR body に `Fixes #<issueNumber>` が含まれる

---

### TC-002: issueNumber が request.md の issue より優先される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PR body の Fixes 行は jobState.issueNumber を優先源とする > Scenario: issueNumber が request.md の issue より優先される

---

### TC-003: issueNumber が無く request.md に issue がある場合は従来の出力を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issueNumber が無い場合は request.md の issue にフォールバックする > Scenario: issueNumber が無く request.md に issue がある場合は従来の出力を維持する

---

### TC-004: 両方無い場合は Fixes 行が出力されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: issueNumber も issue も無い場合は Fixes 行を出力しない > Scenario: 両方無い場合は Fixes 行が出力されない

---

### TC-005: issueNumber が `null` のとき不在扱いでフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md > D2: 「設定済み」判定は `!= null`（null / undefined 双方を不在扱い）で行う

**GIVEN** `JobState.issueNumber` が `null` で、`parsedRequest.issue` が `"#100"` の job
**WHEN** `renderPrBody` が PR body を生成する
**THEN** body は `Fixes #100` を含む（null は不在扱いとしてフォールバック分岐を通る）

---

### TC-006: issueNumber が `undefined` のとき不在扱いでフォールバックする

**Category**: unit
**Priority**: should
**Source**: design.md > D2: 「設定済み」判定は `!= null`（null / undefined 双方を不在扱い）で行う

**GIVEN** `JobState.issueNumber` が `undefined` で、`parsedRequest.issue` が `"#100"` の job
**WHEN** `renderPrBody` が PR body を生成する
**THEN** body は `Fixes #100` を含む（undefined は不在扱いとしてフォールバック分岐を通る）

---

### TC-007: renderPrBody の signature と import が変更されていない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria（新規 import を追加しない / signature・呼び出し側変更なし）

**GIVEN** 変更後の `src/core/pr-create/body-template.ts` と `src/core/step/pr-create.ts`
**WHEN** import 宣言と `renderPrBody` の関数 signature を確認する
**THEN** `body-template.ts` に新規 import が追加されていない、かつ `renderPrBody` の引数・返り値型が変更前と同一であり、`pr-create.ts` の呼び出し行が変更されていない

---

### TC-008: typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** 変更後のコードベース全体
**WHEN** `bun run typecheck` を実行する
**THEN** エラーが 0 件で終了する

---

### TC-009: 既存テスト全件が regression なく pass する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria（regression なし）

**GIVEN** 変更後のコードベースと既存テストスイート（`body-template.test.ts` の Fixes 系テストを含む）
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass し、変更前に pass していたケースが新たに fail しない

---

## Result

```yaml
result: completed
total: 9
automated: 7
manual: 2
must: 6
should: 3
could: 0
blocked_reasons: []
```
