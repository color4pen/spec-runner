# Cross-Boundary-Invariants Review — archive-from-issue

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか

---

## 検証対象インバリアント

本 request が設計判断で明示した不変条件と、新機能から影響を受け得る既存機構の接続点を中心に検査した。

### I-1: `verify-checkpoint.ts` generic 層は無改変か

`git diff main...HEAD -- src/core/attach/verify-checkpoint.ts` → 差分なし（ゼロ diff）。

`verifyCheckpoint` の検証順（journal integrity → counter reversal → profile → **[policy]** → request.md → identity）は不変。
policy 注入点が空欄（`undefined`）のとき `attachResumePolicy` がデフォルトとして機能し続ける。**✓**

### I-2: `issue-target/resume.ts` は無改変か（locator + 3 点照合）

`git diff main...HEAD -- src/core/issue-target/resume.ts` → 差分なし。

`resolveEscalationJobId`（`kind="escalation"` 専用 regex）と `resolveResumeBranchFromIssue`（`linkedBranches` + 3 点照合）は変更なし。**✓**

### I-3: `merge-then-archive.ts` archive orchestrator は無改変か

`git diff main...HEAD -- src/core/archive/merge-then-archive.ts` → 差分なし。

Step 1 の `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` → slug フィルタ → `state.pullRequest?.number` チェックは変更なし。**✓**

### I-4: `resume-from-issue.ts` が `attachResumePolicy`（default）を維持しているか

`resume-from-issue.ts` の `runAttachVerification` 呼び出しは `policy` 引数を渡さない（`undefined`）。
`verifyCheckpoint(input, undefined)` → default `= attachResumePolicy` → `state.status !== "awaiting-resume"` で拒否。

`awaiting-archive` checkpoint の resume 経路への混入を防ぐ二重ガードが存在する:
1. **locator ガード**: `resolveResumeBranchFromIssue` は `linkedBranches` を使用（PR 作成後は空）。ただしアダプタの `listIssueLinkedBranches` は `closedByPullRequestsReferences.headRefName` もユニオンに含む（PR 後も branch name を返す可能性がある）。
2. **policy ガード（決定的）**: `attachResumePolicy` が `awaiting-archive` を `not-quiescent` で拒否（TC-020 でテスト固定）。

policy ガードが無条件に機能するため、locator が closing PR branch を返してしまうケース（escalation 後に完走した job）でも resume は拒否される。**✓**

### I-5: `attach.ts` が `attachQuiescentPolicy` に切り替えた後、`awaiting-resume` パスが不変か

差分: `policy: attachQuiescentPolicy` を追加 + hint 文言の status 分岐を追加。

`attachQuiescentPolicy.verify(ctx)`:
- `status === "awaiting-resume"` → `attachResumePolicy.verify(ctx)` に委譲（同一挙動）
- `status === "awaiting-archive"` → `attachArchivePolicy.verify(ctx)`（新規受理）
- それ以外 → `checkpointNotAttachableError("not-quiescent", ...)`（従来どおり）

`awaiting-resume` パスの検証ロジックは `attachResumePolicy` に委譲されるため、resume policy の全チェック（resumePoint / pipeline descriptor / reads() precheck）が変わらず適用される。**✓**

### I-6: D7 — rebind 後に `listWithSourceDirs` が state を発見できるか

`setupWorkspace(attachCheckpoint)` → `workspace-materializer.ts` `attach-from-checkpoint` ケース:
- `manager.create(cwd, slug, jobId, checkpointRef, branchName, ...)` が `.git/specrunner-worktrees/<slug>-<jobId-short>/` に worktree を作成
- checkpoint commit の tree には `specrunner/changes/<slug>/state.json` が存在
- liveness sidecar を書き込む（`pid=null`）
- **seed / updateJobState は行わない**（"checkpoint tree already contains state.json" — branch-borne truth を上書きしない設計）

`JobStateStore.listWithSourceDirs(repoRoot, ...)` のスキャン範囲:
1. `specrunner/changes/*/state.json`（main checkout）
2. `specrunner/changes/archive/*/state.json`（archived）
3. `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` ← **worktree の state を発見** ✓
4. `.git/specrunner-worktrees/*/specrunner/changes/archive/*/state.json`

rebind 後、`runArchive({ slug, cwd: repoRoot, ... })` → `merge-then-archive.ts` Step 1 → `listWithSourceDirs` がスキャン 3 で state を発見する。state は `attachArchivePolicy` が通過を保証した `status=awaiting-archive` かつ `pullRequest.number` あり。**✓**

