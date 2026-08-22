# Code Review Feedback — halt-checkpoint-restack — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

| ファイル | 確認ポイント |
|---|---|
| `src/core/step/checkpoint-restack.ts` | 全体（568 行）。D1–D8 実装、`localTipFailed` / `recordRestack` の順序変更（iter 2 修正）を確認 |
| `src/core/step/commit-push.ts` (diff) | `recordRestack` param 追加、restack 接続箇所。egress 失敗 early-return が restack より前 |
| `src/core/runtime/local.ts` (diff) | `persistBeforePush` / `recordRestack` callback 組み立て。`JobStateStore` 新規生成パターン |
| `src/store/event-journal.ts` | `CheckpointRestackRecord` 型・`EventRecord` union・`fold()` dispatch・`FoldResult.checkpointRestacks` optional |
| `src/store/job-journal.ts` | `appendCheckpointRestack` → `_appendRecord` 委譲 |
| `src/store/job-state-store.ts` | `appendCheckpointRestack` 公開。既存 `appendOperatorEvent` / `appendFindingRecency` と同形 |
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | **iter 2 新設**。TC-008（4 ケース）/ TC-014（5 ケース）/ TC-015（state.json 不変）の明示 unit test |
| `src/core/step/__tests__/checkpoint-restack.test.ts` | 全体（863 行）。TC-029-b（`no-local-tip` で `recordRestack` 未呼び出し）の追加を確認 |
| `src/core/step/__tests__/commit-push-restack-integration.test.ts` | **iter 2 新設**。TC-033（egress 失敗 → restack 非呼び出し）/ TC-026（warn 出力順）|
| `tests/halt-checkpoint-restack-e2e.test.ts` | TC-005（Machine B attach 検証）assertion / TC-027 assertion ブロックを再精査 |
| `src/core/verification/changed-lines.ts` (diff) | `origin/<baseBranch>` fallback 追加（worktree 環境対応）|
| `tests/unit/core/verification/changed-lines-origin-fallback.test.ts` | fallback 挙動の 6 TC（OFB-01〜06） |
| `specrunner/changes/halt-checkpoint-restack/conformance-result-001.md` | F-01 / F-02 の内容と iter 2 対応状況を照合 |

### iter 1 所見の解消確認

| 所見 | iter 2 対応 | 判定 |
|---|---|---|
| review F-01: TC-008/TC-014/TC-015 unit test 未実装 | `event-journal-checkpoint-restack.test.ts` 新設。fold() / appendCheckpointRestack を明示 assert | **解消** ✓ |
| review F-02: TC-033 egress 失敗経路 explicit test なし | `commit-push-restack-integration.test.ts` 新設。git push / fetch サブコマンドが未呼び出しを assert | **解消** ✓ |
| review F-03: TC-026 warn 出力順 test なし | 同ファイルで TC-026 実装。warnIdx < restackIdx を assert | **解消** ✓ |
| review Obs: `localTipOid: ""` の無効 journal record | `localTipFailed` early-return を `recordRestack` より**前**に移動。TC-029-b で no-local-tip では recordRestack 未呼び出しを assert | **解消** ✓ |
| conformance F-01: `resumePoint.step` explicit assert 欠落 | 変更なし | **未解消** ✗ |
| conformance F-02: TC-027 graft merge OID assertion が conditional | 変更なし | **未解消** ✗ |

### TC カバレッジ（most-must）

| TC | Priority | 判定 |
|---|---|---|
| TC-001/TC-003/TC-005/TC-007/TC-011/TC-027 (int, must) | e2e | TC-005 △（resumePoint.step 欠落 → F-01）、TC-027 △（graft OID conditional → F-02）、他 ✓ |
| TC-002/TC-004/TC-009/TC-010/TC-012/TC-016〜TC-024/TC-028〜TC-032 (unit, must) | checkpoint-restack.test.ts | ✓ |
| TC-008/TC-014/TC-015 (unit, must) | event-journal-checkpoint-restack.test.ts（**iter 2 新設**） | ✓ |
| TC-033 (unit, must) | commit-push-restack-integration.test.ts（**iter 2 新設**） | ✓ |
| TC-026 (unit, should) | commit-push-restack-integration.test.ts（**iter 2 新設**） | ✓ |
| TC-034/TC-035/TC-036 (gate, must) | verification-result.md passed + 既存テスト変更なし | ✓ |

### 実装正確性

