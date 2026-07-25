# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

以下のファイル・行番号アサーションをすべて Read ツールで直接確認した。

**`src/core/step/commit-push.ts`**

- **lines 299-329 (`verifyEgressLedger`)**: 確認済み。関数シグネチャに `branch` パラメータなし。line 326 に `throw egressUnknownCommitError(oid, "")` のハードコード空文字を確認。
- **lines 352-381 (`runInlineEgressCheck`)**: 確認済み。`branch` を引数に持ち、line 378 に `throw egressUnknownCommitError(oid, branch)` を確認。同一エラーが呼び出し箇所によって branch 表示の有無が異なる状態を確認。
- **lines 528-531 (scoped mode)**: 確認済み。commit → `runInlineEgressCheck` → `pushOnly(branch, cwd, step.name, infra)` の順序。
- **lines 597-600 (guarded mode)**: 確認済み。commit → `runInlineEgressCheck` → `pushOnly(branch, cwd, step.name, infra)` の順序。
- **lines 632-720 (`commitFinalState`)**: 確認済み。commit 後に `rev-parse HEAD` で OID 取得 → in-memory ledger 構築 → `verifyEgressLedger` → push。line 693 に設計メモ「terminal path — in-memory union is sufficient; no need to persist the OID」を確認。`store.persist` は呼ばれない。
- **lines 801-820 (`pushOnly`)**: 確認済み。`gitExecExitCode` を使用（戻り値は exit code のみ、stderr は破棄）。2 回失敗で `pushFailedError(stepName, branch, `exit code ${secondPushCode}`)` を throw。stderr は detail に含まれない。

**`src/util/git-exec.ts`**

- **`gitExecExitCode`**: 確認済み。`runSubprocess` の戻り値から `exitCode` のみ返す。`stderr` は参照しない（破棄）。

**`src/core/step/commit-orchestrator.ts`**

- **lines 409-421 (`commitSuccess`)**: 確認済み。`appendSynthesizedCommit(s, result.commitOid)` および `appendSynthesizedCommit(s, result.exitCommitOid)` → `store.persist(s)` はすべて `commitSuccess` 内のみ。
- `pushOnly` が throw した場合、executor.ts の `finalizeStepArtifacts` が `finalizeError` を捕捉し "halt" を返す（`commitSuccess` には到達しない）。OID 永続化がスキップされることを executor.ts:434-460 のコードで確認。

**`src/core/pipeline/parallel-review-round.ts`**

- **lines 418-448**: 確認済み。push 失敗時に `captureHeadSha` で OID を取得し、`aggregateVerdictResult = "escalation"` として `commitRound` に流すことで synthesizedCommits に OID が記録される。コメントに「egress デッドロック防止」と明記あり。逐次経路にはこの実装が移植されていないことも確認（既存テスト `parallel-review-round-git-effects.test.ts:609-682` に push failure → OID 記録の pin あり）。

**`src/core/step/commit-push.ts`**

- **`CommitPushInfra` (line 39-43)**: 確認済み。`spawnFn`, `sleepFn`, `events` の 3 フィールドを持つ infra seam。`persistOid` コールバックは現時点で未存在（修正で追加の対象）。

**`src/errors.ts`**

- **`pushFailedError` (line 245-251)**: `detail` は string として受け取り、エラー detail に `${stepName}: git push origin ${branch} failed after retry: ${detail}` として埋め込む。stderr を渡す改修の受け皿は存在する。
- **`egressUnknownCommitError` (line 449-455)**: `branch` パラメータあり。detail に `Egress backstop: unknown commit ${oid} in publish range for branch '${branch}'.` を含む。`verifyEgressLedger` から空文字で呼ばれているだけなので、呼び出し側に branch を渡せばメッセージが改善できる。

### 要件・受け入れ基準の整合確認

- 要件 1（台帳完全性）: 逐次経路（guarded / scoped）の commitAndPush において「commit 後・push 前に OID を persist」する修正。parallel-review-round に実績あり ✅
- 要件 2（commitFinalState の checkpoint/finalize OID 永続化）: `commitFinalState` に `persistOid` コールバックまたは同等の機構を追加する。`LocalRuntime` は `deps.storeFactory(state.jobId)` でストアにアクセス可能 ✅
- 要件 3（push stderr 診断）: `gitExecExitCode` を `spawnFn` 直呼び出しに置換して stderr を捕捉し `pushFailedError` の detail に含める。`commitFinalState` の push 失敗警告も同様 ✅
- 要件 4（egress branch 表示）: `verifyEgressLedger` に `branch` パラメータを追加し、全呼び出し箇所（`commitFinalState` 内）から渡す ✅
- 要件 5（再発 pin）: 新規テストが必要。`CommitPushInfra` の infra seam（spawnFn / sleepFn）が注入可能なので push 失敗シミュレーションは可能 ✅

### スコープ外の確認

スコープ外として明記された項目（既存 job 回復経路、並列 job 排他制御、egress fail-closed 変更、push リトライ変更）は request.md に明記されており妥当。

## 検証できなかった項目

None — すべての主要コードアサーションを直接確認した。

## Findings 詳細

None — ブロッキング issue なし。
