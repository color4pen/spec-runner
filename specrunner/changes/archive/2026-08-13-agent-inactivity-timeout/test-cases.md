# Test Cases: agent 呼び出しの無活動タイムアウト

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 14
- **Manual**: 0
- **Priority**: must: 11, should: 4, could: 0

---

### TC-001: query発行後、最初のmessageが閾値内に到着しない場合にtimeout halt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する > Scenario: query 発行後、最初の message が閾値内に到着しない

---

### TC-002: messageが閾値内で到着し続ける限り無活動タイマーは発火しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する > Scenario: message が閾値内で到着し続ける限り発火しない

---

### TC-003: codex adapter の events ループも同じ無活動監視を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する > Scenario: codex adapter の events ループも同じ無活動監視を持つ

---

### TC-004: output-repair ループ実行中に watchdog が発火しても timeout として返る（claude-code）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する > Scenario: output-repair ループ実行中に watchdog が発火しても timeout として返る

---

### TC-005: 無活動発火が awaiting-resume に落ちる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 無活動発火は既存 timeout 経路に合流し awaiting-resume になる > Scenario: 無活動発火が awaiting-resume に落ちる

---

### TC-006: 無活動 timeout の message が旨と経過時間を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt 表示に無活動である旨と最終イベントからの経過時間を含める > Scenario: 無活動 timeout の message が旨と経過時間を含む

---

### TC-007: wall-clock timeout の表示は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: halt 表示に無活動である旨と最終イベントからの経過時間を含める > Scenario: wall-clock timeout の表示は不変

---

### TC-008: timeoutMs 未設定でも無活動監視は有効

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 無活動タイムアウトと wall-clock timeout は共存し、先に発火した方が勝つ > Scenario: timeoutMs 未設定でも無活動監視は有効

---

### TC-009: 正常終了時に無活動タイマーが停止する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 無活動タイムアウトと wall-clock timeout は共存し、先に発火した方が勝つ > Scenario: 正常終了時に無活動タイマーが停止する

---

### TC-010: watchdog unit — bump 無しで timeoutMs 経過すると onFire が 1 回発火する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `createInactivityWatchdog(onFire, timeoutMs)` を生成し、`bump()` を 1 回だけ呼んでタイマーを arm する(追加の bump は行わない)  
**WHEN** fake timers で `timeoutMs` 分の時間を進める  
**THEN** `onFire` がちょうど 1 回呼ばれ、`watchdog.fired === true`、`watchdog.elapsedMs === timeoutMs`

---

### TC-011: watchdog unit — 発火後の bump() は再 arm しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** watchdog が一度発火し `fired === true` になっている  
**WHEN** `bump()` を呼び、さらに `timeoutMs` 分の時間を進める  
**THEN** `onFire` は再度呼ばれない（合計 1 回のまま）

---

### TC-012: watchdog unit — clear() 後はタイマーが発火しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `createInactivityWatchdog` で watchdog を生成し `bump()` で arm した直後  
**WHEN** `watchdog.clear()` を呼び（複数回呼んでも安全）、その後 `timeoutMs` 分の時間を進める  
**THEN** `onFire` は呼ばれない

---

### TC-013: watchdog unit — formatInactivityTimeoutMessage が step 名と elapsedMs を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `stepName = "my-step"`、`elapsedMs = 900000`  
**WHEN** `formatInactivityTimeoutMessage("my-step", 900000)` を呼ぶ  
**THEN** 返り値の文字列が "inactivity"（または同義語）と `"my-step"` と `"900000"` を含む

---

### TC-014: codex output-repair 中の watchdog 発火が outer catch に届き timeout として返る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** codex adapter が output-repair turn を実行中であり、repair catch に `if (abortController.signal.aborted) throw err;` が存在する  
**WHEN** fake timers で無活動タイマーを発火させ `AbortController` が abort される  
**THEN** abort エラーが repair catch を素通りして outer catch へ伝播し、`completionReason === "timeout"` / `error.code === "STEP_TIMEOUT"` を返す（`"success"` にならない）

---

### TC-015: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

verification フェーズの `bun run typecheck` および `bun run test` が両方 green であることを確認する。既存の timeout 系 pin テスト（TC-032/034/035/041 等）が無変更で通ることを含む。

---

## Result

```yaml
result: completed
total: 15
automated: 14
manual: 0
must: 11
should: 4
could: 0
blocked_reasons: []
```
