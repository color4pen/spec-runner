# Test Cases: `job ls` のプロセス死亡検出

## Summary

- **Total**: 12 cases
- **Automated** (unit/integration): 11
- **Manual**: 1
- **Priority**: must: 7, should: 5, could: 0

---

### TC-001: pid のプロセスが死亡している running job は `running (stale?)` と表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `job ls` SHALL detect process death via pid/sidecar and mark running jobs stale > Scenario: pid のプロセスが死亡している running job

---

### TC-002: pid のプロセスが生存している running job は `running` のみ表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `job ls` SHALL detect process death via pid/sidecar and mark running jobs stale > Scenario: pid のプロセスが生存している running job

---

### TC-003: pid 不在・sidecar の pid が死亡している running job は `running (stale?)` と表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `job ls` SHALL detect process death via pid/sidecar and mark running jobs stale > Scenario: pid 不在・sidecar の pid が死亡している running job

---

### TC-004: pid / sidecar なしで 15 分超過した running job は `running (stale?)` と表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 経過時間 fallback は 15 分閾値を継承する > Scenario: pid / sidecar なしで 15 分を超過した running job

---

### TC-005: pid / sidecar なしで 15 分以内の running job は `(stale?)` が付かない

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 経過時間 fallback は 15 分閾値を継承する > Scenario: pid / sidecar なしで 15 分以内の running job

---

### TC-006: 古い awaiting-resume job には `(stale?)` が付かない

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: stale 表示は running status に限定される > Scenario: 古い awaiting-resume job

---

### TC-007: `formatJobRow` に `isStale=true` を渡すと STATUS 列に `running (stale?)` が含まれる

**Category**: unit
**Priority**: must
**Source**: design.md > D2: staleness は `runPs`（orchestration 層）で算出し、`formatJobRow` には `boolean` で渡す

**GIVEN** status が `running` の job と `isStale=true` を `formatJobRow` に渡す
**WHEN** `formatJobRow` を呼び出す
**THEN** 返す文字列の STATUS 列に `running (stale?)` が含まれる（TTY / 非 TTY 双方）

---

### TC-008: `formatJobRow` に `isStale=false`（または未指定）を渡すと `(stale?)` が付かない

**Category**: unit
**Priority**: must
**Source**: design.md > D2: staleness は `runPs`（orchestration 層）で算出し、`formatJobRow` には `boolean` で渡す

**GIVEN** status が `running` の job と `isStale=false`（省略時はデフォルト `false`）を `formatJobRow` に渡す
**WHEN** `formatJobRow` を呼び出す
**THEN** 返す文字列の STATUS 列は素の `running` であり `(stale?)` を含まない

---

### TC-009: `ps.ts` に `STALE_THRESHOLD_MS`（1 時間）が残っていない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** 実装済みの `src/cli/ps.ts`
**WHEN** `grep -n "STALE_THRESHOLD_MS" src/cli/ps.ts` を実行する
**THEN** 結果が 0 件（定義も参照も存在しない）

---

### TC-010: sidecar ファイルが存在しない場合 `isStaleRunning` に `undefined` が渡され 15 分 fallback が適用される

**Category**: integration
**Priority**: should
**Source**: design.md > D3: sidecar path 解決は `resume.ts` と同一の方法に揃える

**GIVEN** sidecar ファイルが存在しない `running` job（state.pid なし）があり、`updatedAt` が 16 分前
**WHEN** `runPs` を実行する
**THEN** `isStaleRunning` が `sidecarPath=undefined` で呼ばれ、出力に `running (stale?)` が含まれる

---

### TC-011: sidecar ファイルが存在する場合 `isStaleRunning` に sidecar パスが渡される

**Category**: integration
**Priority**: should
**Source**: design.md > D3: sidecar path 解決は `resume.ts` と同一の方法に揃える

**GIVEN** liveness sidecar ファイルが存在し、その中の pid が死亡済みの `running` job（state.pid なし）がある
**WHEN** `runPs` を実行する
**THEN** `isStaleRunning` が sidecar の絶対パスを受け取り、出力に `running (stale?)` が含まれる

---

### TC-012: `bun run typecheck && bun run test` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-03 受け入れ基準の最終検証

**GIVEN** T-01 / T-02 の実装が完了した状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし・テスト全件 pass

---

## Result

```yaml
result: completed
total: 12
automated: 11
manual: 1
must: 7
should: 5
could: 0
blocked_reasons: []
```
