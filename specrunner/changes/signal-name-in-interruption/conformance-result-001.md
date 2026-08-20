# Conformance Result — signal-name-in-interruption — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement 1 — Interruption records SHALL carry the signal name

**spec.md 規範内容**: 登録済みシグナル（SIGINT/SIGTERM/SIGHUP）でプロセスが終了したとき、interruption レコードに `signal` フィールドが必須。`reason` は `"signal"` のまま不変。

**確認内容**:
- `src/store/event-journal.ts` の `InterruptionRecord` に `signal?: "SIGINT" | "SIGTERM" | "SIGHUP"` フィールドを追加（line 97）。JSDoc コメントあり ✓
- `src/core/runtime/local.ts` の `signalCleanup`（line 1683）が `(signal: NodeJS.Signals)` を受け取り、`appendInterruption({ type: "interruption", reason: "signal", signal: signal as "SIGINT"|"SIGTERM"|"SIGHUP", ts })` を呼び出す（lines 1695–1700）✓
- `src/core/lifecycle/exit-guard.ts` の `appendInterruption` 呼び出し（lines 63–67, 132–136）は `signal` フィールドなし（D5 準拠）✓

**Scenario 検証**:
| Scenario | テスト |
|---|---|
| SIGTERM → interruption record に signal 名 | `signal-name-in-interruption.test.ts` 参数化 TC (SIGTERM) |
| SIGINT → interruption record に signal 名 | `signal-name-in-interruption.test.ts` 参数化 TC (SIGINT) |
| SIGHUP → interruption record に signal 名 | `signal-name-in-interruption.test.ts` 参数化 TC (SIGHUP) |
| exit-guard 発火時 → signal フィールド不在 | `signal-name-in-interruption.test.ts` TC-004 ブロック |

---

### Requirement 2 — Transition history message SHALL include the signal name

**spec.md 規範内容**: `transitionJob` 呼び出しの `reason` が `"Interrupted by <SIGNAME>"` 形式であること。

**確認内容**:
- `src/core/runtime/local.ts` line 1703: `` reason: `Interrupted by ${signal}` `` ✓
- `src/core/runtime/managed.ts` line 748: `` reason: `Interrupted by ${signal}` `` ✓

**Scenario 検証**: SIGTERM/SIGHUP の local 側と SIGTERM/SIGINT/SIGHUP の managed 側について、`persistSpy.mock.calls[0][0].history.at(-1).message` が `"Interrupted by <SIGNAME>"` を含むことをアサート済み ✓

---

### Requirement 3 — `resumePoint.reason` SHALL remain unchanged

**spec.md 規範内容**: local/managed は `"Interrupted by signal"`、exit-guard は `"signal"` のまま変更しないこと。

**確認内容**:
- `src/core/runtime/local.ts` line 1708: `reason: "Interrupted by signal"` （resumePoint — 不変）✓
- `src/core/runtime/managed.ts` line 753: `reason: "Interrupted by signal"` （resumePoint — 不変）✓
- `src/core/lifecycle/exit-guard.ts` lines 71, 140, 164: `reason: "signal"` （不変）✓

**Scenario 検証**:
- TC-010（local）: `persistedState.resumePoint?.reason === "Interrupted by signal"` アサート済み ✓
- TC-011（managed）: 同上 ✓
- TC-012（exit-guard）: 既存の `exit-guard.test.ts` lines 212, 272, 312 が `rp.reason === "signal"` をアサート済み（変更なし・green）✓

---

### Requirement 4 — SIGHUP SHALL be registered and deregistered in both runtimes

**spec.md 規範内容**: local/managed の `registerCleanup` で SIGHUP 登録、`teardown` で SIGHUP 解除。

**確認内容**:
- `src/core/runtime/local.ts` line 1723: `process.on("SIGHUP", signalCleanup)` ✓
- `src/core/runtime/local.ts` line 1742: `process.off("SIGHUP", internals.signalCleanup)` ✓
- `src/core/runtime/managed.ts` line 767: `process.on("SIGHUP", signalCleanup)` ✓
- `src/core/runtime/managed.ts` line 778: `process.off("SIGHUP", internals.signalCleanup)` ✓

**Scenario 検証**:
| Scenario | テスト |
|---|---|
| SIGHUP registered in local runtime | TC-013 (`process.on` spy) |
| SIGHUP deregistered in local runtime teardown | TC-014 (`process.off` spy) |
| SIGHUP registered in managed runtime | TC-015 (`process.on` spy) |
| SIGHUP deregistered in managed runtime teardown | TC-016 (`process.off` spy) |

---

### request.md 受け入れ基準

| 基準 | 確認結果 |
|---|---|
| SIGTERM/SIGINT/SIGHUP interruption レコードに `signal` フィールド（テストで固定） | ✅ TC-001, TC-002, TC-003 |
| transition message にシグナル名を含む（テストで固定） | ✅ TC-005, TC-006, TC-007, TC-008, TC-009 |
| `reason: "signal"` 不変・既存 resume/canon-provenance テスト green | ✅ backward-compat test + TC-021 regression |
| SIGHUP ハンドラ登録・cleanup で `process.off` （テストで固定） | ✅ TC-013, TC-014, TC-015, TC-016 |
| 既存 signal-state/exit-guard テスト変更なし green | ✅ signal-handler-order.test.ts (1)・exit-guard.test.ts (16) |
| `typecheck && test` green | ✅ typecheck 0 errors・test 全 green |

---

### Verification Gate 確認

| Phase | 結果 |
|---|---|
| build | passed |
| typecheck | passed（exit 0、型エラーなし）|
| test | passed（新規 16 テスト + 全既存スイート green）|
| lint | passed |
| changed-line-coverage | passed |

---

### 後方互換性: signal-handler-order.test.ts リスク確認

既存テストは `signalCleanup()` を引数なしで呼び出す（line 84–86 の `as unknown as { signalCleanup: () => Promise<void> }` キャスト）。変更後のシグネチャは `(signal: NodeJS.Signals) => Promise<void>` だが、引数なし呼び出し時は `signal === undefined` となる。`appendInterruption`・`persist` は両方 mock 済みのため、実害なし。テスト 1 件、変更なし、green ✓

---

## 検証できなかった項目

None — すべての normative 項目（spec.md の 4 Requirements・12 Scenarios、request.md の 6 受け入れ基準）を検証済み。

## Findings 詳細

指摘なし（typed findings なし）。

