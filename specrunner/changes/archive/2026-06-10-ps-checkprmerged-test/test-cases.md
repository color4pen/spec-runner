# Test Cases:

## Summary

- **Total**: 5 cases
- **Automated** (unit/integration): 5
- **Manual**: 0
- **Priority**: must: 3, should: 2, could: 0

### TC-001: job.pullRequest が null のとき null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > TC-01

**GIVEN** `job.pullRequest` が `undefined`（null 相当）の JobState
**WHEN** `checkPrMerged(job, mockClient)` を呼び出す
**THEN** 戻り値が `null`

### TC-002: githubClient が null のとき null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > TC-02

**GIVEN** 有効な `pullRequest` を持つ job と `null` の githubClient
**WHEN** `checkPrMerged(job, null)` を呼び出す
**THEN** 戻り値が `null`

### TC-003: getPullRequest が state:"MERGED" を返すとき true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 > TC-03

**GIVEN** `getPullRequest` が `{ state: "MERGED" }` を返す mock client と有効な job
**WHEN** `checkPrMerged(job, mockClient)` を呼び出す
**THEN** 戻り値が `true`

### TC-004: getPullRequest が state:"OPEN" を返すとき false を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > TC-04

**GIVEN** `getPullRequest` が `{ state: "OPEN" }` を返す mock client と有効な job
**WHEN** `checkPrMerged(job, mockClient)` を呼び出す
**THEN** 戻り値が `false`

### TC-005: getPullRequest が throw したとき null を返す（silent skip）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > TC-05

**GIVEN** `getPullRequest` が `Error("API error")` を reject する mock client と有効な job
**WHEN** `checkPrMerged(job, mockClient)` を呼び出す
**THEN** 戻り値が `null`（例外は上位に伝播しない）

## Result

```yaml
result: completed
total: 5
automated: 5
manual: 0
must: 3
should: 2
could: 0
blocked_reasons: []
```
