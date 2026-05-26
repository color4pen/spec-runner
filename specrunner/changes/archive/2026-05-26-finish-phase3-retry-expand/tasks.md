# Tasks: finish-phase3-retry-expand

## T-01: `isMergeTransientFailure()` に transient パターン 3 件を追加

**ファイル**: `src/adapter/github/github-client.ts`

**変更内容**:

`isMergeTransientFailure()` 関数の return 式に 3 パターンを追加:

```ts
function isMergeTransientFailure(result: { merged: boolean; message: string }): boolean {
  if (result.merged) return false;
  const msg = result.message.toLowerCase();
  return (
    msg.includes("base branch was modified") ||
    msg.includes("unstable state") ||
    msg.includes("locked") ||
    msg.includes("not mergeable") ||
    msg.includes("head branch was modified") ||
    msg.includes("required status check")
  );
}
```

**JSDoc コメント更新**: 関数上部の JSDoc の Transient/Permanent リストを更新。`"not mergeable"` を Permanent から Transient に移動し、`"head branch was modified"` と `"required status check"` を Transient に追加。

- [x] 完了

## T-02: 既存テスト TC-PM-016 の期待値を変更

**ファイル**: `tests/unit/adapter/github/github-client-pr.test.ts`

**変更内容**:

TC-PM-016 (`405 'Pull request is not mergeable' → no retry → { merged: false }`) は、変更後は transient retry 対象になる。テストを以下に書き換え:

- テスト名: `TC-PM-016: 405 'Pull Request is not mergeable' → retry (transient)` に変更
- mockFetch: 1 回目 405 `"Pull Request is not mergeable"` → 2 回目 200 merged
- assertion: `result.merged === true`, `mockFetch` が 2 回呼ばれたことを確認

- [x] 完了

## T-03: 新規テスト追加 — 追加 transient パターンの retry 検証

**ファイル**: `tests/unit/adapter/github/github-client-pr.test.ts`

**追加テストケース**:

1. **TC-PM-017**: `405 'Head branch was modified' → retry → 2nd attempt 200 → { merged: true }`
   - mockFetch: 1 回目 405 `"Head branch was modified. Review and try the merge again."` → 2 回目 200
   - assertion: `merged: true`, `mockFetch` 2 回

2. **TC-PM-018**: `405 'Required status check is expected' → retry → 2nd attempt 200 → { merged: true }`
   - mockFetch: 1 回目 405 `"Required status check \"ci/build\" is expected"` → 2 回目 200
   - assertion: `merged: true`, `mockFetch` 2 回

3. **TC-PM-019**: `405 'Pull Request is not mergeable' × 4 → exhausted → { merged: false }`
   - mockFetch: 4 回とも 405 `"Pull Request is not mergeable"`
   - assertion: `merged: false`, `mockFetch` 4 回

- [x] 完了

## T-04: 既存 transient retry テストの regression 確認

**ファイル**: `tests/unit/adapter/github/github-client-pr.test.ts`

**確認対象**: 既存テスト TC-PM-010〜015 がそのまま pass することを確認。コード変更不要（T-01 の変更が既存パターンに影響しないことの検証）。

- [x] 完了 (2995 tests all green)

## T-05: typecheck + test green 確認

```bash
bun run typecheck && bun run test
```

- [x] 完了 (typecheck: pass / tests: 267 files, 2995 tests passed)

## 実行順序

T-01 → T-02 → T-03 → T-04 (implicit) → T-05
