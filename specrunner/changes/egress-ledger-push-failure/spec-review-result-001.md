# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/egress-ledger-push-failure/request.md`
- `specrunner/changes/egress-ledger-push-failure/design.md`
- `specrunner/changes/egress-ledger-push-failure/spec.md`
- `specrunner/changes/egress-ledger-push-failure/tasks.md`
- `src/core/step/commit-push.ts`（全体）
- `src/core/step/commit-orchestrator.ts`（:395-427、commitSuccess 周辺）
- `src/core/runtime/local.ts`（`finalizeStepArtifacts` :676-688、`commitFinalState` :699-712、`slugStoreOpts` :201-204、`appendSynthesizedCommit` 利用箇所）
- `src/core/pipeline/parallel-review-round.ts`（:408-454、egress deadlock 防止パターン）
- `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`（Scenario 9: push failure → OID 記録）
- `src/util/git-exec.ts`（`SpawnFn` 型・`runSubprocess` / `gitExecExitCode` シグネチャ）

### バグの実在確認

コードを直接確認し、request.md に記載のすべての前提を実装で検証した。

| 要素 | 確認結果 |
|------|---------|
| `CommitPushInfra` に `persistBeforePush` なし（:39-43） | ✓ 実在する |
| scoped モード commit 後 → `runInlineEgressCheck` → `pushOnly` の順で `persistBeforePush` 呼び出しなし（:527-531） | ✓ 実在する |
| guarded モード commit 後 → `runInlineEgressCheck` → `pushOnly` の順で `persistBeforePush` 呼び出しなし（:596-600） | ✓ 実在する |
| `commitFinalState` の誤った設計メモ「terminal path — in-memory union is sufficient; no need to persist the OID」（:693） | ✓ 実在する |
| `verifyEgressLedger` が branch なし（`egressUnknownCommitError(oid, "")`、:326） | ✓ 実在する |
| `pushOnly` が `gitExecExitCode`（stderr 破棄）を使用（:804） | ✓ 実在する |
| `commitFinalState` の push 失敗警告に stderr が含まれない（:716-719） | ✓ 実在する |
| `parallel-review-round.ts:435-448` に同問題への先行対処が実装済み | ✓ 確認済み（Scenario 9 テスト含む） |

### 設計の検証

**D1（push 前に persist）**: `commitAndPush` の scoped / guarded 両モードで commit 後・`runInlineEgressCheck` 前に OID を永続化する設計。`runInlineEgressCheck` 自身が内部で `rev-parse HEAD` を呼ぶため T-02/T-03 の挿入は 2 回目の `rev-parse HEAD` になるが、git の冪等操作であり問題なし。

**D2（注入経路）**: `CommitPushInfra` への optional フィールド追加。`PipelineSpawnFn`（spawn.ts）と `SpawnFn`（git-exec.ts）は `pushOnly` で `CommitPushInfra.spawnFn` として統一されており、型整合を確認した。`commitFinalState` は `PipelineSpawnFn` を直接使用するため `runSubprocess` 呼び出しは不要 — push 結果（`push1` / `push2`）から直接 `stderr` を取得できる。

**D3（stderr 取得）**: `pushOnly` の `gitExecExitCode` → `runSubprocess` 置換は `SpawnFn` 型が同一（git-exec.ts）なので型整合あり。`commitFinalState` の push 失敗警告への stderr 追加は、`spawnFn` の返り値から `push2.stderr` を取り出すだけで型変更不要。

**D4（branch 渡し）**: `verifyEgressLedger` の params に `branch?: string` を追加し、`commitFinalState` 呼び出し元（既に `branch` を引数に持つ）から渡す。`runInlineEgressCheck` は既に branch を受け取り同じ `egressUnknownCommitError(oid, branch)` を使っている——表示の不一致を解消するだけの変更。

