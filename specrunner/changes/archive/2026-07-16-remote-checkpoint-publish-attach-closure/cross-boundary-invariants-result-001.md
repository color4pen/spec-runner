# Cross-Boundary Invariants Review — remote-checkpoint-publish-attach-closure — iter 1

## Reviewer

cross-boundary-invariants — 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

## Scope

```
src/cli/attach.ts                              +13 / -0
src/core/attach/orchestrator.ts               +30 / -0
src/core/attach/verify-checkpoint.ts         +122 / -0
src/core/pipeline/pipeline.ts                 +10 / -0
src/core/runtime/local.ts                     +13 / -1
src/core/runtime/workspace-materializer.ts    +13 / -0
src/core/step/commit-push.ts                  +23 / -0
src/core/worktree/manager.ts                  +16 / -0
```

---

## Findings

### F-01: `transitionJob` noop preserves `commitHalt`-established `resumePoint` — CONFIRMED CORRECT

**対象**: `src/core/pipeline/pipeline.ts:374–389` × `src/state/lifecycle.ts:86–88`

`commitHalt`（kind=awaiting-resume）がスローすると、pipeline のステップ実行 try/catch が `errWithState.state`（status=awaiting-resume）をキャプチャして `state` に代入する。その後 loop が継続し、escalation terminal でふたたび `transitionJob(state, "awaiting-resume")` が呼ばれる。

`lifecycle.ts` D3: 同一ステータス遷移は noop（`return { state, noop: true }`）。つまり `commitHalt` が確立した `resumePoint` は上書きされない。`state = escalateState` は同じオブジェクトへの再代入となり、`escalateStore.persist(state)` は冪等な二重永続化になる。D5 seam は `state.status === "awaiting-resume"` で正しく発火する。

この相互作用は意図通り正しい。

**Severity**: 情報（確認済み正常）

---

### F-02: awaiting-archive publish とループ末尾 seam の排他性 — CONFIRMED CORRECT

**対象**: `src/core/pipeline/pipeline.ts:361–371` および `504–506`

awaiting-archive 出口（`nextStep === "end" && state.status === "running"`）は transition 直後に `commitFinalState` を呼び（既存挙動）、その後 `break`。ループ末尾 D5 seam は `if (state.status === "awaiting-resume")` — false（status は awaiting-archive）のため **二重 publish は発生しない**。

TC-PUB-001「loop-end seam does NOT call commitFinalState when status is not awaiting-resume」がこれを固定している。

**Severity**: 情報（確認済み正常）

---

### F-03: guard halt 経路の D5 seam が単体テストで明示的にカバーされていない — LOW

**対象**: `tests/core/pipeline/pipeline.test.ts`

新規 pipeline テスト（TC-PUB-001/002）は escalation（status=failed → awaiting-resume）と exhaustion（iter 上限）の経路で `commitFinalState` 呼び出しを検証している。しかし guard halt 経路（`commitHalt` が status=awaiting-resume の状態を attach して throw → try/catch が受け取る）は E2E 統合テストでカバーはされているが、pipeline 単体テストの明示的な TC は無い。

**ブロッカー度**: 非ブロッキング。guard halt の terminal routing は escalation と同一コードパス（escalation terminal → `transitionJob` noop → `break` → D5）を通るため、ロジックとして F-01 で確認済み。欠落は単体テスト観点のカバレッジギャップにとどまる。

**Severity**: low（非ブロッキング）

---

### F-04: counter reversal 検査の catch が non-SpecRunner エラーを飲み込む — CONFIRMED SAFE

**対象**: `src/core/attach/verify-checkpoint.ts:120–147`

```ts
} catch (err: unknown) {
  if (err instanceof Error && "code" in err) throw err;
}
```

try ブロック内で例外を出す可能性のある処理は `JSON.parse`（stateJson）と `fold(eventsJsonl)` + `detectCounterReversal`。

- `JSON.parse(stateJson)`: `composeSplitLayoutFromContent` がすでに成功しているため、同一 `stateJson` の二度目の parse は必ず成功する。
- `fold()`: 内部で全例外を捕捉し `FoldResult` を返す（非スロー）。
- `detectCounterReversal()`: 純粋関数、スローしない。

よって catch が誤ってエラーを飲み込む経路は実質存在しない。`checkpointNotAttachableError`（SpecRunnerError、`code` 付き）は正しく再スローされる。

