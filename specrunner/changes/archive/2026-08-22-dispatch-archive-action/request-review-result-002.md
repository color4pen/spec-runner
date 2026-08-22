# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション検証（iteration 1 の内容を再確認・拡充）

**`.github/workflows/specrunner-dispatch.yml:22-28`**  
実コード確認。`action` inputs の `choices` は `start` / `resume` の 2 択のみ（行 25-27）。`archive` が存在しないという前提は正確。

**`src/core/issue-target/archive.ts:132-140`**  
実コード確認。`for (const pr of closingPRs)` ループ内で `git fetch origin <headRefName>` を実行し、`exitCode !== 0` の場合に `logWarn` して `continue`（skip）。全 PR が skip されると `archiveFromIssueUnconfirmedError` が throw される。要求の記述と一致。

**`completeAfterMerge()` in `src/core/archive/merge-completion.ts`**  
実コード確認。`markJobArchived(slug, recordDir)` → `runPostMergeCleanup(...)` の順で呼ぶ。要求の「local state への `markJobArchived` + `runPostMergeCleanup`」説明は正確。

**`src/cli/archive-from-issue.ts:103-115` — local short-circuit**  
実コード確認。`loadStateByJobId` が成功した場合は `resolveArchiveBranchFromIssue` と `runAttachVerification` を呼ばずに直接 `runArchive` へ。local state がある環境では branch 削除の影響を受けないという前提は正確。

**`src/core/attach/orchestrator.ts:58-64` — runAttachVerification の fetch**  
実コード確認。`runAttachVerification` は branch 名を受け取り、無条件に `git fetch origin <branch>` を実行する。失敗時は `ATTACH_FETCH_FAILED` を throw する。これが iteration 1 で検出した gap（`resolveArchiveBranchFromIssue` が pull ref fallback で成功しても、次の `runAttachVerification` が head branch を再 fetch して失敗する）。

**`src/core/archive/plain-archive.ts:126-147` — MERGED + archiveRecorded**  
実コード確認。PR state が `MERGED` かつ `archiveRecorded` の場合に `completeAfterMerge` を呼んで `exitCode: 0` を返す。要求の「MERGED 確認 → completeAfterMerge → exit 0」フローと一致。

### 2. operator 裁定（選択肢 B）との整合確認

iteration 1 で escalation した Finding 1（`runAttachVerification` が fallback 後も deleted branch を再 fetch して失敗する）に対し、operator は **選択肢 B** を採用した:

> runAttachVerification に fetch 済み checkpointOid を受け取る任意入力を追加し、指定時は fetch / rev-parse を省略して checkpoint 読み込みと verifyCheckpoint のみを実行する。archive-from-issue の pull ref fallback 経路はこのオプションで検証を通す。resume --from-issue / job attach --branch の既存経路は OID を渡さず現行動作のまま。実装範囲に archive-from-issue.ts と orchestrator の該当拡張を含め、受け入れ条件の「branch 削除済みシナリオ」は ephemeral（local state 無し）の end-to-end で固定すること。

この裁定により:
- `runAttachVerification` に `checkpointOid?: string` 任意入力が追加され、既存の `job resume --from-issue` / `job attach --branch` 経路は OID を渡さず現行動作を維持する
- `resolveArchiveBranchFromIssue` の pull ref fallback で取得した OID を `runAttachVerification` に渡すことで fetch/rev-parse をスキップ
- 実装範囲に `src/core/attach/orchestrator.ts`（runAttachVerification 拡張）と `src/cli/archive-from-issue.ts`（OID 受け渡し）が含まれることが明示

### 3. 既存テストの確認

- `src/core/issue-target/__tests__/archive.test.ts`：TC-008〜014, TC-021, TC-023, TC-024 を確認
- `src/cli/__tests__/archive-from-issue.test.ts`：TC-015〜019, TC-025〜028 を確認
- TC-011（4 点一致で branch/slug/checkpointOid 返却）は head branch fetch 成功の主経路テスト。fallback は別テスト追加が必要であり既存テストは変更不要
- TC-019（no local state → rebind → archive）は `runAttachVerification` が呼ばれることを assert している。Option B で `checkpointOid` 引数が追加されると、このテストは `runAttachVerification` 呼び出しに `checkpointOid` が含まれることの検証へ更新が必要になる可能性がある（受け入れ条件「locator の旧 fetch 挙動を pin するテストに限り新契約への更新を許容する」の対象に該当しうる）

## 検証できなかった項目

- `git fetch origin refs/pull/<n>/head` 実行後の OID 取得手段（`FETCH_HEAD` 使用 vs 専用 refspec）の選択は実装詳細として design step に委ねる
- `setupWorkspace` が `attachCheckpoint.branch = headRefName`（削除済み）を使った場合の動作（push/tracking の影否）は end-to-end テストで検証される前提

## Findings 詳細

Finding なし。iteration 1 の high/decision-needed finding（runAttachVerification が fallback 後に deleted branch を再 fetch する）は operator 裁定（選択肢 B）で解決済み。request + operator 裁定の組み合わせで実装範囲・受け入れ条件は明確かつ実現可能。