**D5（テスト配置）**: 新規ファイル `commit-push-egress-invariant.test.ts` への集約。既存テスト（`commit-scoped-paths.test.ts`、`executor-oid-capture.test.ts`、`parallel-review-round-git-effects.test.ts`）は `CommitPushInfra` への optional フィールド追加のみのため無変更で green が維持される設計。

### Spec シナリオの確認

5 つの Requirement それぞれに Given/When/Then のシナリオが存在し、`SHALL` / `SHALL NOT` normative keyword が含まれていることを確認した。対応する Task（T-09〜T-13）との 1:1 マッピングも確認した。

### 受け入れ基準とタスクの対応確認

| 受け入れ基準 | 対応タスク |
|------------|-----------|
| push 2回失敗後 synthesis commit OID が store に永続化されること | T-01〜T-03、T-05、T-09 |
| commitFinalState 後（push成否問わず）OID が store に永続化されること | T-04、T-06、T-10 |
| push失敗 → halt → 再実行 egress でunknown判定されないこと | T-11 |
| pushFailedError に git stderr が含まれること | T-07、T-12 |
| EGRESS_UNKNOWN_COMMIT に実 branch 名が含まれること | T-08、T-13 |
| parallel-review-round 既存テストが無変更で green | T-14 |
| typecheck && test が green | T-14 |

すべての受け入れ基準に対応するタスクが存在する。

### セキュリティ確認

- **git stderr の露出**: git push 失敗時の stderr が pushFailedError の detail と commitFinalState の警告ログに含まれる。git stderr には HTTP 認証 URL にトークンが含まれる場合がある。ただし `git-exec.ts` の `runSubprocess` は `stripSecrets(process.env)` で環境変数からのシークレット除去を行っており、URL 埋め込みトークンの運用は想定外。出力先は CLI オペレーターのターミナルのみであり、内部ツールとして許容範囲。
- **branch 名インジェクション**: `verifyEgressLedger` の branch は `state.branch`（job 作成時に確定）から来る。エラーメッセージへの文字列補間のみで git コマンドへの注入経路なし。
- **`persistBeforePush` コールバック注入**: `LocalRuntime` 自身が `updateJobState(appendSynthesizedCommit)` として注入する。外部からの注入経路なし。

## 検証できなかった項目

- T-05 で言及される `LocalRuntime.finalizeStepArtifacts` の `slugStoreOpts() === undefined` ケースの既存テスト coverage（local.ts の unit test は範囲外）。設計上は no-op フォールバックが明記されており許容範囲。
- `git rev-parse HEAD` が commit 成功直後に null を返すエッジケース（T-02/T-03 のタスク記述では skip して続行）のテストは T-09 に含まれない。極端な稀少ケースであり、受け入れ基準に含まれないため許容範囲。

## Findings 詳細

### F-01: `commitFinalState` の `persistBeforePush` が best-effort（try-catch）だが、OID 取得失敗時の警告ログが未定義

**種別**: advisory

tasks.md T-04 では "try-catch で best-effort: `commitFinalState` は best-effort パスのため失敗を warn として続行" と記載されているが、`persistBeforePush` が throw した場合の警告ログフォーマットが spec にも tasks にも規定されていない。実装者が任意のフォーマットで書くことになるが、`commitFinalState` の既存の警告パターン（`stderrWrite("Warning: ...")` 形式）に揃えることが望ましい。

blocking ではない（best-effort パスのフォーマット規定は実装者判断で適切）。

### F-02: T-07 で `commitFinalState` push 失敗 stderr の警告フォーマットが未定義

**種別**: advisory

T-07 は "commitFinalState の push 失敗警告（:716-719）にも `push2.stderr.trim()` を含める" と指示するが、既存の警告メッセージへの追記フォーマット（before/after）が示されていない。実装者は既存メッセージ末尾に連結するか、別の警告行として出力するかを判断することになる。blocking ではない。

以上 2 件のいずれも blocking 指摘ではなく、仕様の骨子・設計判断・タスク分解・テスト計画のいずれにも構造的な欠陥は見当たらない。
