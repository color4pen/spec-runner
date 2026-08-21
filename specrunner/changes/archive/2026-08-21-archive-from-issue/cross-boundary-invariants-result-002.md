# Cross-Boundary-Invariants Review — archive-from-issue

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Scope**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 前周差分の確認

前周（iteration 1）は全 finding が approved（finding なし）。iteration 2 での code-fixer による変更ファイル:

- `src/core/attach/__tests__/checkpoint-policy.test.ts` — TC-022 を `verifyCheckpoint` 直呼び → `runAttachVerification` 統合テストに変更
- `src/core/issue-target/archive.ts` — `resolveCompletedJobId` に ponytail ページネーションコメント追加（ロジック変更なし）
- `src/adapter/github/github-client.ts` — `listIssueClosingPullRequests` に 50 件上限 `logWarn` + ponytail コメント追加

これらの変更がインバリアントに与える影響を中心に検査する。

---

## インバリアント再確認

### I-1: `verify-checkpoint.ts` generic 層が無改変であること

`git diff main...HEAD -- src/core/attach/verify-checkpoint.ts` → 差分ゼロ確認済み。

policy 注入点の位置（journal integrity → counter reversal → profile → **[policy]** → request.md → identity）は不変。`policy` 引数 `undefined` のとき `attachResumePolicy` がデフォルトとして機能し続ける。**✓**

### I-2: `issue-target/resume.ts` が無改変であること

`git diff main...HEAD -- src/core/issue-target/resume.ts` → 差分ゼロ、git log でも commit なし確認済み。

`resolveEscalationJobId`（`kind="escalation"` 専用）・`resolveResumeBranchFromIssue`（linkedBranches + 3 点照合）は変更なし。**✓**

### I-3: `merge-then-archive.ts` archive orchestrator が無改変であること

`git diff main...HEAD -- src/core/archive/merge-then-archive.ts` → 差分ゼロ確認済み。

Step 1 の `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` → slug フィルタ → `state.pullRequest?.number` チェックは不変。**✓**

### I-4: `resume-from-issue.ts` が `attachResumePolicy`（default）を維持すること

`resume-from-issue.ts` の `runAttachVerification` 呼び出し（line 161–166）は `policy` 引数を渡さない。
`verifyCheckpoint` の default = `attachResumePolicy` → `state.status !== "awaiting-resume"` で拒否。

**iteration 2 で強化された保証**: TC-022 が `verifyCheckpoint` 直呼びから `runAttachVerification` 統合テストに変更された。これにより:

- `runAttachVerification` が policy 未指定 → `attachResumePolicy` が適用 → `awaiting-archive` checkpoint を `not-quiescent` で拒否する経路が end-to-end で固定された
- `resume-from-issue.ts` の呼び出しパターン（policy 渡しなし）と TC-022 の fixture は構造上同型

`awaiting-archive` checkpoint の resume 拒否は二重に保護されている:
1. **locator ガード**: 純粋な awaiting-archive job（escalation なし）は `resolveEscalationJobId` が escalation marker を見つけられず `resumeFromIssueNoMarkerError` で拒否 → policy 到達前に終わる
2. **policy ガード（TC-022 で固定）**: escalation を経た後に完走した job では branch が発見されうるが、`attachResumePolicy` が `awaiting-archive` を `not-quiescent` で拒否

**✓**

### I-5: `attachQuiescentPolicy` が `awaiting-resume` パスを保全すること

`attach.ts` は `attachQuiescentPolicy` を使用。`awaiting-resume` status では `attachResumePolicy.verify(ctx)` に委譲（全チェック適用）。`awaiting-archive` では `attachArchivePolicy.verify(ctx)` に委譲（PR number 存在チェック）。その他は `not-quiescent` で拒否。

composite policy 実装は iteration 1 と変更なし。TC-006（awaiting-resume attach 成功）は既存テストとして green。**✓**

### I-6: D7 — rebind 後に `listWithSourceDirs` が state を発見できること

`setupWorkspace(attachCheckpoint)` → `workspace-materializer.ts` `attach-from-checkpoint`:
- worktree を `.git/specrunner-worktrees/<slug>-<jobId-short>/` に作成
- checkpoint commit tree から `specrunner/changes/<slug>/state.json` を checkout
- `updateJobState` / seed は行わない（branch-borne truth を上書きしない）

