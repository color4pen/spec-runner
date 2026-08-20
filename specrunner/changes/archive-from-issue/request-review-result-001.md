# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合（全 11 箇所）

1. **`src/core/archive/merge-then-archive.ts:186-199`**
   `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` → slug 不一致で exit 2、`pullRequest?.number` 欠落で exit 2。行番号・コード内容ともに一致。

2. **`src/core/attach/checkpoint-policy.ts:45-111`**
   `attachResumePolicy` は `status !== "awaiting-resume"` を not-quiescent で拒否し、resumePoint 解決・pipeline 解決・reads() precheck を課す。行 45-111 完全一致。

3. **`src/core/attach/verify-checkpoint.ts:71-79`**
   `verifyCheckpoint` 第 2 引数 `policy: CheckpointVerificationPolicy = attachResumePolicy` で policy 注入可能。行 71-79 完全一致。

4. **`src/cli/attach.ts:161-163`**
   `stderrWrite(\`Run 'specrunner job resume ${verified.slug}' to resume the pipeline.\`)` — fixed string。行 161-163 完全一致。

5. **`src/cli/resume-from-issue.ts:110-207`**
   escalation marker → jobId → local short-circuit → `resolveResumeBranchFromIssue` → `runAttachVerification` + `setupWorkspace(attachCheckpoint)` → resume の流れを確認。行 110-207 完全一致。

6. **`src/core/issue-target/resume.ts:52-77`**
   `resolveEscalationJobId` は `parseEscalationJobId`（`kind="escalation"` 専用 regex）のみを走査。行 52-77 完全一致。

7. **`src/core/issue-target/resume.ts:119-206`**
   `listIssueLinkedBranches` 呼び出し + 3 点照合（jobId / issueNumber / branch）。行 119-206 確認。
   ※ request の "(GraphQL `linkedBranches`)" という説明は不正確（後述）。

8. **`src/core/notify/issue-notifier.ts:103-107`**
   `buildMarker(kind: "escalation" | "completed", jobId)` — completed 対応済み。行 103-107 完全一致。

9. **`src/core/notify/issue-notifier.ts:215-226`**
   `buildCompletionComment` は `buildMarker("completed", state.jobId)` + PR URL + archive コマンド hint を出力。行 215-226 完全一致。

10. **`src/core/runtime/local.ts:487-494`**
    `setupWorkspace` の `attachCheckpoint` 経路は job status 非依存の worktree 実体化。行 487-494 完全一致。

11. **`src/cli/command-registry.ts:1314-1324`**
    `archive` コマンドは `args: [{ name: "slug", required: true }]`。行 1314-1324 完全一致。

### 設計判断の整合性

- **completed marker 解決**: `parseEscalationJobId` は `kind="completed"` marker で null を返すことをテスト（resume.test.ts:165-168）で固定済み。新規 `parseCompletedJobId` が必要であることは正しい。
- **closing-PR branch locator**: `closedByPullRequestsReferences` で `{ headRefName, number }` を返す新メソッドが必要（既存 `listIssueLinkedBranches` は branch 名のみ返し PR number を含まないため 4 点照合不可）。設計決断は正しい。
- **policy 注入点**: `verifyCheckpoint` は policy 引数を受け取り済み。`runAttachVerification` には現状 policy 引数がないが、`verifyCheckpoint` を直接呼ぶか引数を追加するかは実装者が解決できる。
- **rebind 後は既存 archive に接続**: `setupWorkspace(attachCheckpoint)` が worktree + local state を実体化すれば `listWithSourceDirs` がそのまま発見する設計。ロジックの流れは正しい。
- **guide topics**: `jobs` と `merge` トピックは `src/core/command/guide.ts` に存在し、issue 起点取り込み経路の追記が受け入れ基準に明記されている。

## 検証できなかった項目

None — 全コードアサーションを実コードで照合済み。

## Findings 詳細

### F-1（低）: `listIssueLinkedBranches` の説明が不正確

request.md「現状コードの前提」に "branch locator は `listIssueLinkedBranches`（GraphQL `linkedBranches`）で候補を列挙し" とあるが、実際の `src/adapter/github/github-client.ts:737-795` は `linkedBranches` と `closedByPullRequestsReferences` の**両方**を GraphQL で取得し union を返す。PR 作成後に `linkedBranches` は空になるが、`closedByPullRequestsReferences` の headRefName を `listIssueLinkedBranches` はすでに返している。

**影響**: 設計決断（新メソッドが必要）の正しさは変わらない。新メソッドが必要な理由は「PR number を含まないため 4 点照合不可」であり、これは正しい。実装者が実コードを見ると記述と齟齬が生じるが、混乱は最小。修正は request.md の説明を "(GraphQL `linkedBranches` + `closedByPullRequestsReferences` の union)" に直すか、注釈を加えるだけ。
