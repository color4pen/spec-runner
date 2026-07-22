# Cross-Boundary Invariants Review — bootstrap-commit-egress-ledger — iter 3

## 対象不変条件

このレビューが守護する不変条件：

**I-1**: `publish range ⊆ synthesizedCommits ∪ current-op OID`
— `runInlineEgressCheck` が検証する core invariant。push が新規公開する commit は台帳に記録済みでなければならない。

**I-2**: `commitFinalState` の egress ledger 構築 = `synthesizedCommits ∪ finalize-commit OID`
— checkpoint/finalize パスが `verifyEgressLedger` に渡す ledger に台帳外 commit を含まないこと。

**I-3**: bootstrap 由来の commit は pipeline 製 commit の全集合に属する
— 台帳の意味論（pipeline 製 commit の全集合）に照らして bootstrap commit は必ず記録される。

**I-4**: `beforeExit` 遷移後の再開 resume で egress が失敗しないこと
— awaiting-resume → resume の経路で synthesizedCommits が完全であること。

---

## 調査した境界

| 境界 | 場所 | 着目点 |
|------|------|--------|
| git commit → updateJobState | 3 経路全て | OID が状態に永続化される前にプロセスがクラッシュしうるか |
| managed.ts: appendSynthesizedCommit vs push 順序 | `managed.ts:254-268` | record-before-push が守られているか |
| local.ts: isRunPath ガード外でも不変が保たれるか | `local.ts:346-442` | resume path が bootstrap commit を再作成しないか |
| commitFinalState の synthesizedCommits 参照 | `commit-push.ts:694-698` | fix 後の台帳で checkpoint 前に egress が正しく通るか |
| runInlineEgressCheck の current-op OID 加算 | `commit-push.ts:359-362` | step1 commit のみで bootstrap commit が hidden になる経路がないか |
| resume 経路での bootstrapState 再シード | `workspace-materializer.ts:113-115`, `resume.ts:269` | 再開時に synthesizedCommits が上書き消去されないか |
| `appendSynthesizedCommit` 冪等性 | `operations.ts:35-38` | 重複記録で台帳が壊れないか |

---

## 境界ごとの検証結果

### 1. `git commit` → `updateJobState(appendSynthesizedCommit)` の原子性ギャップ

**観測**: 3 経路（workspace-materializer.ts, local.ts, managed.ts）すべてで、bootstrap commit 作成後に `updateJobState(appendSynthesizedCommit)` を sequential await で呼ぶ。この 2 ステップは非原子である。

**クラッシュウィンドウ（低確率）**:
1. `git commit` が成功 → bootstrap commit は git history に存在（未 push）
2. `updateJobState` が throw する（例: 直前のディスク満杯・別プロセスによるロック競合）
3. `setupWorkspace` が throw → pipeline run エラー終了
4. `beforeExit` が発火: 状態は "running" → "awaiting-resume" に遷移（synthesizedCommits に OID なし）
5. resume 時: 状態に bootstrapOid なし、git history に bootstrap commit あり
6. step-1 commit + push: `rev-list HEAD --not --remotes=origin` に bootstrap commit が含まれる → EGRESS_UNKNOWN_COMMIT

**緩和要因**:
- `updateJobState` は `atomicWriteJson` を使用（`job-journal.ts:122,136,202`）。SIGKILL 中断でも状態ファイルは旧版または新版の一方に確定し、部分書込みは発生しない。
- 実運用で `updateJobState` がローカル書込みとして throw する確率は極めて低い（ディスク满杯・ファイル破損等の独立障害）。
- 修正前は「全ての新規 job で 100% 再現」していた同じ症状が、この修正により「特定クラッシュ後の resume でのみ再現可能」に限定される。

**評価**: `git commit` と `updateJobState` の間の原子性保証はないが、これは修正が導入した退行ではなく、修正前から存在する設計クラスの残余リスク。影響は大幅に縮小された（再現条件が 2 重の独立障害を要求する）。

**重要度**: LOW（再現には「updateJobState throw かつ beforeExit 発火かつ resume 実行」の複合条件が必要）。

---

### 2. managed.ts: `appendSynthesizedCommit` は push より前

`managed.ts` の `if (opts?.requestFilePath)` ブロック（lines 202–270）:
```
244: updateJobState(appendSynthesizedCommit)  ← 先に記録
259: git push origin <branchName>             ← 後に push
```

record-before-push の順序が守られている。push が失敗して setupWorkspace が throw した場合でも、synthesizedCommits には bootstrap OID が記録済みであり、resume 後の egress check は通過する。✓

---

### 3. isRunPath / resume 経路の bootstrap commit 再作成なし