`JobStateStore.listWithSourceDirs(repoRoot)` section 2 が `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` をスキャン → rebind 後の state を発見する。

変更なし・iteration 1 確認済み。**✓**

### I-7: `listIssueClosingPullRequests` の 50 件上限 `logWarn` がインバリアントに影響しないこと

code-fixer による追加:
```typescript
if (result.length === 50) {
  logWarn(`...returned 50 results — response may be truncated...`);
}
return result;
```

- `result.length === 50` は GraphQL `first: 50` の上限に達した場合のみ（`>= 50` にはならない）
- `logWarn` は best-effort ログ出力のみで、return 値・例外・呼び出し元の flow に影響しない
- 4 点照合ロジック（`resolveArchiveBranchFromIssue`）はこの結果をフィルタリングするため、警告が出ても誤 confirm は発生しない

**✓**

### I-8: TC-022 の SpawnFn fixture が `readCheckpointFromRef` を正しくシミュレートすること

TC-022 fixture の動作確認:

| git call | fixture 応答 |
|----------|-------------|
| `fetch origin <branch>` | `exitCode: 0` |
| `rev-parse origin/<branch>^{commit}` | `"deadbeefcafe\n"` |
| `cat-file` | `exitCode: 0`（存在確認）|
| `show *state.json` | `TC022_ARCHIVE_STATE_JSON`（`status: "awaiting-archive"`, `version: 2`）|
| `show *events.jsonl` | `""` |
| `ls-tree -r` | treeFiles（events.jsonl + request.md + state.json を含む）|
| `ls-tree` | change folder path |

`TC022_ARCHIVE_STATE_JSON` の `version: 2` により `verifyCheckpoint` は events.jsonl の treeFiles 内存在を要求する → fixture の ls-tree -r が `events.jsonl` を含む → チェック通過 → policy 到達 → `attachResumePolicy` が `awaiting-archive` を `not-quiescent` で拒否 → test expectation 成立。

fixture と実装のシーケンスが一致することを確認した。**✓**

---

## 観察事項（ブロッキングでない）

### OBS-1: acceptance criterion「resume-from-issue が awaiting-archive を拒否する」のテスト粒度

acceptance criterion は「`job resume --from-issue` が awaiting-archive checkpoint を引き続き拒否することをテストで固定する」と記述している。

現在のテスト: TC-022（`runAttachVerification` に policy 未指定 → `attachResumePolicy` → 拒否）は `resume-from-issue.ts` が呼び出す関数の直接テストであり、`runResumeFromIssue` CLI ハンドラレベルのテストではない。

ただし:
- 純粋 awaiting-archive job（escalation marker なし）は `resolveEscalationJobId` が先に拒否する（marker が存在しない → `resumeFromIssueNoMarkerError`）
- TC-022 は `resume-from-issue.ts` の rebind 経路（escalation 後に完走した job が closing PR branch で発見されるケース）で使われる `runAttachVerification` の default policy 動作を固定する

インバリアント自体は実装・テストともに正しく保護されている。CLI ハンドラレベルの end-to-end テストは現在存在しないが、ブロッキングではない。

### OBS-2: double-fetch TOCTOU（iteration 1 から不変）

`resolveArchiveBranchFromIssue` の fetch + `runAttachVerification` の再 fetch の間に branch が push される窓が存在する（iteration 1 OBS-1 と同一）。pre-existing design pattern であり、design.md Risk #2 に明記。`verifyCheckpoint` の identity check が異なる job への誤 bind を防ぐ。

---

## 証拠サマリ

| 確認項目 | 結果 |
|----------|------|
| `verify-checkpoint.ts` 無改変 | ✓ |
| `issue-target/resume.ts` 無改変 | ✓ |
| `merge-then-archive.ts` 無改変 | ✓ |
| `resume-from-issue.ts` が default policy を維持 | ✓ |
| TC-022 upgrade: `runAttachVerification` 統合で policy 経路を固定 | ✓ |
| `listIssueClosingPullRequests` の `logWarn` が flow に影響しない | ✓ |
| TC-022 SpawnFn fixture がシーケンスを正しくシミュレート | ✓ |
| D7: rebind 後 `listWithSourceDirs` が worktree state を発見 | ✓ |

**インバリアント違反: なし**
