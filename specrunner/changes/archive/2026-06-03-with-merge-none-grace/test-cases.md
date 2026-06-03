# Test Cases: `job archive --with-merge` の `none`（check 未出現）早期 merge を grace 待ちで塞ぐ

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 10
- **Manual**: 1
- **Priority**: must: 6, should: 3, could: 2

---

### TC-001: 初回 none で即 merge しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 初回 `none` は即 merge せず grace 期間 check の出現を待つ > Scenario: 初回 none で即 merge しない

---

### TC-002: grace 内に check が pending として出現 → 待機を継続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 内に check が出現したら既存の wait ループ判定に合流する > Scenario: grace 内に check が pending として出現 → 待機を継続する

---

### TC-003: grace 内に check が success として出現 → merge へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 内に check が出現したら既存の wait ループ判定に合流する > Scenario: grace 内に check が success として出現 → merge へ進む

---

### TC-004: grace 内に check が failure として出現 → escalation する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 内に check が出現したら既存の wait ループ判定に合流する > Scenario: grace 内に check が failure として出現 → escalation する

---

### TC-005: CI 無し repo は grace 経過後に merge される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace 経過後も `none` なら merge へ進む > Scenario: CI 無し repo は grace 経過後に merge される

---

### TC-006: 無制限 timeout でも CI 無し repo は永久 hang しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: grace は有限・bounded で main の wait timeout と独立する > Scenario: 無制限 timeout でも CI 無し repo は永久 hang しない

---

### TC-007: grace は config / flag で変更できない

**Category**: manual
**Priority**: could
**Source**: spec.md > Requirement: grace は有限・bounded で main の wait timeout と独立する > Scenario: grace は config / flag で変更できない

---

### TC-008: plain archive で GitHub API 呼び出しが発生しない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 変更は merge 経路に閉じ archive 本体は client-closed を維持する > Scenario: plain archive で GitHub API 呼び出しが発生しない

---

### TC-009: grace 未超過の間は sleepFn が呼ばれ即 merge していない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `getCheckStatus` が常に `NONE_ROLLUP` を返し、`nowFn` が grace（60_000ms）未満の時刻を返す状況で `--with-merge` を実行する
**WHEN** wait ループが `none` を観測する各周回を処理する
**THEN** `mergePullRequest` は呼ばれず、`sleepFn(pollIntervalMs)` が少なくとも 1 回呼ばれる

---

### TC-010: 既存 TC（success / failure / pending / conflict / timeout / already-merged）が回帰なく green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** grace 分岐追加前から存在する各ケース（`success` で即 merge、`failure` で escalation、`pending` → timeout で escalation、`DIRTY` / `CONFLICTING` / `BLOCKED` / already-merged）のテスト設定
**WHEN** grace 変更後の `merge-then-archive.ts` で同一ケースを実行する
**THEN** 既存の期待挙動がすべて従来どおりに成立し、grace 分岐による回帰がない

---

### TC-011: grace 起点は set-once でリセットされない

**Category**: unit
**Priority**: could
**Source**: design.md > D2

**GIVEN** `getCheckStatus` が `none` → `pending` → `none`（flicker）と返す mock で、`nowFn` が grace 超過前の時刻を返す
**WHEN** wait ループが flicker 後に再び `none` を観測する
**THEN** `noneGraceStart` が再記録されず、grace 起点は最初の `none` 観測時刻のまま保たれ、grace カウンタは bounded を維持する

---

## Result

```yaml
result: completed
total: 11
automated: 10
manual: 1
must: 6
should: 3
could: 2
blocked_reasons: []
```
