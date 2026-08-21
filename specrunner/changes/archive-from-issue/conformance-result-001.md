# Conformance Result — archive-from-issue — iter 1

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

### Requirement: awaiting-archive checkpoint verification policy (spec R1)

**検証対象**: `src/core/attach/checkpoint-policy.ts`、`src/core/attach/verify-checkpoint.ts`、`src/core/attach/__tests__/checkpoint-policy.test.ts`

- `attachArchivePolicy.verify()` は `state.status !== "awaiting-archive"` → `checkpointNotAttachableError("not-quiescent")` を throw、`state.pullRequest?.number` 欠落 → `checkpointNotAttachableError("missing-pr-number")` を throw することを確認
- resumePoint / pipeline descriptor / reads() precheck は一切課していないことを確認
- `src/core/attach/verify-checkpoint.ts` は main から diff なし（generic integrity 層不変）
- `attachResumePolicy` は main から diff なし
- Tests: TC-001（accept）、TC-002（awaiting-resume reject）、TC-003（running reject）、TC-004（PR number 欠落 reject）、TC-020（resume policy が awaiting-archive を reject）すべて存在

### Requirement: job attach accepts both quiescent statuses and emits a status-specific hint (spec R2)

**検証対象**: `src/core/attach/checkpoint-policy.ts`、`src/cli/attach.ts`、`src/cli/__tests__/attach.test.ts`

- `attachQuiescentPolicy` が awaiting-resume → `attachResumePolicy.verify(ctx)`、awaiting-archive → `attachArchivePolicy.verify(ctx)`、それ以外 → `checkpointNotAttachableError("not-quiescent")` に委譲することを確認
- `attach.ts` が `policy: attachQuiescentPolicy` を `runAttachVerification` に渡し、成功後に `verified.state.status` で hint を分岐することを確認:
  - awaiting-archive → `Run 'specrunner job archive ${verified.slug} --with-merge'`
  - else → `Run 'specrunner job resume ${verified.slug}'`
- Tests: TC-005（archive hint）、TC-006（resume hint）、TC-007（non-quiescent reject）すべて存在

### Requirement: completed-marker jobId resolution (spec R3)

**検証対象**: `src/core/notify/issue-notifier.ts`、`src/core/issue-target/archive.ts`、`src/core/issue-target/__tests__/archive.test.ts`

- `COMPLETED_MARKER_RE` は `kind="completed"` のみにマッチし、escalation marker は null を返すことを確認
- `resolveCompletedJobId` が全コメントを走査して `parseCompletedJobId` で候補収集し、`createdAt` 降順でソートして最新を採用、0 件時に `archiveFromIssueNoMarkerError(issueNumber)` を throw することを確認
- Tests: TC-021（round-trip + escalation → null）、TC-008（最新 marker 採用）、TC-009（escalation-only → NO_MARKER）、TC-010（marker なし → NO_MARKER）すべて存在

### Requirement: closing-PR branch locator with four-field identity match (spec R4)

**検証対象**: `src/kernel/github-client.ts`、`src/adapter/github/github-client.ts`、`src/core/issue-target/archive.ts`、`src/core/issue-target/__tests__/archive.test.ts`、`src/adapter/github/__tests__/github-client-closing-prs.test.ts`

- `GitHubClient` port に `listIssueClosingPullRequests(owner, repo, issueNumber): Promise<Array<{ number; headRefName }>>` を追加確認
- adapter が GraphQL `closedByPullRequestsReferences(first: 50) { nodes { number headRefName } }` を実装し、null issue / GraphQL errors / 非2xx → `githubApiError` を確認。50 件制限に logWarn あり
- `resolveArchiveBranchFromIssue` が:
  - 0 PRs → `archiveFromIssueNoPrError`
  - 各候補: fetch → rev-parse → readStateJsonFromRef → JSON.parse → 4 点照合（jobId / issueNumber / branch / pullRequest.number）
  - 不一致・unreadable → logWarn + skip
  - confirmed 1 件 → return; 0 件・複数 → `archiveFromIssueUnconfirmedError`
