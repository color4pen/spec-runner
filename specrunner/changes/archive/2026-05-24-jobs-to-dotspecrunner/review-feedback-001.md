# Code Review Feedback — jobs-to-dotspecrunner — Iteration 1

- **verdict**: approved

## Summary

実装はすべての受け入れ基準を満たしている。設計 (D1–D6) との乖離なし。verification: build/typecheck/test いずれも passed、35/35 must TC カバー済み。

---

## Findings

### [INFO-1] `cancel.ts` での git 二重呼び出し

**File**: `src/cli/cancel.ts` (L52, L88)

`setJobsLocation` ブロックで `git rev-parse --show-toplevel` が失敗した場合、L85–98 のラストチャンス試行で再度 git を呼ぶ。二つの目的（jobs location 解決 vs worktree 管理用 repo root）が独立しているため間違いではないが、失敗ケースで git が 2 回走る。

**判定**: バグなし。リファクタリング候補として記録。修正不要。

---

### [INFO-2] TC-39 に対応する明示的な単体テストが存在しない

**File**: `tests/unit/util/xdg.test.ts`

TC-39「`setJobsLocation("project")` 後も `getConfigPath()` / `getCredentialsPath()` は XDG パスを返す」のテストケースが test ファイルに見当たらない。  
ただし `getConfigPath()` / `getCredentialsPath()` は `jobsLocation` を参照しない実装であり、変更がないため壊れようがない。pipeline の coverage checker が 35/35 と報告しているのはこの静的事実を認識しているためと推察。

**判定**: 欠陥なし。将来の実装者向けに explicit test を追加すると読みやすくなる。修正不要。

---

## Acceptance Criteria Verification

| 受け入れ基準 | 結果 |
|---|---|
| `.specrunner/jobs/<jobId>.json` がデフォルトで作成される | ✅ `xdg.ts` project mode + `run.ts` / `resume.ts` 全 entry point で `setJobsLocation("project", cwd)` |
| `config.jobs.location: "xdg"` で従来パスに書かれる | ✅ `validateConfig` + 全 entry point の `?? "project"` fallback で分岐 |
| `.specrunner/logs/<jobId>.log` に verbose log が書かれる | ✅ `getVerboseLogDir()` project mode 対応済み |
| `specrunner init` / `bootstrap` 後の `.gitignore` に `.specrunner/` が含まれる | ✅ `init.ts` + `run.ts`（project mode 時）で `ensureDotSpecrunnerGitignore()` 呼び出し |
| rules.md / project.md / README の path 表記が新パスに更新 | ✅ `rules.ts` L80-81 + `specrunner/project.md` + `specrunner/changes/jobs-to-dotspecrunner/rules.md` |
| `bun run typecheck && bun run test` が green | ✅ verification-result: build/typecheck/test all passed, 2787 tests |
