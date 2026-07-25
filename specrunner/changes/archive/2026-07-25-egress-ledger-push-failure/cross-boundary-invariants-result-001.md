# Cross-Boundary Invariants Review

## 検証対象

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## 読んだファイル

- `src/core/step/commit-push.ts`（全体）
- `src/core/runtime/local.ts`（`finalizeStepArtifacts` :676-706、`commitFinalState` :717-743、`slugStoreOpts` :201-207、`commitRoundArtifacts` :867-882）
- `src/core/pipeline/parallel-review-round.ts`（:415-454、egress deadlock 防止パターン）
- `src/core/step/commit-orchestrator.ts`（`commitSuccess` :395-427、`appendSynthesizedCommit` 呼び出し箇所）
- `src/state/schema/operations.ts`（`appendSynthesizedCommit` 実装）
- `src/core/step/__tests__/commit-push-egress-invariant.test.ts`（新規テスト全体）
- `tests/unit/cli/repo-root-exactly-once.test.ts`（変更箇所）
- `specrunner/changes/egress-ledger-push-failure/design.md`
- `specrunner/changes/egress-ledger-push-failure/tasks.md`
- `specrunner/changes/egress-ledger-push-failure/spec.md`

---

## 検証した境界

### 境界 1: `commitAndPush` → `runInlineEgressCheck` の状態

`persistBeforePush(synthOid)` の後、`runInlineEgressCheck` は `state.synthesizedCommits ?? []` を受け取る（ディスクに書いた `synthOid` は含まれない）。ただし `runInlineEgressCheck` は内部で `rev-parse HEAD` を呼び直し、`newCommitOid`（= `synthOid`）を自前で ledger に追加する。この in-memory ledger 構築により egress check は正しく機能する。**不変条件の破れなし。** ✓

### 境界 2: `commitAndPush.persistBeforePush` → `LocalRuntime.commitFinalState` の状態境界

`commitAndPush` の `persistBeforePush` がディスクへ synthOid を書いた後、`LocalRuntime.commitFinalState` は `state.synthesizedCommits`（呼び出し時点の in-memory state、synthOid を含まない）を `commitFinalState` に渡す。結果、`commitFinalState` の egress ledger は `{checkpointOid}` のみとなり、publish range にある synthOid が unknown → egress check 失敗 → checkpoint push skipped となる。

これは **pre-existing behavior**（修正前も同じパスで skip していた）であり、今回の変更が新たに破った不変条件ではない。修正の目的は「resume 時のデッドロック防止」であり、ディスク上に synthOid と checkpointOid が両方揃っているため、resume 時の egress check は正しく通過する。詳細は下記「観察 1」に記録する。

### 境界 3: `CommitPushInfra.persistBeforePush` → `commitScopedPaths` の契約

`CommitPushInfra` に `persistBeforePush` フィールドが追加されたが、`commitScopedPaths` はこのフィールドを呼び出さない。`commitScopedPaths` を呼ぶ `commitRoundArtifacts` は並列 round 向けで、OID capture は `captureHeadSha`（外側の try-catch ブロック）で行う。現行コードで `persistBeforePush` を設定して `commitScopedPaths` を呼ぶコールサイトは存在しない。**既存の並列 round 不変条件を破らない。** 詳細は下記「観察 2」に記録する。

### 境界 4: `appendSynthesizedCommit` の二重呼び出し

push 成功経路では：
1. `persistBeforePush(synthOid)` → `updateJobState → appendSynthesizedCommit`（push 前）
2. `commitSuccess` → `appendSynthesizedCommit(commitOid)`（push 後）

`appendSynthesizedCommit` の実装は `existing.includes(oid)` で冪等性を保証する。二重追記は安全。**不変条件の破れなし。** ✓

### 境界 5: `pushOnly` の `gitExecExitCode` → `runSubprocess` 置換

以前: `gitExecExitCode(spawnFn, cwd, [...])` → exit code のみ返却
変更後: `runSubprocess(infra.spawnFn, "git", [...], { cwd })` → `{ exitCode, stdout, stderr }` 返却

どちらも `infra.spawnFn`（`CommitPushInfra.spawnFn`、git-exec.ts 型）を使用し、exit code 0/非 0 の判定ロジックは同一。`commit:push` イベント発火のタイミング・条件は変わらない。**既存の push 動作の不変条件を破らない。** ✓

### 境界 6: `verifyEgressLedger` の `branch` 拡張

`branch?: string` を追加（optional）。省略時は `params.branch ?? ""` で空文字 fallback — 以前の `egressUnknownCommitError(oid, "")` と同一の動作。既存の全コールサイト（`commitFinalState` を除く）は `branch` を渡さないため動作変更なし。`commitFinalState` は `branch` を渡すよう更新済み。**後方互換性あり。** ✓

### 境界 7: `repo-root-exactly-once.test.ts` の grep フィルタ変更

`grepE` に `--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist` を追加。TC-018 の `B-13 × CWD` 検索に `!line.includes("verification-result")` を追加。いずれも検索スコープを縮小する変更。`verification-result.md` は pipeline 生成物（テスト出力のキャプチャ）であり、ソースコードではない。除外は正当。TC-018 の保証対象（ソースコードに B-13 の CWD 文脈参照がないこと）は変わらない。**テスト不変条件を破らない。** ✓

---

## 観察

### 観察 1: `commitFinalState` の egress ledger は push 失敗後も in-memory 状態に依存する（pre-existing behavior）

`LocalRuntime.commitFinalState` が受け取る `state.synthesizedCommits` は、`commitAndPush` 内の `persistBeforePush` がディスクに書いた synthOid を含まない。これにより `commitFinalState` の egress check は push 失敗直後も synthOid を unknown と判定し、checkpoint push を skip する。

この挙動は **修正前から存在した**（修正前も同じ経路で skip していた）。今回の修正で新たに生まれた問題ではない。ディスク上には `persistBeforePush` によって synthOid と checkpointOid の両方が書かれるため、resume 時の egress check は正しく通過し、デッドロックは発生しない。

潜在的改善策として「`LocalRuntime.commitFinalState` がディスクから最新の synthesizedCommits を読み直す」実装が考えられるが、本 request のスコープ外である。

### 観察 2: `commitScopedPaths` は `CommitPushInfra.persistBeforePush` を呼ばない

`CommitPushInfra` にフィールドが追加されたが、`commitScopedPaths` はそれを利用しない。並列 round の OID capture は `captureHeadSha` で別途行われるため、現時点の実装で問題は生じない。ただし、将来 `commitScopedPaths` を呼ぶコードが `persistBeforePush` を設定した場合、黙って無視される。インターフェースドキュメントに「`commitScopedPaths` は `persistBeforePush` を呼ばない」旨を記載することで明示できる。

---

## 判定

**not-approved findings なし。**

全境界で既存の不変条件が維持されていることを確認した。観察事項はいずれも pre-existing behavior または latent（現行コールサイトに影響なし）であり、今回の変更が新たに破った不変条件はない。
