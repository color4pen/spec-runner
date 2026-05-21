# Code Review Feedback — request-show-rm-removal — iter 2

## Summary

iter 1 の F-01（stale `vi.mock` 8 箇所）が修正済み。
新規 finding なし。全 must TC が pass しており、ビルド・テストも green。

---

## F-01 再確認: stale `vi.mock` の除去

iter 1 で指摘した以下 4 ファイルの `vi.mock` 2 行ずつ（合計 8 箇所）が削除されていることを確認。

| File | 削除行数 |
|------|--------|
| `tests/unit/cli/removed-commands.test.ts` | −2 |
| `tests/unit/cli/runtime-tc.test.ts` | −2 |
| `tests/unit/cli/specrunner-resume-dispatch.test.ts` | −2 |
| `tests/unit/cli/specrunner-worktree-guard.test.ts` | −2 |

`tests/` および `src/` に `request-show` / `request-rm` / `executeShow` / `executeRm` への参照がゼロであることも grep で確認済み。

---

## Checklist against test-cases.md (must)

| TC | 説明 | 判定 |
|----|------|------|
| TC-01 | `request show` が unknown subcommand error | ✅ `request` registry に `show` 定義なし |
| TC-02 | `request rm` が unknown subcommand error | ✅ `request` registry に `rm` 定義なし |
| TC-03 | `--help` に show なし | ✅ USAGE から削除済み |
| TC-04 | `--help` に rm なし | ✅ USAGE から削除済み |
| TC-05 | `request-show.ts` が git 管理外 | ✅ `git ls-files` 空 |
| TC-06 | `request-rm.ts` が git 管理外 | ✅ `git ls-files` 空 |
| TC-07 | `executeShow` import なし | ✅ command-registry.ts に参照なし |
| TC-08 | `executeRm` import なし | ✅ command-registry.ts に参照なし |
| TC-09 | `show` subcommand 定義なし | ✅ |
| TC-10 | `rm` subcommand 定義なし | ✅ |
| TC-11 | `request-show.test.ts` が git 管理外 | ✅ |
| TC-12 | `request-rm.test.ts` が git 管理外 | ✅ |
| TC-13 | `help-output-tc.test.ts` が `not.toContain("request show")` | ✅ L29 確認済み |
| TC-14 | `help-output-tc.test.ts` が `not.toContain("request rm")` | ✅ L30 確認済み |
| TC-15 | `validation-tc.test.ts` から TC-46〜48 が削除 | ✅ request-rm.js / request-show.js への参照なし |
| TC-16 | `bun run typecheck` green | ✅ verification-result: passed |
| TC-17 | `bun run test` green | ✅ 225 files / 2453 tests passed |
| TC-18 | delta spec に `request show` REMOVED 宣言 | ✅ `## Removed` セクションに記載 |
| TC-19 | delta spec に `request rm` REMOVED 宣言 | ✅ `## Removed` セクションに記載 |
| TC-20 | slug validation Requirement が show/rm 除外で MODIFIED | ✅ body は `new/validate/review` のみ。heading は Rule 3（baseline 完全一致）に従い変更不要 |

---

## Verdict

- **verdict**: approved
