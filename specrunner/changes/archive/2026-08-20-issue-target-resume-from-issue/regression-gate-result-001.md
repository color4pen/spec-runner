# Regression Gate Result — Iteration 1

**Branch**: feat/issue-target-resume-from-issue-5ca3d603  
**Date**: 2026-08-20

## Evidence Summary

- **Checked**: 7 findings
- **Skipped**: 0
- **Unverified**: 0

---

## Finding-by-Finding Verdict

### [MEDIUM] Finding 1 — listIssueLinkedBranches で issue: null の場合のテスト pin 欠如

**Status: FIXED**

- `tasks.md` T-01 Acceptance Criteria に「存在しない issue（HTTP 200 + `repository.issue: null`）で `GITHUB_API_ERROR` が throw されることがテストで pin される（空リンク `[]` と区別される）」が追加された（L27–28）。
- `tests/unit/adapter/github/github-client-dev-links.test.ts` L163–176 に `null` issue シナリオのテストが存在する。`repository.issue: null` を受け取ったとき `GITHUB_API_ERROR` を throw することが pin されている。
- `src/adapter/github/github-client.ts` の実装も同条件で `githubApiError` を throw することを確認済み。

---

### [LOW] Finding 2 — fail-closed 3 種エラーの exit code が TC で未固定

**Status: FIXED**

- `tasks.md` T-03 Acceptance Criteria に「3 コードの exit code が `ARG_ERROR`(2) で `EXIT_CODE_MAP` に登録されていることがテストで pin される」が追加された（L63–64）。
- `src/cli/__tests__/resume-from-issue.test.ts` TC-020（L193–197）に `resumeFromIssueNoMarkerError(1).exitCode === 2` / `resumeFromIssueNoLinkError(1).exitCode === 2` / `resumeFromIssueUnconfirmedError("x").exitCode === 2` のアサーションが存在する。
- `src/errors.ts` EXIT_CODE_MAP（L32–34）で 3 コードすべてが `EXIT_CODE.ARG_ERROR` に登録されていることを確認した。

---

### [LOW] Finding 3 — state.branch 不一致の専用 pin が存在しない

**Status: FIXED**

- `src/core/issue-target/__tests__/resume.test.ts` に TC-026「branch mismatch is rejected fail-closed」（L376–396）が追加された。
- `state.branch === "feat/other-branch"` だが `candidateBranch === "feat/my-feature"` のシナリオで `RESUME_FROM_ISSUE_UNCONFIRMED` が throw されることを pin している。
- `src/core/issue-target/resume.ts` L178–182 の identity check で `identity.branch !== branch` が第 3 フィールドとして評価されていることを確認した。

---

### [LOW] Finding 4 — TC-013 アサーションが runAttachVerification の呼ばれないことを検査しない

**Status: FIXED**

- `src/cli/__tests__/resume-from-issue.test.ts` TC-013（L356–360）に `expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled()` と `expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled()` の両アサーションが存在する。
- 修正前は `runResumeCore` のみ検査していたが、現在は `runAttachVerification` も検査している。

---

### [MEDIUM] Finding 5 — slug がリバインド後に verified.slug へ更新されず runResumeCore に古い resolved.slug が渡される

**Status: FIXED**

- `src/cli/resume-from-issue.ts` L203–204 に `slug = verified.slug;` が追加された。コメント「Use the slug from the verified checkpoint — not the resolver's preliminary slug — so that runResumeCore always receives the identity-confirmed value.」が付いている。
- `src/cli/__tests__/resume-from-issue.test.ts` TC-027（L440–470）で `resolveResumeBranchFromIssue` が `slug: "stale-slug"` を返し `runAttachVerification` が `slug: "verified-slug"` を返す状況で、`runResumeCore` が `"verified-slug"` で呼ばれることを pin している。

---

### [LOW] Finding 6 — Comment scan always fetches all pages — O(⌈C/100⌉) API calls

**Status: STILL PRESENT**

- `src/core/issue-target/resume.ts` L54–59 に追加されたコメントは「per-issue comments endpoint は `direction` クエリパラメータを無視するため direction=desc が使えない — repository-level endpoint のみサポート。完全ページネーションが必須」と説明している。
- 実装は変わらず `listIssueComments` の結果全件を受け取って走査している（early exit なし）。
- 提案された修正（direction=desc + 最初の marker ページで停止）は per-issue endpoint の仕様制約により適用不能という技術的根拠が示された。O(1) の実用的なコスト上限についての説明も追加された。
- ただしコードの挙動は原 finding が記述したまま（全ページ取得）であり、finding 自体は消えていない。

---

### [LOW] Finding 7 — Full checkpoint read (events.jsonl + ls-tree) performed for non-confirming branch candidates

**Status: FIXED**

- `src/core/issue-target/resume.ts` L154–165 で `readCheckpointFromRef` の代わりに `readStateJsonFromRef` を使用するようになった。コメント「Read state.json only (lightweight — no events.jsonl, no recursive ls-tree)」が付いている。
- `src/git/checkpoint-ref.ts` に `readStateJsonFromRef`（L140–157）が追加された。state.json のみを読む軽量版であり、events.jsonl の読み出しと再帰的 ls-tree は行わない（slug 解決には非再帰 ls-tree + cat-file は必要だが、再帰 ls-tree は省略）。

---

## Regression Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | MEDIUM | issue: null テスト pin 欠如 | FIXED |
| 2 | LOW | exit code が TC で未固定 | FIXED |
| 3 | LOW | state.branch 不一致 pin 欠如 | FIXED |
| 4 | LOW | TC-013 が runAttachVerification を検査しない | FIXED |
| 5 | MEDIUM | verified.slug 未反映 | FIXED |
| 6 | LOW | Comment scan 全ページ取得 | STILL PRESENT (fix technically infeasible as proposed) |
| 7 | LOW | Full checkpoint read | FIXED |
