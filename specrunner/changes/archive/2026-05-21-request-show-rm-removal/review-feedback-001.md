# Code Review Feedback — request-show-rm-removal — iter 1

## Summary

実装は全体的に正しい。ソースファイル削除・import 除去・USAGE 更新・テスト削除・テスト修正・delta spec、すべて要件通り。
ただし 4 つの既存テストファイルに、削除したモジュールへの stale な `vi.mock` が残っており、dead code として修正が必要。

---

## Findings

### F-01 — [minor] 4 つのテストファイルに stale `vi.mock` が残っている

**対象ファイル・行:**

| File | Lines |
|------|-------|
| `tests/unit/cli/specrunner-worktree-guard.test.ts` | L30–31 |
| `tests/unit/cli/specrunner-resume-dispatch.test.ts` | L35–36 |
| `tests/unit/cli/runtime-tc.test.ts` | L22–23 |
| `tests/unit/cli/removed-commands.test.ts` | L33–34 |

**内容:** 各ファイルに以下の 2 行が残っている。

```ts
vi.mock("../../../src/core/command/request-show.js", () => ({ executeShow: vi.fn() }));
vi.mock("../../../src/core/command/request-rm.js", () => ({ executeRm: vi.fn() }));
```

`command-registry.ts` がこれらモジュールを import しなくなったため、mock は一度も解決されず dead code になっている。vitest は存在しないモジュールへの `vi.mock` を失敗させないため（factory 指定時）テストは通過するが、コードベースに削除済みパスへの参照が 8 箇所残る。

**修正:** 上記 4 ファイルから該当 `vi.mock` 2 行ずつを削除する。

---

## Checklist against test-cases.md (must)

| TC | 説明 | 判定 |
|----|------|------|
| TC-01 | `request show` が unknown subcommand error | ✅ registry に show 定義なし (TC-09 で確認済) |
| TC-02 | `request rm` が unknown subcommand error | ✅ registry に rm 定義なし (TC-10 で確認済) |
| TC-03 | `--help` に show なし | ✅ USAGE 定数から削除済み |
| TC-04 | `--help` に rm なし | ✅ USAGE 定数から削除済み |
| TC-05 | `request-show.ts` が git 管理外 | ✅ `git ls-files` 空 |
| TC-06 | `request-rm.ts` が git 管理外 | ✅ `git ls-files` 空 |
| TC-07 | `executeShow` import なし | ✅ command-registry.ts から削除済み |
| TC-08 | `executeRm` import なし | ✅ command-registry.ts から削除済み |
| TC-09 | `show` subcommand 定義なし | ✅ |
| TC-10 | `rm` subcommand 定義なし | ✅ |
| TC-11 | `request-show.test.ts` が git 管理外 | ✅ |
| TC-12 | `request-rm.test.ts` が git 管理外 | ✅ |
| TC-13 | `help-output-tc.test.ts` が `not.toContain("request show")` | ✅ |
| TC-14 | `help-output-tc.test.ts` が `not.toContain("request rm")` | ✅ |
| TC-15 | `validation-tc.test.ts` から TC-46〜48 が削除 | ✅ request-rm.js / request-show.js への参照なし |
| TC-16 | `bun run typecheck` green | ✅ verification-result: passed |
| TC-17 | `bun run test` green | ✅ 225 files / 2453 tests passed |
| TC-18 | delta spec に `request show` REMOVED 宣言 | ✅ `## Removed` セクションに記載 |
| TC-19 | delta spec に `request rm` REMOVED 宣言 | ✅ `## Removed` セクションに記載 |
| TC-20 | slug validation Requirement が show/rm 除外で MODIFIED | ✅ body は `new/validate/review` のみ記載。heading は Rule 3 (baseline 完全一致) に従い変更不要 |

---

## Verdict

- **verdict**: needs-fix

F-01 の stale `vi.mock` 8 箇所を削除すれば approve。コードの正確性・ビルド・テストはすべて green。
