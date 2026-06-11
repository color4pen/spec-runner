# Test Cases: stale-running-recovery

## Summary

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 7, should: 11, could: 1

---

### TC-001: running かつ pid 死亡の job が resume される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: inbox run は孤児化した running job を検出して自動回復する > Scenario: running かつ pid 死亡の job が resume される

---

### TC-002: pid が生存している running job は対象外

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: inbox run は孤児化した running job を検出して自動回復する > Scenario: pid が生存している running job は対象外

---

### TC-003: issue-link が無い stale-running job も回復対象になる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: inbox run は孤児化した running job を検出して自動回復する > Scenario: issue-link が無い stale-running job も回復対象になる

---

### TC-004: 上限未満では自動 resume しカウンタを増やす

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 進捗なしの連続自動回復に上限を設ける（crash-loop guard） > Scenario: 上限未満では自動 resume しカウンタを増やす

---

### TC-005: 回復間に進捗があればカウンタがリセットされる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 進捗なしの連続自動回復に上限を設ける（crash-loop guard） > Scenario: 回復間に進捗があればカウンタがリセットされる

---

### TC-006: 進捗ゼロで上限到達すると escalation に倒れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 進捗なしの連続自動回復に上限を設ける（crash-loop guard） > Scenario: 進捗ゼロで上限到達すると escalation に倒れる

---

### TC-007: issue-link がある job は escalation コメントが投稿される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 上限超過時は awaiting-resume へ遷移し escalation 通知に委ねる > Scenario: issue-link がある job は escalation コメントが投稿される

---

### TC-008: issue-link が無い job はコメントを投稿せず遷移のみ行う

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 上限超過時は awaiting-resume へ遷移し escalation 通知に委ねる > Scenario: issue-link が無い job はコメントを投稿せず遷移のみ行う

---

### TC-009: 上限超過後は human の /resume 経路で拾える状態になる

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 上限超過時は awaiting-resume へ遷移し escalation 通知に委ねる > Scenario: 上限超過後は human の /resume 経路で拾える状態になる

---

### TC-010: staleRecovery フィールドを持つ state が validateJobState を通過する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `staleRecovery: { attempts: 2, stepCount: 5 }` を含む JobState オブジェクト
**WHEN** `validateJobState` に渡す
**THEN** 例外が throw されない

---

### TC-011: staleRecovery を持たない既存 state が従来どおり読める

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `staleRecovery` フィールドを持たない v1/v2 形式の JobState オブジェクト
**WHEN** `validateJobState` に渡す
**THEN** 例外が throw されず、既存フィールドがそのまま保持される

---

### TC-012: countStepRuns が steps 各配列長の総和を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-05

**GIVEN** `steps: { "build": [{...}, {...}], "test": [{...}] }` を持つ JobState
**WHEN** `countStepRuns(state)` を呼ぶ
**THEN** `3` が返る。`steps` が undefined の場合は `0` が返る

---

### TC-013: getJobSlug が空を返す job は recover/escalate から除外される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-05

**GIVEN** `getJobSlug` が空文字を返す stale-running な JobState
**WHEN** `planStaleRecoveries([state])` を呼ぶ
**THEN** `recovers` にも `escalates` にもその job が含まれない

---

### TC-014: staleRunningJobIds に含まれない running job は recover/escalate されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-05

**GIVEN** `status=running` な job が存在し、`staleRunningJobIds` にその jobId が含まれていない
**WHEN** `planInbox({ ..., staleRunningJobIds })` を呼ぶ
**THEN** `plan.recovers` にも `plan.escalates` にもその job が含まれない

---

### TC-015: recover ループで persistState → resumeJob の順で呼ばれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D2

**GIVEN** `isStale` が true を返す `status=running` な job（attempts < 上限）が存在する
**WHEN** `runInbox` を実行する
**THEN** `persistState(jobId, { ...job, staleRecovery: { attempts: n+1, stepCount: current } })` が呼ばれ、その後 `resumeJob(slug, undefined)` が呼ばれる（この順序で）

---

### TC-016: escalate 後の state が awaiting-resume / pid=null / staleRecovery=null を持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D4

**GIVEN** `isStale` が true を返し attempts >= `MAX_STALE_RECOVERY_ATTEMPTS` の job が存在する
**WHEN** `runInbox` を実行する
**THEN** `persistState` に渡る state が `status=awaiting-resume`、`pid=null`、`staleRecovery=null` を持ち、`resumePoint` が設定されている

---

### TC-017: recover の persistState が throw しても他アクションが継続し summary.errors に集約される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / T-06

**GIVEN** 2 件の stale-running job が存在し、1 件目の `persistState` がエラーを throw する
**WHEN** `runInbox` を実行する
**THEN** 2 件目の recover が実行され、失敗した 1 件が `summary.errors` に含まれる

---

### TC-018: dry-run では recover/escalate effect が呼ばれず summary に件数が反映される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / T-06

**GIVEN** stale-running job が存在し、dry-run モードで `runInbox` を呼ぶ
**WHEN** `runInbox({ dryRun: true, ... })` を実行する
**THEN** `persistState`・`resumeJob`・`notifyEscalation` が一切呼ばれず、`summary.recovered` または `summary.escalated` に件数が入る

---

### TC-019: recover または escalate のみが発生した tick で "Nothing to do." が出力されない

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04

**GIVEN** start/reject/resume が 0 件で recover が 1 件以上発生するシナリオ
**WHEN** CLI handler がサマリを出力する
**THEN** `[inbox] Nothing to do.` は出力されない

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 7
should: 11
could: 1
blocked_reasons: []
```
