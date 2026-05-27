# Code Review Feedback — symlink-dereference-guard — iter 1

- **verdict**: needs-fix
- **date**: 2026-05-27

---

## Summary

実装ロジック（`rejectSymlink` 関数・エラーコード追加・呼び出し挿入）は設計通りで正確。ただし、テストが一切追加されていない（HIGH）と、スコープ外の変更が混入している（MEDIUM）の2点で要修正。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | Testing | `tests/` (新規ファイル未作成) | `test-cases.md` の must 優先度テストケース11件（TC-SYM-001〜003, 006, 011〜015）に対応するテストファイルが存在しない。`git diff main...HEAD --stat` で tests/ への変更がゼロ。 | `tests/unit/util/copy-artifacts.test.ts` を新規作成し、少なくとも TC-SYM-001〜003（rejectSymlink 単体）・TC-SYM-006（エラーコード）・TC-SYM-011〜015（copyDraftUsageToChangeFolder）を実装すること | no |
| 2 | MEDIUM | Scope | `src/core/step/code-fixer.ts` | `requiresCommit: false` → `true` の変更が混入しているが、symlink-dereference-guard の request.md・design.md・tasks.md いずれにも記載なく、スコープ外 | 別 request に分離するか、このブランチから revert すること | no |
| 3 | LOW | Readability | `src/util/copy-artifacts.ts` | `rejectSymlink` の try 内で `SpecRunnerError` を throw し catch で re-throw するフローは動作上正しいが、「catch は lstat の OS エラーのみを扱う」という意図が読みにくい | lstat 呼び出しのみを try で囲み、`isSymbolicLink()` チェックを try の外に出すことで意図を明確化する（任意） | no |

---

## 実装の正確性確認（OK 項目）

- `SYMLINK_REJECTED` が `ERROR_CODES` に追加済み ✅
- `EXIT_CODE_MAP` に `SYMLINK_REJECTED: EXIT_CODE.ARG_ERROR` 追加済み ✅
- `rejectSymlink` が `src/util/copy-artifacts.ts` に export されている ✅
- `copyDraftUsageToChangeFolder` の try ブロック**外側**に配置されている ✅
- `local.ts` / `managed.ts` の `fs.cp` 呼び出し直前に挿入されている ✅
- import が両ファイルで正しく追加されている ✅
- ENOENT → no-op ロジックが実装されている ✅
- build / typecheck / lint: 全通過 ✅

---

## 修正チェックリスト

- [ ] `tests/unit/util/copy-artifacts.test.ts` を作成し must テストケース（TC-SYM-001〜003, 006, 011〜015）を実装する
- [ ] `code-fixer.ts` の `requiresCommit` 変更を revert するか別 request に分離する
- [ ] （任意）`rejectSymlink` の catch 構造を lstat エラーのみ catch するよう整理する
