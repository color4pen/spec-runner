# Cross-Boundary Invariants Review — issue-target-start-face
## Iteration 2

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更が触れていないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないかを検出する。

---

## 前周 finding の再確認

### F-001（TC-011 ordering test が vacuously true）→ RESOLVED

`tests/unit/core/runtime/workspace-materializer-link.test.ts` の TC-011 を再読した。

```typescript
await materializer.materialize("my-slug", "job-id-123", plan, {
  onFeatureBranchCreated,
  requestFilePath: tmpRequestFile,  // ← 追加された
});

expect(order).toContain("callback");
expect(order).toContain("git-commit");
expect(order.indexOf("callback")).toBeLessThan(order.indexOf("git-commit"));
```

- `tmpWorktree` / `tmpRequestFile` を実際の一時ディレクトリで作成
- `requestFilePath` を渡すことで `git add` / `git commit` がモック spawnFn に到達する
- `copyRulesToChangeFolder` も `git add` を発火させるため order = `["callback", "git-add", "git-add", "git-commit"]`
- `indexOf("callback") = 0 < indexOf("git-commit") = 3` → assertion が vacuously true ではなくなった ✓

解消確認済み。

---

### F-002（no-worktree 経路: rev-parse 失敗時に警告なし）→ RESOLVED

`src/core/runtime/local.ts` を再読した。

```typescript
// local.ts line 372
} else {
  stderrWrite(`Warning: could not resolve HEAD OID for linked branch registration (no-worktree): ${revResult.stderr.trim() || "git rev-parse HEAD failed"}`);
}
```

`git rev-parse HEAD` が非 0 exit を返した場合に `stderrWrite` で警告を出力する実装が追加された。

`tests/unit/no-worktree-mode.test.ts` TC-012 の `"rev-parse HEAD failure: callback is skipped and a warning is written to stderr"` テスト（line 834）が以下を pin している:
- `onFeatureBranchCreated` が呼ばれない
- `stderrCalls.some((m) => m.includes("could not resolve HEAD OID"))` が true

解消確認済み。

---

## 新規 Finding

### F-003 — no-worktree 経路: callback-before-materialisation 順序が pin されていない

**Severity**: low  
**File**: `tests/unit/no-worktree-mode.test.ts`  
**Resolution**: fixable

**内容**:

spec.md の no-worktree シナリオは「`onFeatureBranchCreated` is invoked best-effort **after the checkout and before request materialisation**」を要求する。

実装は `local.ts` のコード位置によって順序を保証している:

```typescript
// local.ts line 383–387（callback）
if (headOidForCallback && opts?.onFeatureBranchCreated) {
  await opts.onFeatureBranchCreated(headOidForCallback, branchName).catch((err) => { ... });
}

// ...後続の workspace 初期化...

// local.ts line 409 以降（request materialisation: git commit を含む）
if (isRunPath && opts?.requestFilePath) {
  // git add / git commit / rev-parse HEAD / etc.
}
```

TC-012 はコールバックが checkout の後に呼ばれることと、失敗時に警告が出ることを検証しているが、**コールバックが request materialisation（git commit）よりも前**に呼ばれることを assert していない。

`requestFilePath` なしでは `git commit` が到達しないため（worktree path の旧 TC-011 と同じ問題構造）、TC-012 の assertion は「callback-before-commit」順序について vacuously true になっている。

誰かがコールバック発火を `if (isRunPath && opts?.requestFilePath)` ブロックの後に移動しても TC-012 は green のまま通り続ける。

**クロス境界の問題**:

`createLinkedBranch` は bootstrap commit より前に呼ばれることが spec の意図（D5 の順序）。no-worktree path では `headOidForCallback` を commit 前に取得するため OID 自体は影響を受けないが、「before materialisation」という不変条件の構造的 pin がない。worktree path には TC-011 が同様の pin を提供しているが、no-worktree path には対応テストがない。

**Resolution**:

`no-worktree-mode.test.ts` に TC-012 の ordering variant を追加する: `requestFilePath` を渡したシナリオで `git-commit` が発火し、callback が git-commit より前に呼ばれることを assert する。worktree path の TC-011 と対称的な構成になる。

---

## 正常確認

| 検証項目 | 結果 |
|---|---|
| issue-target → cli/ 非依存（TC-001 grep pin） | ✓ |
| base OID 1 回解決（TC-008 pin） | ✓ |
| worktree 失敗で callback skip（TC-009） | ✓ |
| callback 失敗で start 継続（TC-010 / TC-NW-012） | ✓ |
| TC-011 ordering（callback < git-commit、worktree path） | ✓ Fixed |
| no-worktree rev-parse 失敗警告（TC-012 at line 834） | ✓ Fixed |
| 3 経路すべてで issue-target 経由（各テスト） | ✓ |
| inbox TC-018 無改変 green（nodeId フィールド追加のみ） | ✓ |
| buildFeatureBranchName 単一化（TC-013 grep pin） | ✓ |
| arch-allowlist.ts 無変更 | ✓ |
| positional + `--issue` → startWithIssueLink（TC-005） | ✓ |
| no-worktree callback-before-materialisation ordering | **gap**（no-worktree path のみ） |

---

## checked: 16, skipped: 0, unverified: 0