- Tests: TC-011（一意確定）、TC-012（0 PR → NO_PR）、TC-013（複数 confirmed → UNCONFIRMED）、TC-014（PR number 不一致 → skip → UNCONFIRMED）すべて存在
- Adapter tests: happy path / empty nodes / non-2xx / GraphQL errors / null issue すべて存在

### Requirement: job archive --from-issue CLI contract (spec R5)

**検証対象**: `src/cli/command-registry.ts`

- `"from-issue": { type: "integer", min: 1 }` flag 追加を確認
- `args: [{ name: "slug", required: false }]` に変更されていることを確認
- XOR ガード: 両方指定 → `logError("mutually exclusive") + process.exit(EXIT_CODE.ARG_ERROR)`, 両方欠落 → exit 2
- `--from-issue` 経路は `runArchiveFromIssue(fromIssue, { withMerge, mergeWaitMs, … })` へ routing
- `ARCHIVE_USAGE` に `--from-issue` と "mutually exclusive" 両方含まれることを確認
- Tests: TC-015（両指定 → exit 2）、TC-016（両欠落 → exit 2）、TC-017（withMerge 引き継ぎ）、TC-026（ARCHIVE_USAGE 内容）すべて存在

### Requirement: local short-circuit for issue-initiated archive (spec R6)

**検証対象**: `src/cli/archive-from-issue.ts`

- `resolveCompletedJobId` 後に `loadStateByJobId(repoRoot, jobId)` を試みて local state が見つかれば `resolveArchiveBranchFromIssue` / `runAttachVerification` を呼ばず直接 `runArchive({ slug, … })` へ進む経路を確認
- `JOB_NOT_FOUND` コード以外のエラーは re-throw することも確認
- Tests: TC-018（locator 不呼び出し、rebind 不呼び出し、local slug で runArchive）存在

### Requirement: issue-initiated archive rebind connects to the existing archive orchestrator unchanged (spec R7)

**検証対象**: `src/cli/archive-from-issue.ts`、`src/core/archive/merge-then-archive.ts`

- rebind 経路: `runAttachVerification({ …, policy: attachArchivePolicy })` → `LocalRuntime.setupWorkspace(…, { attachCheckpoint: { branch, checkpointRef: checkpointOid }, baseBranch })` → `runArchive({ slug: verified.slug, withMerge, mergeWaitMs })`
- `src/core/archive/merge-then-archive.ts` は main から diff なし（archive orchestrator 不変）
- Tests: TC-019（フル rebind 後に verified slug / withMerge で runArchive 呼び出し）存在

### Requirement: issue-initiated resume remains awaiting-resume only (spec R8)

**検証対象**: `src/cli/resume-from-issue.ts`、`src/core/issue-target/resume.ts`

- `resume-from-issue.ts` の `runAttachVerification` 呼び出しに `policy` 引数なし（= attachResumePolicy default）を確認
- `src/core/issue-target/resume.ts` は main から diff なし（escalation marker + linkedBranches locator 不変）
- `attachResumePolicy` は status !== "awaiting-resume" をすべて reject するため awaiting-archive も拒否される
- Tests: TC-020（attachResumePolicy が awaiting-archive を not-quiescent で reject）、TC-022（policy 未指定の runAttachVerification が awaiting-archive を CHECKPOINT_NOT_ATTACHABLE で reject）存在

### 受け入れ基準: specrunner guide 更新

**検証対象**: `src/core/command/guide.ts`

- jobs topic に `specrunner job archive --from-issue <n> --with-merge` と 4 ステップ解決規則を追記確認
- merge topic に issue 起点取り込みフローと `job attach --branch <branch>` 手動経路を追記確認
- Tests: TC-027（jobs topic に "archive --from-issue" 含む）、TC-028（merge topic に from-issue 参照・"job attach --branch" 含む）存在

### 受け入れ基準: typecheck && test green

verification-result.md 記載: build passed / typecheck passed / test passed（805 test files、12022 tests passed、1 skipped、2 todo）

---

## 検証できなかった項目

None

---

## Findings 詳細

None
