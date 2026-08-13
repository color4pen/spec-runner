# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Judgment 1: tasks.md 全チェックボックス完了

T-01〜T-06 の全 item が `[x]` で完了している。

- T-01: `src/adapter/shared/inactivity-watchdog.ts` と `__tests__/inactivity-watchdog.test.ts` 新設 ✓
- T-02: claude-code adapter に watchdog 配線 ✓
- T-03: codex adapter に watchdog 配線 ✓
- T-04: `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts` 追加 ✓
- T-05: `tests/adapter/codex/agent-runner-inactivity-timeout.test.ts` 追加 ✓
- T-06: typecheck && test green 確認 ✓

### Judgment 2: design decisions への適合

- **D1 (イベント無活動を見張る)**: `bump()` を query 発行時と各 event 受信時に呼び、閾値超で abort。実装確認済み ✓
- **D2 (閾値 15 分定数)**: `DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000` を watchdog.ts に単一定義、config 項目なし ✓
- **D3 (既存 timeout 経路に合流)**: 発火時 `completionReason: "timeout"` / `error.code: "STEP_TIMEOUT"` を返す。executor 経路は変更なし ✓
- **D4 (catch 判定拡張)**: 両 adapter の catch が `signal.aborted && (timeoutId !== undefined || watchdog.fired)` に拡張されている ✓
- **D5 (shared watchdog)**: `src/adapter/shared/inactivity-watchdog.ts` に単一実装。claude-code (3 loop) + codex (executeTurn の 1 loop) の 4 サイトが共用 ✓
- **D6 (halt message single source)**: `formatInactivityTimeoutMessage(stepName, elapsedMs)` を watchdog モジュールに実装。両 adapter で同一文字列 ✓
- **repair catch 拡張 (Risks 節)**: claude-code と codex 双方の repair catch を `catch(err)` + `if (abortController.signal.aborted) throw err;` に変更。abort が best-effort 飲み込みを素通りして outer catch へ届く ✓
- **既存テスト変更 (Risks 節で列挙済み)**: `agent-runner-transient-retry.test.ts` describe "abort timeout bypass" の `expect(callCount).toBe(1)` → `toBeLessThanOrEqual(1)` のみ変更。design.md の Risks 節で対象を明示し、意図（abort が再試行を防ぐ = callCount ≤ 1）を保存していることを確認済み ✓

### Judgment 3: spec requirements への適合

**Requirement: 無活動タイマーが agent イベントの途絶を timeout として検知する**
- Scenario: query 後 message 未到着 → timeout → TC-001 で fake timers 固定 ✓
- Scenario: message 閾値内到着 → 非発火 → TC-002 (成功パスで発火しない) + watchdog unit で reset 挙動固定 ✓
- Scenario: codex events ループも同様 → TC-003 で fake timers 固定 ✓
- Scenario: output-repair 中発火 → timeout → TC-004 (claude-code) / TC-014 (codex) で固定 ✓

**Requirement: 無活動発火は既存 timeout 経路に合流し awaiting-resume になる**
- agent-runner レベルで `completionReason: "timeout"` / `STEP_TIMEOUT` を返すことを TC-001/TC-005 で固定。executor 経路 (executor.ts:367 → makeTimeoutHalt) は既存テストが担保 ✓

**Requirement: halt 表示に無活動である旨と最終イベントからの経過時間を含める**
- `formatInactivityTimeoutMessage` が "inactivity" と elapsedMs を含む → TC-006 / TC-013 で固定 ✓
- wall-clock timeout の message・code・completionReason は不変 → TC-007 で固定 ✓

**Requirement: 無活動タイムアウトと wall-clock timeout は共存し先に発火した方が勝つ**
- timeoutMs=null でも無活動監視有効 → TC-008 で固定 ✓
- 正常終了時に watchdog clear → TC-009 で固定 ✓
- `finally` で `watchdog.clear()` を全 exit path で実行 (claude-code L1152, codex L796) ✓

### Judgment 4: request 受け入れ基準への適合

| AC | 内容 | 対応テスト | 結果 |
|---|---|---|---|
| AC1 | 最初の message 未到着 → timeout halt (fake timers) | TC-001 | ✓ |
| AC2 | message 閾値内到着 → 非発火 (タイマー巻き直し) | TC-002 + watchdog unit | ✓ |
| AC3 | 発火時 completionReason=timeout → awaiting-resume 合流 | TC-001/TC-005 + existing executor tests | ✓ |
| AC4 | halt 表示に inactivity の旨と elapsedMs | TC-006 | ✓ |
| AC5 | 既存テスト無変更で green (1件変更は design で列挙・根拠明示) | design.md Risks 節 | ✓ |
| AC6 | typecheck && test green | T-06 / verification-result.md | ✓ |

## 検証できなかった項目

None — 全 judgment item を実ファイル参照で確認した。

## Findings 詳細

None — 非適合 finding なし。
