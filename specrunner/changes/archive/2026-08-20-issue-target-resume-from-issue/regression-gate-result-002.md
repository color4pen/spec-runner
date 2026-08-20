# Regression Gate Result — Iteration 2

**Branch**: feat/issue-target-resume-from-issue-5ca3d603  
**Date**: 2026-08-20

## Evidence Summary

- **Checked**: 7 findings
- **Skipped**: 0
- **Unverified**: 0

---

## Finding-by-Finding Verdict

### [MEDIUM] Finding 1 — listIssueLinkedBranches で issue: null の場合のテスト pin 欠如

**Status: FIXED (no regression)**

- `tasks.md` T-01 Acceptance Criteria に「存在しない issue（HTTP 200 + `repository.issue: null`）で `GITHUB_API_ERROR` が throw されることがテストで pin される」が記載されている（L26–28）。
- `tests/unit/adapter/github/github-client-dev-links.test.ts` L163–176 に `null` issue シナリオのテストが存在する。
- `src/adapter/github/github-client.ts` L775–778 で `issue === null || issue === undefined` を `githubApiError` で throw している。
- 前回 iteration からの状態変化なし。

---

### [LOW] Finding 2 — fail-closed 3 種エラーの exit code が TC で未固定

**Status: FIXED (no regression)**

- `src/cli/__tests__/resume-from-issue.test.ts` TC-020（L193–197）で `resumeFromIssueNoMarkerError(1).exitCode === 2` / `resumeFromIssueNoLinkError(1).exitCode === 2` / `resumeFromIssueUnconfirmedError("x").exitCode === 2` の3件すべてをアサーションしている。
- `src/errors.ts` EXIT_CODE_MAP（L32–34）で 3 コードすべてが `EXIT_CODE.ARG_ERROR` に登録済み。
- 前回 iteration からの状態変化なし。

---

### [LOW] Finding 3 — state.branch 不一致の専用 pin が存在しない

**Status: FIXED (no regression)**

- `src/core/issue-target/__tests__/resume.test.ts` TC-026（L376–396）「branch mismatch is rejected fail-closed」が存在する。
- `state.branch === "feat/other-branch"` だが `candidateBranch === "feat/my-feature"` のシナリオで `RESUME_FROM_ISSUE_UNCONFIRMED` が throw されることを pin している。
- `src/core/issue-target/resume.ts` L178–182 の identity check に `identity.branch !== branch` が第 3 フィールドとして存在する。
- 前回 iteration からの状態変化なし。

---

### [LOW] Finding 4 — TC-013 アサーションが runAttachVerification の呼ばれないことを検査しない

**Status: FIXED (no regression)**

- `src/cli/__tests__/resume-from-issue.test.ts` TC-013（L356–360）に `expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled()` と `expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled()` の両アサーションが存在する。
- 前回 iteration からの状態変化なし。

---

### [MEDIUM] Finding 5 — slug がリバインド後に verified.slug へ更新されず runResumeCore に古い resolved.slug が渡される

**Status: FIXED (no regression)**

- `src/cli/resume-from-issue.ts` L203–204 に `slug = verified.slug;` が存在する（`setupWorkspace` 完了直後）。
- `src/cli/__tests__/resume-from-issue.test.ts` TC-027（L463–469）で `resolveResumeBranchFromIssue` が `slug: "stale-slug"`、`runAttachVerification` が `slug: "verified-slug"` を返すシナリオで `runResumeCore` が `"verified-slug"` で呼ばれることを pin している。
- 前回 iteration からの状態変化なし。

---

### [LOW] Finding 6 — Comment scan always fetches all pages — O(⌈C/100⌉) API calls

**Status: STILL PRESENT (same as iteration 1 — fix technically infeasible as proposed)**

- `src/core/issue-target/resume.ts` L54–59 の実装は全ページ取得のまま変わっていない。
- 追加された `ponytail:` コメントは「per-issue comments endpoint（`GET /repos/{owner}/{repo}/issues/{number}/comments`）は `direction=desc` クエリパラメータを無視する。早期終了は不可能。upgrade path: issue_number フィルタ付き repository-level endpoint に切り替える」と技術的根拠を記録している。
- 提案された fix（direction=desc で新着取得 + 最初の marker ページで停止）は per-issue endpoint の仕様制約により適用不能。algorithm の変更はなし。
- iteration 1 から状態変化なし（新たな退行ではなく継続中の未対応）。

---

### [LOW] Finding 7 — Full checkpoint read (events.jsonl + ls-tree) performed for non-confirming branch candidates

**Status: FIXED (no regression)**

- `src/core/issue-target/resume.ts` L154–165 で `readStateJsonFromRef` を使用している（コメント「Read state.json only (lightweight — no events.jsonl, no recursive ls-tree)」）。
- `src/git/checkpoint-ref.ts` L127–157 に `readStateJsonFromRef` が存在し、state.json のみを読む軽量実装になっている。
- 前回 iteration からの状態変化なし。

---

## Regression Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | MEDIUM | issue: null テスト pin 欠如 | FIXED |
| 2 | LOW | exit code が TC で未固定 | FIXED |
| 3 | LOW | state.branch 不一致 pin 欠如 | FIXED |
| 4 | LOW | TC-013 が runAttachVerification を検査しない | FIXED |
| 5 | MEDIUM | verified.slug 未反映 | FIXED |
| 6 | LOW | Comment scan 全ページ取得 | STILL PRESENT (技術的制約により fix 不可) |
| 7 | LOW | Full checkpoint read | FIXED |
