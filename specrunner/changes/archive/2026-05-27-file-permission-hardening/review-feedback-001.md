# Code Review Feedback — file-permission-hardening — iter 1

- **verdict**: needs-fix

## Summary

実装は正確かつ設計通り。3 要件すべて充足している。一方、テストは一切追加されておらず、test-cases.md で `must` と指定された 7 ケースがすべて未カバーのまま。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| F-01 | HIGH | test-coverage | `tests/unit/util/atomic-write.test.ts`（未存在）, `tests/unit/logger/verbose-log.test.ts` | ブランチでテスト変更がゼロ（`git diff main...HEAD -- tests/` が空出力）。test-cases.md で priority: must と指定された TC-01〜03（mode デフォルト / 明示優先）、TC-06（wx フラグ確認）、TC-07（EEXIST + unlink）、TC-10（initVerboseLog 0o600）、TC-12（job-state-store 0o600）の 7 件に実装がない。TC-04 / TC-05 は既存テスト（`tests/core/credentials/github.test.ts:83`, `tests/state-store.test.ts:191`）が間接カバー済み。 | `tests/unit/util/atomic-write.test.ts` を新規作成し TC-01〜03, TC-06, TC-07 を実装。`tests/unit/logger/verbose-log.test.ts` に TC-10 として `initVerboseLog` 後の `stat.mode & 0o777 === 0o600` 検証を追加。TC-12 は integration 相当のため実装者判断で optional。 | yes |
| F-02 | LOW | informational | `src/util/atomic-write.ts` | `writeFile(..., { flag: "wx", mode })` は umask が適用されるため、極端な umask（例: 0o177）では tmp file が 0o600 未満になる可能性がある。ただし直後の `chmod(filePath, mode)` が最終ファイルの mode を強制上書きするため機能上の問題はない。設計通り正しい実装。 | 対応不要。 | no |

---

## Positive Notes

- `options?.mode ?? 0o600` による分岐統合は明瞭で、将来の消費者が自動的に保護される
- `{ flag: "wx", mode }` の単一 writeFile 呼び出しにより if/else 条件分岐が解消された
- catch ブロックの unlink による tmp ファイルクリーンアップは O_EXCL 追加後も正しく機能する
- `openSync(currentLogPath, "a", 0o600)` の変更は 1 行で意図が明確
- verification が 3132 tests all passed / typecheck / lint すべて green
