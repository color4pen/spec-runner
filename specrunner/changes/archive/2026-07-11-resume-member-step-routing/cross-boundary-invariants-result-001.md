# Cross-Boundary Invariants Review — resume-member-step-routing
## Iteration 1

- **reviewer**: cross-boundary-invariants
- **verdict**: approved
- **scope**: 22 files changed, 2007 insertions(+), 12 deletions(-)

---

## 観点

変更していないコードが暗黙に持つ不変条件を、新しい挙動が黙って破っていないかを検出する。実装そのものの正しさではなく、既存機構との相互作用にだけ現れるクラスのバグを対象とする。

---

## 検査した不変条件と結果

### I-1: transition table は `"custom-reviewers"` エントリを持つ（不変条件: 変更前から存在）

**結論: 維持されている**

`resolveResumeStep` の resumePoint ブランチが `mapMemberToCoordinator` で `"custom-reviewers"` を返すようになった。pipeline.ts の `this.transitions.find(...)` は `"custom-reviewers"` に対して静的エントリを持つ（`CUSTOM_REVIEWERS_STEP_NAME` として既存）。修正後は member 名ではなく coordinator 名でループに入るため、`nextStep ?? "escalate"` の fallback に落ちない。

---

### I-2: `checkConsecutiveEscalations` の対象ステップ名は resume 時の `resumePoint.step` に依存する（不変条件: resume.ts 162行目、変更前後で変更なし）

**結論: 維持されている。ただし名前遷移あり（INFO）**

`resume.ts` の `checkConsecutiveEscalations` は `resumePoint?.step`（未マッピングの member 名）を受け取る。

- **初回 resume** (`resumePoint.step = "cross-boundary-invariants"`): `state.steps["cross-boundary-invariants"]` を照合。coordinator 内で member が escalate すると coordinator は `resumePoint.step = "custom-reviewers"` を書く。
- **2回目以降 resume** (`resumePoint.step = "custom-reviewers"`): `state.steps["custom-reviewers"]`（synthetic coordinator runs）を照合。

3連続 escalation の検出タイミングは同一（member escalation と coordinator synthetic escalation は 1:1 で対応するため、同じラウンド数でガードが発動する）。既存のガード不変条件は維持される。

---

### I-3: `buildAllowedStepSet` は "zero reviewer = coordinator なし" を保証する（不変条件: T-01 前から存在）

**結論: 維持されている**

T-01 の実装は `if (reviewers && reviewers.length > 0)` の内側だけで `CUSTOM_REVIEWERS_STEP_NAME` を追加する。`reviewers` が空・undefined のとき coordinator は許可集合に入らない。既存の「reviewer なし job では `--from custom-reviewers` が拒否される」動作は変わらない。

---

### I-4: `signalHandlerFired` フラグは最初の `await` より前に同期設定されなければならない（不変条件: race を防ぐための timing contract）

**結論: 維持されている**

`local.ts` の `signalCleanup`:

```typescript
const signalCleanup = async (): Promise<void> => {
  markSignalHandlerFired();   // ← 同期、あらゆる await より前
  try {
    const store = makeStore();
    const current = await store.load();  // ← 最初の await
```

`await store.load()` の間にイベントループが一瞬 idle になり `beforeExit` が発火しても、`isSignalHandlerFired()` はすでに `true`。exit-guard の各ハンドラ（`handleNoWorktreeExit` / `handlePerJobExit` / `handleGlobalExit`）は全て先頭で `if (isSignalHandlerFired()) return;` を実行するため、`appendInterruption` も `store.persist` も二重に呼ばれない。TC-016 テスト（`signal-handler-order.test.ts`）がこの timing contract をピン留めしている。

---

### I-5: exit-guard の non-signal backstop は `signalHandlerFired = false` のときに限り動作する（不変条件: 設計 D4 ゴール 5）

**結論: 維持されている**

フラグが `false`（signal handler 未発火）の場合、exit-guard は従来通り `appendInterruption` + `store.persist` を実行して `awaiting-resume` に遷移する。`createExitGuardHandler` の fired-guard（`let fired = false`）も同様に機能する。テスト TC-008/TC-009/TC-013 が非退行を保証している。

---

### I-6: `handleGlobalExit` は元来 `appendInterruption` を呼ばない（既存の非対称設計）

**結論: 変更なし（pre-existing asymmetry）**

`handleNoWorktreeExit` と `handlePerJobExit` は `appendInterruption` を呼ぶが、`handleGlobalExit` は呼ばない。今回の変更は `handleGlobalExit` 先頭に signal フラグチェックを追加したのみ。journal record に関する挙動は変わらない（フラグが true のとき `store.persist` のみがスキップされるが、`appendInterruption` はもともと呼ばれていない）。

---

### I-7: `resolveResumeStep` の stateStep（hard-crash fallback）ブランチはマッピング対象外

**結論: 設計の明示的スコープ外（INFO）**

kill -9 等の hard-crash で `resumePoint` が書かれず `state.step = "cross-boundary-invariants"` が残った場合、stateStep fallback ブランチは mapper を通らず member 名をそのまま返す。pipeline は member から始まり transition fallback → escalate に落ちる（修正前の同一バグ）。

設計 T-02 で「stateStep 分岐はマッピング対象外とする（既存動作維持）」と明示されており、スコープ外の意図的選択である。SIGINT / SIGTERM 経由（信号ハンドラが `resumePoint` を書く）では修正済みのため、通常運用への影響は限定的。

---

### I-8: `resolveResumeStep` は純関数から logInfo 副作用を持つ関数に変化

**結論: 機能影響なし（INFO）**

`--from <member名>` と `resumePoint.step = <member名>` のマッピング時に `logInfo` を呼ぶ。stdout への出力のみ。戻り値・例外挙動・型シグネチャは不変。既存テストは stdout をアサートしていないため green 維持。

---

## 総括

実装は以下の既存不変条件を破っていない:
- transition table coverage（coordinator は既存エントリを持つ）
- 連続 escalation ガード（resume 回数に対して同一レートで発動）
- 許可集合の reviewer 依存条件
- signal → flag 設定の timing contract
- non-signal exit-guard の backstop 機能

検出した 2 件（I-7、I-8）は設計の明示的選択（スコープ外）および情報レベルの観察であり、blocking 要因ではない。

- **verdict**: approved
