# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証

**`.github/workflows/specrunner-dispatch.yml:22-27`**  
実コードを確認。`action` の choices は `start` / `resume` の 2 択のみ（行 25-27）。要求が述べる「archive を dispatch できない」という前提は正確。

**`src/core/issue-target/archive.ts:132-140`**  
実コードを確認。`for (const pr of closingPRs)` ループ内（行 132-140）で `git fetch origin <headRefName>` を実行し、失敗した候補を skip する。全候補 skip なら `archiveFromIssueUnconfirmedError` が throw される。要求が述べる動作と一致。

**`completeAfterMerge()` in `src/core/archive/merge-completion.ts`**  
実コードを確認。`markJobArchived(slug, recordDir)` → `runPostMergeCleanup(...)` の順で呼ぶ。要求の「local state への `markJobArchived` + `runPostMergeCleanup`」という説明は正確。

### 2. フロー全体の検証

`src/cli/archive-from-issue.ts` を読んだ。`job archive --from-issue <n>` の完全フロー:

1. resolveCompletedJobId（issue comment scan）
2. loadStateByJobId（local short-circuit — local state があれば step 5,6 を skip）
3. **resolveArchiveBranchFromIssue**（PR head branch fetch + 4 点 identity check） ← 要求が修正対象とする場所
4. **runAttachVerification**（`src/core/attach/orchestrator.ts`）← `git fetch origin <headRefName>` を再度実行する
5. setupWorkspace
6. runArchive → runPlainArchive → MERGED 検知 → completeAfterMerge

`src/core/attach/orchestrator.ts` を読んだ。`runAttachVerification` は `git fetch origin <branch>` を実行し（行 58-63）、失敗時は `ATTACH_FETCH_FAILED` を throw する。

`src/core/archive/plain-archive.ts` を読んだ。MERGED 検知後に `archiveRecorded` であれば `completeAfterMerge` を呼ぶ動作は正確（行 126-147）。

### 3. 既存テストの確認

- `src/core/issue-target/__tests__/archive.test.ts`：TC-011〜014, TC-021, TC-023, TC-024 を確認
- `src/cli/__tests__/archive-from-issue.test.ts`：TC-015〜019, TC-025〜028 を確認
- `src/core/archive/__tests__/plain-archive.test.ts`：TC-011〜017 等を確認（MERGED + archiveRecorded → completeAfterMerge のカバレッジあり）

### 4. 受け入れ条件の実現可能性評価

| 条件 | 評価 |
|------|------|
| dispatch に archive を追加し YAML parse テストで固定 | 実現可能 |
| fallback fetch + 4 点 identity 一致をテストで固定 | 実現可能（`resolveArchiveBranchFromIssue` 単体レベル） |
| fallback 経路でも identity 不一致 skip / 全候補不成立 UNCONFIRMED | 実現可能 |
| MERGED + archiveRecorded + identity 通過 → completeAfterMerge → exit 0 | `runPlainArchive` レベルのテストで実現可能（後述の注意点あり） |
| awaiting-archive 維持 / --with-merge 経路 / typecheck && test green | 変更なし / 既存テストで担保 |

## 検証できなかった項目

- `#1051` 実装そのものの内容（別 PR）
- `git fetch origin refs/pull/<n>/head` の成否に関する GitHub 実測の検証

## Findings 詳細

### Finding 1（high / decision-needed）: `runAttachVerification` が fallback 後も deleted branch を再 fetch する

`resolveArchiveBranchFromIssue` に `refs/pull/<prNumber>/head` fallback を追加しても、`archive-from-issue.ts` の次のステップ（行 130）で `runAttachVerification` が `git fetch origin <headRefName>` を再度実行する。head branch が削除済みの場合、この fetch は失敗し `ATTACH_FETCH_FAILED` が throw される。

**影響範囲**: ephemeral runner（local state を持たない環境）。local state がある場合は `loadStateByJobId` short-circuit で step 5,6 が skip されるため影響を受けない。要求の主目的（Actions UI でのリモート完結）は ephemeral runner での動作であり、この gap は機能全体を阻害する。

**受け入れ条件との関係**: 「branch 削除済みシナリオで completeAfterMerge → exit 0」の条件は `runPlainArchive` 単体テスト（local state シナリオ）では pass するが、実際の ephemeral runner の end-to-end フローでは失敗する。条件文が "identity 通過" と述べていることから、`resolveArchiveBranchFromIssue` の fallback 経路を通るシナリオをテストする場合は `runAttachVerification` の問題に当たる。

**決定が必要な対応オプション**:
- **A**: `archive-from-issue.ts` を修正し、`resolveArchiveBranchFromIssue` が PR ref fallback を経由した場合は `runAttachVerification` の fetch フェーズをスキップして `checkpointOid` を直接利用する
- **B**: `runAttachVerification` に `checkpointOid` オプションを追加し、既存 OID がある場合は fetch を省略する
- **C**: fallback が local state を構築してから `runArchive` に直行し、`runAttachVerification` を呼ばないようにフローを再設計する
- **D**: 本 request のスコープを「local runner での改善のみ」と明確に絞り、ephemeral runner の完全対応は別 issue にする

実装範囲セクションに `archive-from-issue.ts` の変更が記載されていないため、実装者の判断が曖昧になるリスクがある。どのアプローチを取るかを明示することが望ましい。