**Severity**: 情報（確認済み正常）

---

### F-05: 既存 branch 存在時の lock contention retry が OID を破壊しない — CONFIRMED SAFE

**対象**: `src/core/worktree/manager.ts:110–145` × `src/core/runtime/workspace-materializer.ts:131–140`

懸念：lock contention retry（`isLockContention=true`）が branch 既存を検出して `wtArgs = ["worktree", "add", worktreePath, branchName]`（OID なし）に切り替え、checkpointOid ではなく local branch HEAD を checkout する可能性。

実際：`git worktree add -b <branch> <path> <OID>` は branch 既存時に "fatal: a branch named … already exists" エラーで失敗する。このエラーは `stderr.includes("could not lock config file")` に一致しない（`isLockContention=false`）。よって retry ロジックへ入らず、`branchWasPreExisting=true` → branch 削除なし → throw で即終了する。Lock contention retry と pre-existing branch は相互排他。

**Severity**: 情報（確認済み正常）

---

### F-06: `reads()` invariant（deps.slug のみ参照）が標準 step 全域で保持 — CONFIRMED

**対象**: `src/core/attach/verify-checkpoint.ts:191` の `minDeps = { slug } as unknown as StepDeps`

検査した step の `reads()`:

| step | reads() が参照する deps フィールド |
|------|-------------------------------------|
| implementer | `deps.slug` のみ ✓ |
| build-fixer | `deps.slug` のみ ✓ |
| conformance | `deps.slug` のみ ✓ |
| adr-gen | `state` + `deps.slug` のみ ✓ |
| test-case-gen | `deps.slug` のみ ✓ |
| code-fixer | `state` + `deps.slug` のみ ✓ |
| custom-reviewer | `deps.slug` のみ ✓ |

全 step が design.md D3 の監査済み不変を満たしており、最小 `StepDeps({ slug })` での呼び出しが安全。

**Severity**: 情報（確認済み正常）

---

### F-07: `runtimeStrategy` が undefined の場合の D5 seam — CONFIRMED SAFE

**対象**: `src/core/pipeline/pipeline.ts:505`

```ts
await deps.runtimeStrategy?.commitFinalState(deps, state);
```

optional chaining で `runtimeStrategy === undefined`（managed runtime など）を正しく処理。publish 試行なし → local resumable のまま。

**Severity**: 情報（確認済み正常）

---

### F-08: `commitFinalState` no-throw 契約が D5 seam 経由でも維持される — CONFIRMED

**対象**: `src/core/step/commit-push.ts:105–146`

- `git add -A` 失敗 → return（silent）
- `git diff --cached` 結果が clean → return（no commit）
- `git commit` 失敗 → stderrWrite + return
- `git push` 1回目失敗 → retry
- 2回目失敗 → stderrWrite + return（throw しない）

いずれの失敗パスも throw しないため、`runInternal` は正常に終了し、pipeline の final state は `awaiting-resume` のまま local resume 可能。ADR-20260715 D1「push 前は locally resumable」が守られる。

**Severity**: 情報（確認済み正常）

---

## Verdict

- **verdict**: approved

## Summary

8 点の境界を精査し、クリティカルな不変条件破壊は検出されなかった。

主な確認内容:

1. **D5 seam の安全性**: `commitHalt` 経路の二重 `transitionJob` は `lifecycle.ts` D3 の noop により冪等。`awaiting-archive` との二重 publish は status ガードで排除。
2. **OID 不変性**: fetch → rev-parse → `readCheckpointFromRef(OID)` → `verifyCheckpoint(checkpointOid)` → `setupWorkspace(checkpointRef=OID)` の全段を確認。symbolic ref の再評価は発生しない。
3. **branch 非破壊**: pre-existing branch の `git worktree add -b` 失敗は lock contention ではなく即時エラーのため、retry の OID 上書きパスへ入らない。
4. **述語閉鎖**: `fold()` 非スロー・`detectCounterReversal` 純粋関数・catch の再スロー条件がいずれも正しく機能する。
5. **reads() 最小 deps**: 全標準 step が `state` + `deps.slug` のみを参照する不変を実装上で確認。

非ブロッキング指摘が 1 件（F-03: guard halt 経路の単体テストカバレッジギャップ）。ロジックは正しいが、将来的に明示的な TC 追加を推奨。