| 観点 | 結果 |
|---|---|
| D1（success path 不変）: push1 成功で即 return、restack は push2 失敗後段のみ | ✓ |
| D3（plumbing only）: GIT_INDEX_FILE を read-tree/ls-tree/update-index/hash-object/write-tree に適用。add/commit/checkout 等不発行（TC-028） | ✓ |
| D4（containment 封じ込め）: git diff --name-only でパス外を検出し push 抑制（TC-004） | ✓ |
| D5（journal before tree）: recordRestack を Step 3 で tree 構築 Step 4 より前に呼び出し。no-local-tip では呼ばない（TC-029-b） | ✓ |
| D6（graft CAS）: update-ref <branch> <mergeOid> <localTipOid>。detached HEAD → skipped、git 失敗 → failed（TC-024/TC-032） | ✓ |
| D7（callback injection）: recordRestack / persistCommit の throw を catch し継続（TC-018/TC-019） | ✓ |
| D8（best-effort fetch）: fetch 失敗は無視。rev-parse 空 stdout → no-remote-tip skip（TC-017/TC-030） | ✓ |
| changed-lines.ts fallback: worktree 環境で main が local ref にない場合 origin/main へ fallback。両方失敗で original error rethrow（fail-closed 保持） | ✓ |

## 検証できなかった項目

None（全 normative 項目を実装・テストレベルで確認した）

## Findings 詳細

### F-01（medium）— TC-005 e2e で `resumePoint.step` の explicit assertion が欠落

**ファイル**: `tests/halt-checkpoint-restack-e2e.test.ts`  
**箇所**: line ~422–426（Machine B attach verification assertion ブロック）

conformance-result-001 F-01 の引き継ぎ。iter 2 でも未修正。

spec Requirement 3 Scenario 1 の "And" 節は「resume step は halt した step に解決される」と明示する。  
request 受け入れ条件 AC-2「resume が拒否された step から再走できることをテストで固定する」と直結する。

現在の assertion:
```ts
expect(verifiedCheckpoint.state.status).toBe("awaiting-resume");
expect(verifiedCheckpoint.checkpointOid).toBe(restackedOid);
// resumePoint.step の assert なし
```

`attachResumePolicy` は resume step の `reads()` 入力が tree に存在することを検証するが、  
どの step が resume step として解決されているかは assertion されていない。  
別 step の reads() が tree に偶然存在していれば、異なる step でも attach が通過する可能性がある。

**修正方針（1 行追加）**:
```ts
expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer");
```

---

### F-02（low）— TC-027 の graft merge OID assertion が conditional

**ファイル**: `tests/halt-checkpoint-restack-e2e.test.ts`  
**箇所**: line ~386–392（TC-027 assertion ブロック）

conformance-result-001 F-02 の引き継ぎ。iter 2 でも未修正。

tasks.md TC-027 は「graft merge commit OID が synthesizedCommits 台帳に含まれることを assert する」と明記する。  
現在のコード:
```ts
const graftMergeOid = persistedOids.find(
  (oid) => oid !== restackedOid && oid !== persistedOids[0]
);
if (graftMergeOid) {           // ← conditional
  expect(localTip).toBe(graftMergeOid);
}
```

`if (graftMergeOid)` のガードにより `persistCommit(mergeOid)` が呼ばれなくても assertion は通過する。  
`persistedOids.length >= 2` は checkpoint OID + restack OID の 2 件で充足するため、  
graft merge OID の台帳記録を検証していない。

実装（`_doGraft` 内 `persistCommit(mergeOid)` 呼び出し）は正しく動作している。テスト gap のみ。

**修正方針**:
```ts
// graft 成功後の local HEAD = graft merge commit を利用して unconditional に assert
const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
expect(persistedOids).toContain(restackedOid);   // restack OID ✓
expect(persistedOids).toContain(localTip);        // graft merge OID（HEAD = graft commit）✓
```

---

## 受け入れ条件照合

| 受け入れ条件 | 対応テスト | 判定 |
|---|---|---|
| push 拒否時に awaiting-resume の quiescent checkpoint が publish される（親 = 最終 push 済み tip、未 push commit を含まない） | TC-001 / TC-003 (e2e) | ✓ |
| attach 検証が成立し、resume が拒否された step から再走できることをテストで固定 | TC-005 (e2e)（attach pass ✓、resumePoint.step 欠落 → **F-01**） | △ |
| 積み直し push も失敗した場合に throw せず warn で継続 | TC-009 (e2e all-reject) + TC-021 (unit) | ✓ |
| push 成功の通常経路は既存テスト無変更で green | TC-036 + commit-push-egress-invariant.test.ts TC-003 | ✓ |
| `typecheck && test` が green | verification-result.md: passed（全 phase） | ✓ |
