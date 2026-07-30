# cross-boundary-invariants Review — evidence-authorship-enforcement

- **iteration**: 2
- **verdict**: approved

---

## 観点

変更が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Iteration 1 所見の追跡

### F-01【解消確認】signal handler が anchor holder を迂回する

`src/core/runtime/local.ts:1444-1448`:

```ts
const makeStore = () => {
  if (slugOpts) {
    // F-01: inject anchorHolder so appendInterruption + persist update the anchor.
    return new JobStateStore(jobId, cwd, { ...slugOpts, anchorHolder: journalAnchor });
  }
```

`anchorHolder: journalAnchor` が注入されている。さらに signal handler 本体（lines 1518-1534）で、interruption + state write の後に `commitFinalState` + `pushEvidenceAnchor` を呼ぶ checkpoint パスが追加されている:

```ts
if (updated.branch && slugOpts?.slug && journalAnchor) {
  try {
    await commitFinalState({ ..., messageLabel: "checkpoint" });
    const snap = journalAnchor.snapshot();
    if (snap !== null) {
      await pushEvidenceAnchor(wrappedSpawnFn, cwd, updated.branch, snap.digest);
    }
  } catch { /* Best-effort */ }
}
```

これにより SIGINT/SIGTERM 停止後の resume で on-disk == origin anchor が成立し、false tamper detection が起きない。TC-016b がこの経路を固定している。**解消。**

### F-02【解消確認】stale-running 復元 write が authenticity check 前に on-disk を書き換える

`src/core/command/resume.ts:125-192`:

```
// F-02: run BEFORE stale-running recovery write so the check targets the
// unmodified on-disk state.
```

authenticity check が stale-running recovery write より前に配置されている。コードのコメントが設計意図を明示している。**解消。**

---

## 今回の所見

### O-01 【観測 / info】 stale-running 経由の "連続 crash" は accepted fail-closed になる（設計 D8 との整合確認）

**経路**: resume → auth check pass（on-disk == origin anchor）→ stale-recovery persist（anchorHolder なし）→ 再 crash → 次の resume で auth check fail

stale-running recovery persist（`resume.ts:203-216`）は `anchorHolder` なしの store を使うため、on-disk が origin anchor を超えて advance する。この状態で再 crash すると次の resume の auth check が halt する。

これは設計 D8「crash-recovery 窓は fail-closed に倒す accepted posture」と整合する（stale-running は既にひとつの crash シナリオ）。human が再 resume すれば `restoreResumeJournal` が origin checkpoint bytes に戻してから halt するため、authentic 状態への回帰経路は保たれる。

**action 不要**。設計上の accepted 境界として記録する。

### O-02 【観測 / info】 parallel round メンバーは `produceResult`（persist なし）のため holder 競合は発生しない

parallel round 実行中、メンバーは `executor.produceResult` → `produce`（D1 保証: "Does NOT persist state"）を呼ぶ。`CommitOrchestrator.begin` / `apply` は呼ばれない。Coordinator の `commitRound` が単一 persist で全 member 結果をまとめて書く。

holder に対する concurrent write は存在しない。次の sequential step の `verifyNodeJournalAuthorship` に false positive は発生しない。**action 不要**。

---

## 全体評価

F-01・F-02 はともに適切に解消されている。

- `makeStore` への `anchorHolder` 注入で、signal handler が書く interruption + state bytes が in-process anchor に反映される。
- signal handler 内の checkpoint（`commitFinalState` + `pushEvidenceAnchor`）で origin anchor が on-disk に追いつき、次の resume が false tamper を踏まない。
- auth check を stale-running recovery write より前に配置することで、check 対象 on-disk が常に未変更状態になる。
- `factory.ts` が `JournalAnchorHolder` を常に生成して注入しており、production パスで `journalAnchor` が undefined になる経路はない。
- parallel round メンバーは persist を持たないため、holder ↔ disk 一致の不変条件に競合は発生しない。

cross-boundary invariant の観点で、既存機構との相互作用に起因する欠陥は確認されなかった。
