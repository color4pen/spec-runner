# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Verification Summary

All 3 HIGH findings confirmed fixed. 2 LOW findings (Fix=no in review-002) remain intentionally unaddressed.

## Finding Verification

### [HIGH] Finding 1: TC-INT-003/004/005 が materialize に symbolic ref をハードコードしており verified.checkpointOid を使っていない

**Status**: FIXED ✅

- TC-INT-003 (line 279): `checkpointRef: verified.checkpointOid`
- TC-INT-004 (line 331–335): `checkpointRef: verified.checkpointOid`
- TC-INT-005 (line 369–373): `checkpointRef: verified.checkpointOid`

全 3 テストが `verified.checkpointOid` を materialize に渡している。symbolic ref のハードコードは解消。

### [HIGH] Finding 2: TC-010「origin が動いても verified OID を materialize する」の integration test が存在しない

**Status**: FIXED ✅

`tests/attach/attach-integration.test.ts` の line 484–567 に TC-010 が追加されている。
origin が verify 後に前進した後に Machine B が fetch を実行し、materialize が `preAdvanceOid` を使うことを `expect(worktreeHeadTc010).toBe(preAdvanceOid)` および `expect(worktreeHeadTc010).not.toBe(advancedOid)` で実機 git assert している。

### [HIGH] Finding 3: TC-INT-006 が materialize を実行せず T-09「materialize した OID が一致する」が未固定

**Status**: FIXED ✅

TC-INT-006 (line 399–479) に materialize ステップが追加されている。
- `materializer.materialize(...)` を `verified.checkpointOid` で呼び出し (line 466–471)
- `git rev-parse HEAD` で worktree HEAD を取得 (line 473)
- `expect(worktreeHead).toBe(sourceOid)` で publish OID と materialize OID の一致を assert (line 474)

T-09 受け入れ基準「publish された checkpoint の commit OID とマシンB相当が materialize した commit OID が一致する」が実機で固定された。

### [LOW] Finding 4: TC-003（guard halt）が test-cases.md で must+automated 宣言されているが専用テストがない

**Status**: NOT FIXED (Fix=no) — acceptable

review-002 で Fix=no と判断（「blocking ではない」）。TC-PUB-001 の seam は `state.status === "awaiting-resume"` を条件とするため guard halt 含む全経路を構造的にカバーしており、専用ケース不在は非ブロッキング。回帰なし。

### [LOW] Finding 5: stateJson を 2 回独立して JSON.parse し fold(eventsJsonl) を再呼び出し

**Status**: NOT FIXED (Fix=no) — acceptable

review-001 から継続して Fix=no。`src/core/attach/verify-checkpoint.ts` の line 84 と 121 に 2 回の `JSON.parse(stateJson)` が残っているが、正しさへの影響なし。review-002 でも「対処不要」確認済み。回帰なし。

## Regressions

なし。HIGH 3 件はすべて現行コードで固定されている。
