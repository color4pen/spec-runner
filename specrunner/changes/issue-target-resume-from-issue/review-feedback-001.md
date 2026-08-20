# Review Feedback 001 — issue-target-resume-from-issue / Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**Diff scope**: 25 files changed, 3,894 insertions.

**Source files read**:
- `src/core/issue-target/resume.ts` — core resolver の全実装
- `src/cli/resume-from-issue.ts` — CLI orchestrator の全実装
- `src/adapter/github/github-client.ts` (L680–L796) — `listIssueLinkedBranches` 実装
- `src/core/notify/issue-notifier.ts` — `parseEscalationJobId` 追加分
- `src/errors.ts` — 3 エラーコード + factory 追加分
- `src/cli/command-registry.ts` (L348–L400, L1070–L1151) — `--from-issue` フラグ配線
- `src/core/command/guide.ts` — escalation トピック更新分
- `src/git/checkpoint-ref.ts` — `readCheckpointFromRef` の実装確認（OID 渡しの有効性検証）
- `src/state/schema/types.ts` (L405–L458) — `JobState.branch`/`issueNumber` 型確認

**Test files read**:
- `src/core/issue-target/__tests__/resume.test.ts` — 全文
- `src/cli/__tests__/resume-from-issue.test.ts` — 全文
- `tests/unit/adapter/github/github-client-dev-links.test.ts` — 全文

**Architecture checks**:
- `tests/unit/architecture/arch-allowlist.ts` — diff = 0 行（新エントリなし確認）
- `src/core/issue-target/resume.ts` imports — `cli/` `adapter/` import なし確認
- `resume-from-issue.ts` 内 `process.cwd()` 出現 — 0 件確認（コメント含め）
- `command-registry.ts` 新 `process.cwd()` — 既存 `CWD-registry-generate-resume-attach-archive-debt` エントリで被覆確認

**Acceptance criteria 照合**:

| 基準 | 充足 | 根拠 |
|---|---|---|
| marker → jobId → Dev links → identity 3-照合 → rebind → resume (両形) | ✅ | TC-001/TC-002 (core + CLI) + TC-017 (adapter) |
| `state.issueNumber` 不一致 fail-closed | ✅ | TC-005 |
| `state.jobId` 不一致 fail-closed | ✅ | TC-006 |
| Dev links 0件 → `job attach --branch` 案内 | ✅ | TC-009 (hint 文言 pin あり) |
| marker 不在 → 副作用ゼロ停止 | ✅ | TC-008 |
| 複数 marker → 最新選択 | ✅ | TC-004 |
| issue 本文 read なし | ✅ | TC-003 (core) + TC-022 (CLI) |
| local state → rebind skip | ✅ | TC-010 |
| positional + `--from-issue` → usage error | ✅ | TC-012 |
| 既存テスト無改変 | ✅ | `GitHubClient` port shape 不変、既存ファイル改変なし |
| arch green / allowlist 追加なし | ✅ | verification-result + arch-allowlist diff = 0 |
| typecheck / test green | ✅ | verification-result: 全 phase passed (11901 tests) |

## 検証できなかった項目

None。gate TCs（typecheck / test / arch）は verification-result で実測済み。

## Findings 詳細

### F-01: `state.branch` 不一致の専用 pin が存在しない

**Location**: `src/core/issue-target/__tests__/resume.test.ts`

3 フィールド identity check の実装（`resume.ts:172–178`）は `state.jobId`・`state.issueNumber`・`state.branch` を AND 評価している。acceptance criteria は `issueNumber` 不一致 (TC-005) と `jobId` 不一致 (TC-006) を個別に pin しているが、第 3 フィールド `state.branch !== candidateBranch` のリグレッション pin がない。

spec.md Requirement "confirm the target only by matching all three checkpoint identity fields" では "Any mismatch MUST cause the candidate to be rejected" と明記されており、branch フィールドも対称的に保護される必要がある。

後続修正で `resume.ts` の `&&` 条件から `identity.branch !== branch` の行が外れても TC-005/TC-006 は検出できない。

**修正案** — `resume.test.ts` の TC-006 describe の後に追加:

```typescript
describe("TC-branch-mismatch: state.branch 不一致は fail-closed で拒否される", () => {
  it("checkpoint の branch が候補 branch 名と違えば RESUME_FROM_ISSUE_UNCONFIRMED", async () => {
    const jobId = "job-abc";
    const issueNumber = 5;
    const candidateBranch = "feat/my-feature";
    // state.json の branch が候補 branch 名と異なる（他の 2 フィールドは一致）
    const stateJson = makeStateJson(jobId, issueNumber, "feat/different-branch");

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([candidateBranch]),
    });
    const spawnFn = makeSpawnFn({ [candidateBranch]: { stateJson } });

    await expect(
      resolveResumeBranchFromIssue({
        client, owner: "o", repo: "r",
        issueNumber, jobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SpecRunnerError &&
        err.code === ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED,
    );
  });
});
```

---

### F-02: TC-013 のアサーションが `runAttachVerification` の呼ばれないことを検査しない

**Location**: `src/cli/__tests__/resume-from-issue.test.ts`, L354–356

テスト名は "runAttachVerification and runResumeCore are NOT called when parent detaches" だが、
実際の assert は `runResumeCore` のみ:

```typescript
it("TC-013: runAttachVerification and runResumeCore are NOT called when parent detaches", async () => {
  await runResumeFromIssue(42, { detach: true }, makeCtx());
  expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled();  // ← runAttachVerification の検査なし
});
```

detach 判定（`resume-from-issue.ts:147–154`）が `runAttachVerification` の後に移動するリグレッションが入っても TC-013 は通過し続ける。

**修正案**:
```typescript
it("TC-013: runAttachVerification and runResumeCore are NOT called when parent detaches", async () => {
  await runResumeFromIssue(42, { detach: true }, makeCtx());
  expect(vi.mocked(runAttachVerification)).not.toHaveBeenCalled();
  expect(vi.mocked(runResumeCore)).not.toHaveBeenCalled();
});
```

---

## Observations (非ブロッキング)

**O-01: `ResolvedResumeBranch.checkpointOid` はオーケストレーター側で未使用**  
File: `src/core/issue-target/resume.ts:88–92`

戻り値型 `ResolvedResumeBranch.checkpointOid` はオーケストレーターで参照されていない（`runAttachVerification` は `resolved.branch` のみ受け取る）。設計 D3「実体化の一次情報は rebind 側 runAttachVerification が再解決する」に従った意図的な設計。attach orchestrator (`src/core/attach/orchestrator.ts:10`) で同じ OID 渡しパターンを確認済みのため実装の一貫性はある。将来 `archive --from-issue` 等で再利用される可能性に備えるなら doc comment で "currently unused by orchestrator; reserved for future callers" 旨を明記すると保守性が上がる。

**O-02: CLI chain テストが linked branch 形と PR head 形を明示的に区別しない**  
File: `src/cli/__tests__/resume-from-issue.test.ts`

TC-001/TC-002 を同一 describe・同一モック構成で検証しており、`listIssueLinkedBranches` が linked branch 由来か closedByPR 由来かを区別していない。フォームの区別は adapter (TC-017) と core resolver (TC-002 describe) で pin されており、組成的な網羅は成立している。