`local.ts` の resume arm (`isRunPath = false`):
```typescript
if (isRunPath && opts?.requestFilePath) {
  // ... git commit ... appendSynthesizedCommit  // run path のみ
}
if (!isRunPath) {
  await recopyDraftToChangeFolder(...)  // resume path: git commit なし
}
```

resume 時に bootstrap commit を再作成しないため、git history に bootstrap commit が重複追加される経路はない。✓

`workspace-materializer.ts` の resume arms (resume-existing, resume-recreated, resume-without-recorded-worktree) も同様に bootstrap commit ブロックを実行しない。✓

---

### 4. resume 時の bootstrapState 再シードで synthesizedCommits が消去されないか

`resume.ts:269`: `bootstrapState: updatedState`（最新の永続化状態）が渡される。

`workspace-materializer.ts` 再開アーム (lines 113-115):
```typescript
if (opts?.bootstrapState) {
  await new JobStateStore(jobId, ..., slugOpts).persist(opts.bootstrapState);
}
```

`updatedState` は `synthesizedCommits` を含む最新状態。正常系では bootstrap OID が含まれており、再シードにより上書き消去は起きない。

ただし上記 §1 のクラッシュウィンドウシナリオでは、`updatedState` 自体に bootstrap OID が含まれていないため、再シードしても不完全状態が持続する。この点は §1 で整理済み。✓（設計の既知トレードオフ）

---

### 5. commitFinalState の egress ledger 構築

`commit-push.ts:694-698`:
```typescript
const oidResult = await spawnFn("git", ["rev-parse", "HEAD"], { cwd });
const newOid = ... oidResult.stdout.trim() : "";
const ledger = [...(synthesizedCommits ?? []), ...(newOid ? [newOid] : [])];
await verifyEgressLedger({ cwd, ledger, spawnFn });
```

`synthesizedCommits` に bootstrap OID が記録されていれば（修正後の正常系）、finalize/checkpoint commit の OID と合わせた ledger でも publish range が I-2 に従う。✓

---

### 6. runInlineEgressCheck の current-op OID 加算と bootstrap commit の可視性

`commit-push.ts:359-362`:
```typescript
const newCommitOid = (await gitExec(spawnFn, cwd, ["rev-parse", "HEAD"])) ?? "";
const ledger = new Set<string>([...synthesizedCommits, newCommitOid].filter(Boolean));
```

step-1 の commit 後に HEAD は step-1 OID を指す。bootstrap commit は publish range に含まれるが current-op OID（step-1 OID）とは異なる。よって bootstrap OID は `synthesizedCommits` から供給されなければならない。修正後の正常系ではこれが達成される。

`current-op OID` が bootstrap OID を隠蔽する経路は存在しない。✓

---

### 7. appendSynthesizedCommit の冪等性

`operations.ts:35-38`:
```typescript
const existing = state.synthesizedCommits ?? [];
if (existing.includes(oid)) return state;
return { ...state, synthesizedCommits: [...existing, oid] };
```

同一 OID の重複記録は no-op。台帳が壊れる経路なし。✓

---

## Findings 詳細

### F-001 (LOW): `git commit` と `updateJobState` 間の原子性ギャップ（クラッシュウィンドウ）

- **ファイル**: `src/core/runtime/workspace-materializer.ts:226-242`, `src/core/runtime/local.ts:414-428`, `src/core/runtime/managed.ts:244-257`
- **問題**: bootstrap commit 作成直後に `updateJobState(appendSynthesizedCommit)` が throw した場合、OID が台帳に残らないまま job が awaiting-resume に遷移する。resume 後の最初の push で EGRESS_UNKNOWN_COMMIT が発生する。
- **影響範囲**: `updateJobState` が独立に失敗する低確率クラッシュシナリオに限定。修正前（100% 再現）と比較して条件が 2 重独立障害を要求する形に限定された。
- **修正方針**: ①resume 経路で git log を走査して bootstrap commit の候補 OID を synthesizedCommits に補完する、②あるいは updateJobState fail-closed として bootstrap を abort し beforeExit が awaiting-resume に遷移しないよう job を terminated にする。

---

## 総評

本修正は台帳の意味論（pipeline 製 commit の全集合）に対する記録漏れを 3 経路すべてで修正し、100% 再現していた初回 push の EGRESS_UNKNOWN_COMMIT を正常系では完全に解消する。cross-boundary invariant の観点では、修正が直接変更した 3 ファイルが下流の `runInlineEgressCheck` / `commitFinalState` / resume 経路と正しく相互作用することを確認した。

唯一の残余リスクは §1/F-001 の原子性ギャップ（クラッシュ後 resume シナリオ）であり、これは修正が導入した退行ではなく修正前から存在するクラスのリスクが縮小された形で残存するものである。設計 D2 の fail-closed 保証は rev-parse 失敗に対して明示されているが、updateJobState 失敗については明示がない既知のギャップ。
