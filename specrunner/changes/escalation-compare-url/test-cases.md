# Test Cases: escalation 通知コメントに branch の compare URL を含める

## Summary

- **Total**: 10 cases
- **Automated** (unit/integration): 10
- **Manual**: 0
- **Priority**: must: 7, should: 3, could: 0

---

### TC-001: branch 確定 escalation でコメントに compare URL が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: escalation 通知コメントは branch の compare URL を含む > Scenario: branch が確定した escalation で compare URL がコメントに含まれる

---

### TC-002: branch null の escalation は URL なしで従来文面が投稿される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: branch 未確定時は compare URL を省略して従来文面で投稿する > Scenario: branch が null の escalation は URL 行なしで投稿される

---

### TC-003: base-branch が main 以外の request で URL の base に反映される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: compare URL の base は request.md の base-branch を反映する > Scenario: base-branch が main 以外の request で URL の base に反映される

---

### TC-004: base-branch 未記録の legacy state で URL の base が main にフォールバックする

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: compare URL の base は request.md の base-branch を反映する > Scenario: base-branch が未記録の state では main にフォールバックする

---

### TC-005: base-branch が persist→load で保持される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base-branch は job 起動時に永続化され round-trip で保持される > Scenario: base-branch が persist→load で保持される

---

### TC-006: base-branch 欠落の legacy state が load エラーにならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: base-branch は job 起動時に永続化され round-trip で保持される > Scenario: base-branch 欠落の legacy state が load できる

---

### TC-007: buildCompareUrl が正しい URL 形式を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D2: compare URL の組み立てを純粋ヘルパー buildCompareUrl に切り出す / tasks.md > T-04

**GIVEN** `owner = "acme"`, `repo = "my-repo"`, `base = "develop"`, `branch = "feat/my-slug-abc12345"` を引数に取る
**WHEN** `buildCompareUrl(owner, repo, base, branch)` を呼ぶ
**THEN** 戻り値が `https://github.com/acme/my-repo/compare/develop...feat/my-slug-abc12345` に等しい

---

### TC-008: job start で state.request.baseBranch が request.md の base-branch と一致する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** base-branch が `release/1.x` と記録された request.md を持つ job を `bootstrapJob` で初期化する
**WHEN** 生成された `JobState` を参照する
**THEN** `state.request.baseBranch` が `"release/1.x"` に等しい

---

### TC-009: pipeline 通知経路の escalation body に compare URL が含まれる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `issueNumber` を持ち、branch が確定（非 null）した `awaiting-resume` 状態の `JobState` を持つ pipeline が escalation 通知を発する
**WHEN** `notifyJobTerminal` が `createIssueComment` を呼ぶ
**THEN** `createIssueComment` に渡る body が `https://github.com/{owner}/{repo}/compare/{base}...{branch}` 形式の URL を含む

---

### TC-010: branch 確定時も既存コメント要素（marker・step・reason・resume）が保持される

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** branch が確定した `awaiting-resume` state
**WHEN** `buildEscalationComment(state)` を呼ぶ
**THEN** 本文に `kind="escalation"` マーカー、停止 step 名、reason、`specrunner job resume <slug>` コマンドが含まれ、compare URL 行の追加によって既存要素が欠落しない

---

## Result

```yaml
result: completed
total: 10
automated: 10
manual: 0
must: 7
should: 3
could: 0
blocked_reasons: []
```
