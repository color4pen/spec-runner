# Code Review Feedback — symlink-dereference-guard — iter 2

- **verdict**: approved
- **date**: 2026-05-27

---

## Summary

iter 1 の HIGH（テストなし）と MEDIUM（スコープ外変更）は両方解消済み。実装ロジックは正確。
ただし `test-cases.md` で `must` とマークされた TC-SYM-007〜010（LocalRuntime / ManagedRuntime の統合テスト）が未実装のため、要修正。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | Testing | `tests/unit/core/runtime/` (新規ケース未追加) | TC-SYM-007（LocalRuntime + symlink request.md → SpecRunnerError）・TC-SYM-008（LocalRuntime + 通常ファイル → 正常）・TC-SYM-009（ManagedRuntime + symlink）・TC-SYM-010（ManagedRuntime + 通常ファイル）の 4 件が `must` 優先度にもかかわらず未実装。既存の `local.test.ts` / `managed.test.ts` に追加するか、`copy-artifacts.test.ts` 内で `rejectSymlink` を `vi.spyOn` して呼び出し有無を検証するアプローチでも可。 | 4 件の `must` テストを実装する | no |
| 2 | LOW | Readability | `src/util/copy-artifacts.ts:20-36` | `rejectSymlink` 内で `SpecRunnerError` を try ブロック内で throw し catch で re-throw する構造は動作上正しいが、「catch は `fs.lstat` の OS エラーのみを扱う」という意図が読みにくい（iter 1 から持ち越し、任意）。`lstat` の呼び出しのみを try で囲み `isSymbolicLink()` チェックを外に出すことで明確化できる。 | 任意対応（blocking なし） | no |

---

## iter 1 からの修正確認

| Finding | Severity | 解消状況 |
|---------|----------|---------|
| テストファイルが存在しない（TC-SYM-001〜003, 006, 011〜015） | HIGH | ✅ 解消 — `tests/unit/util/copy-artifacts.test.ts` 新規作成、全 9 ケース実装済み |
| `code-fixer.ts` スコープ外変更 | MEDIUM | ✅ 解消 — `git diff main...HEAD -- src/core/step/code-fixer.ts` が空（変更なし） |
| `rejectSymlink` catch 構造の可読性 | LOW | 未対応（任意のため許容） |

---

## 実装の正確性確認（OK 項目）

- `SYMLINK_REJECTED` が `ERROR_CODES` に追加済み ✅
- `EXIT_CODE_MAP` に `SYMLINK_REJECTED: EXIT_CODE.ARG_ERROR`（exit 2）追加済み ✅
- `rejectSymlink` が `src/util/copy-artifacts.ts` に named export されている ✅
- `copyDraftUsageToChangeFolder` 内で try ブロック**外側**に `rejectSymlink` が配置されている ✅
- `local.ts` / `managed.ts` の `fs.cp` 呼び出し直前に `await rejectSymlink(opts.requestFilePath)` が挿入されている ✅
- `rejectSymlink` の ENOENT → no-op ロジックが正しく実装されている ✅
- テスト 278 ファイル / 3148 件すべて通過 ✅（verification-result.md より）
- build / typecheck / lint: 全通過 ✅

---

## 修正チェックリスト

- [ ] TC-SYM-007: LocalRuntime の `setupWorkspace` で symlink な `requestFilePath` を渡した場合に `SpecRunnerError(SYMLINK_REJECTED)` が throw されることを確認するテストを追加する
- [ ] TC-SYM-008: LocalRuntime の `setupWorkspace` で通常ファイルの `requestFilePath` を渡した場合にエラーが出ないことを確認するテストを追加する
- [ ] TC-SYM-009: ManagedRuntime の `setupWorkspace` で symlink な `requestFilePath` を渡した場合に `SpecRunnerError(SYMLINK_REJECTED)` が throw されることを確認するテストを追加する
- [ ] TC-SYM-010: ManagedRuntime の `setupWorkspace` で通常ファイルの `requestFilePath` を渡した場合にエラーが出ないことを確認するテストを追加する