### I-7: `GitHubClient` インターフェース拡張の波及確認

`kernel/github-client.ts` に `listIssueClosingPullRequests` を追加。`core/port/github-client.ts` は kernel の re-export（単一行）なので自動的に反映。

影響を受ける全ての mock factory を確認:
- `tests/helpers/pipeline-mock-client.ts` → `listIssueClosingPullRequests: vi.fn().mockResolvedValue([])` 追加済み ✓
- `src/core/archive/__tests__/merge-then-archive.test.ts` → 追加済み ✓
- `tests/unit/core/archive/merge-then-archive.test.ts` → 追加済み ✓
- `tests/unit/core/notify/issue-notifier.test.ts` → 追加済み ✓
- `tests/unit/inbox/orchestrator.test.ts` → 追加済み（複数箇所）✓
- その他の `makeGitHubClient(overrides: Partial<GitHubClient>)` 形式のファクトリも差分で確認

`Partial<GitHubClient>` を使うファクトリは optional field として扱うためコンパイルエラーは発生しないが、差分で追加された `1 +` 行はすべて `listIssueClosingPullRequests` の stub 追加であることを確認した。**✓**

### I-8: `parseCompletedJobId` の regex が `buildMarker` の逆関数を形成するか

`COMPLETED_MARKER_RE` = `/<!-- specrunner:notification kind="completed" jobId="([^"]+)" version="1" -->/`  
`buildMarker("completed", jobId)` = `` `<!-- specrunner:notification kind="completed" jobId="${jobId}" version="1" -->` ``

Round-trip は成立する。`[^"]+` キャプチャは UUID（hex + hyphen のみ）に対して正しく機能する（`"` を含むことがない）。`kind="escalation"` marker は regex が `kind="completed"` に固定されているため自然に無視される。**✓**

---

## 観察事項（ブロッキングでない）

### OBS-1: resolver と runAttachVerification の double fetch（pre-existing pattern）

`resolveArchiveBranchFromIssue` が branch を fetch + rev-parse → 4 点照合 → `checkpointOid` A を返す。  
次に `runAttachVerification({ branch: resolved.branch })` が同じ branch を再 fetch → `checkpointOid` B を使用。

`resolved.checkpointOid`（A）は捨てられ、setupWorkspace は B で worktree を作成する。B ≠ A の TOCTOU 窓が存在する。`attachArchivePolicy` は `pullRequest.number` の**存在**を確認するが、4 点照合で確定した特定の PR 番号（`pr.number`）を再検証しない。

影響範囲の限定要因:
- `awaiting-archive` 状態で branch が force-push される実運用ケースはほぼゼロ
- `verifyCheckpoint` の identity checks（repo / jobId / branch / slug）が別の job への誤 bind を防ぐ
- `resume-from-issue.ts` も同一パターン（pre-existing design）

本パターンは design.md Risk #2 で意図的な重複と明記されており、新しい invariant violation ではない。

### OBS-2: `listIssueLinkedBranches` が `closedByPullRequestsReferences.headRefName` を含む（pre-existing）

adapter の `listIssueLinkedBranches` は `linkedBranches` と `closedByPullRequestsReferences.headRefName` のユニオンを返す（本 PR での変更なし）。escalation を経た後に完走した job に対して `resume-from-issue` を試みると、locator が branch を発見しうる。  
ただし `attachResumePolicy`（TC-020 でテスト固定）が `awaiting-archive` を `not-quiescent` で拒否するため、実害なし。

---

## 証拠サマリ

| 確認項目 | 結果 |
|----------|------|
| `verify-checkpoint.ts` 無改変 | ✓ |
| `issue-target/resume.ts` 無改変 | ✓ |
| `merge-then-archive.ts` 無改変 | ✓ |
| `resume-from-issue.ts` が default policy（attachResumePolicy）を維持 | ✓ |
| `attachResumePolicy` が `awaiting-archive` を拒否（TC-020）| ✓ |
| `attachQuiescentPolicy` が `awaiting-resume` パスを保全 | ✓ |
| D7: rebind 後に `listWithSourceDirs` が worktree state を発見 | ✓ |
| `GitHubClient` mock factory 全更新 | ✓ |
| `parseCompletedJobId` round-trip | ✓ |

インバリアント違反: **なし**。
