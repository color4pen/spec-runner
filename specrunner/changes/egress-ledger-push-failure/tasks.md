# Tasks: egress-ledger-push-failure

## T-01: `CommitPushInfra` に `persistBeforePush` フィールドを追加する

対象ファイル: `src/core/step/commit-push.ts`

- [x] `CommitPushInfra` インターフェース（:39-43）にオプショナルフィールド `persistBeforePush?: (oid: string) => Promise<void>` を追加する

**Acceptance Criteria**:
- `CommitPushInfra` の既存フィールド（`spawnFn` / `sleepFn` / `events`）は変更されない
- `persistBeforePush` は optional であり、既存のすべての `CommitPushInfra` 生成コードがコンパイルエラーなしでビルドできる
- `typecheck` が green

---

## T-02: `commitAndPush` に persist-before-push 不変式を実装する（scoped モード）

対象ファイル: `src/core/step/commit-push.ts`

scoped モードの commit 成功後（:523-531 付近）、`runInlineEgressCheck` 呼び出しの前に以下を挿入する:

- [x] `gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"])` で commit 直後の OID を取得する
- [x] OID が非 null かつ `infra.persistBeforePush` が提供されていれば `await infra.persistBeforePush(oid)` を呼び出す
- [x] `persistBeforePush` が throw した場合は rethrow する（fail-closed: 台帳への書き込み確認前に push しない）
- [x] OID が null の場合（rev-parse 失敗）は `persistBeforePush` を呼ばずそのまま続行する

**Acceptance Criteria**:
- scoped モードで commit が成功した場合、`runInlineEgressCheck` 呼び出し前に `persistBeforePush` が呼ばれる
- `persistBeforePush` が throw した場合、`commitAndPush` は throw を伝播させ push は実行されない
- `typecheck` が green

---

## T-03: `commitAndPush` に persist-before-push 不変式を実装する（guarded モード）

対象ファイル: `src/core/step/commit-push.ts`

guarded モードの commit 成功後（:591-600 付近）、`runInlineEgressCheck` 呼び出しの前に以下を挿入する:

- [x] T-02 と同様の `rev-parse HEAD` → `persistBeforePush` の呼び出しを挿入する
- [x] scoped モードと同一の fail-closed 動作（throw rethrow）を実装する

**Acceptance Criteria**:
- guarded モードで commit が成功した場合、`runInlineEgressCheck` 呼び出し前に `persistBeforePush` が呼ばれる
- `typecheck` が green

---

## T-04: `commitFinalState` の params に `persistBeforePush` を追加し、commit 直後に呼び出す

対象ファイル: `src/core/step/commit-push.ts`

- [x] `commitFinalState` の params 型に `persistBeforePush?: (oid: string) => Promise<void>` を追加する
- [x] commit 成功後（:685-689 付近）、`rev-parse HEAD` で OID を取得する
- [x] `persistBeforePush` が提供されていれば `await persistBeforePush(oid)` を呼ぶ（try-catch で best-effort: `commitFinalState` は best-effort パスのため失敗を warn として続行。警告メッセージは既存の "Warning: ..." 形式に揃え、`` `Warning: ${messageLabel} persistBeforePush failed for ${slug}: ${err instanceof Error ? err.message : String(err)}. Continuing with push.` `` を stderrWrite する）
- [x] 既存の `:693` の設計メモ「terminal path — in-memory union is sufficient; no need to persist the OID」を撤去し、新しい動作を説明するコメントに差し替える

**Acceptance Criteria**:
- `commitFinalState` が commit を作成した場合、push 試行前に `persistBeforePush` が呼ばれる
- `persistBeforePush` が throw しても `commitFinalState` の push 試行はブロックされない（try-catch で warn）
- `:693` の誤った設計メモが存在しない
- `typecheck` が green

---

## T-05: `LocalRuntime.finalizeStepArtifacts` に `persistBeforePush` コールバックを渡す

対象ファイル: `src/core/runtime/local.ts`

- [x] `finalizeStepArtifacts` 内（:676-688 付近）で `commitAndPush` を呼ぶ際、`commitPushInfra` を拡張して `persistBeforePush` コールバックを追加する
- [x] コールバックの実装: `state.jobId` と `this.slugStoreOpts()` を使い `this.updateJobState(jobId, (s) => appendSynthesizedCommit(s, oid), slugOpts)` を呼ぶ
- [x] `slugStoreOpts()` が `undefined` を返す場合（ワークスペース未初期化）は no-op として扱う

**Acceptance Criteria**:
- `LocalRuntime.finalizeStepArtifacts` を経由して `commitAndPush` が呼ばれる際に `persistBeforePush` が提供される
- コールバックは `appendSynthesizedCommit` を使って state を更新し、`updateJobState` を通じて disk に永続化する
- `typecheck` が green

---

## T-06: `LocalRuntime.commitFinalState` に `persistBeforePush` コールバックを渡す

対象ファイル: `src/core/runtime/local.ts`

- [x] `commitFinalState` 呼び出し（:699-711 付近）に `persistBeforePush` フィールドを追加する
- [x] コールバックの実装: T-05 と同様に `state.jobId` と `this.slugStoreOpts()` を使った `updateJobState(appendSynthesizedCommit)` の呼び出し
- [x] `slugStoreOpts()` が `undefined` を返す場合は no-op

**Acceptance Criteria**:
- `LocalRuntime.commitFinalState` が `commitFinalState` 関数に `persistBeforePush` を渡す
- コールバックは `appendSynthesizedCommit` を使って disk に永続化する
- `typecheck` が green

---

## T-07: `pushOnly` の stderr を `pushFailedError` に含める

対象ファイル: `src/core/step/commit-push.ts`

- [x] `pushOnly` 内の `tryPush`（:804）を `gitExecExitCode` から `runSubprocess` に変更する:
  - `const tryPush = () => runSubprocess(infra.spawnFn, "git", ["push", "-u", "origin", branch], { cwd })`
- [x] 第1試行の判定を `firstPushResult.exitCode === 0` に変更し、成功時は `commit:push` イベントを emit して return する
- [x] スリープ後の第2試行も同様に `secondPushResult` として取得する
- [x] 第2試行失敗時の `pushFailedError` の detail を構築: `exit code ${secondPushResult.exitCode}` に加え、`secondPushResult.stderr.trim()` が非空であれば `: ${secondPushResult.stderr.trim()}` を連結する
- [x] `commitFinalState` の push 失敗警告（:716-719）にも `push2.stderr.trim()` を含める（`spawnFn` の返す `SpawnResult.stderr` は既に利用可能）。連結形式は既存メッセージへの末尾追記: `push2.stderr.trim()` が非空の場合に既存警告文字列の末尾に ` git stderr: ${push2.stderr.trim()}` を付加する

**Acceptance Criteria**:
- `pushOnly` が throw する `pushFailedError` の detail に最終試行の git stderr が含まれる（stderr が空の場合は exit code のみ）
- `commitFinalState` の push 失敗 stderr 警告出力に push の git stderr が含まれる
- `typecheck` が green

---

## T-08: `verifyEgressLedger` に `branch` パラメータを追加する

対象ファイル: `src/core/step/commit-push.ts`

- [x] `verifyEgressLedger` の params 型に `branch?: string` を追加する（:299-302 付近）
- [x] `egressUnknownCommitError(oid, "")` を `egressUnknownCommitError(oid, params.branch ?? "")` に変更する（:326）
- [x] `commitFinalState` 内の `verifyEgressLedger` 呼び出し（:698 付近）に `branch` を渡す

**Acceptance Criteria**:
- `verifyEgressLedger` に `branch` を渡した場合、throw される `EGRESS_UNKNOWN_COMMIT` エラーのメッセージにその branch 名が含まれる
- `verifyEgressLedger` に `branch` を渡さなかった場合は空文字でフォールバックし、既存動作と同等になる
- `commitFinalState` が `verifyEgressLedger` を呼ぶ際に `branch` を渡す
- `typecheck` が green

---

## T-09: テスト — `commitAndPush` の persist-before-push 不変式

新規ファイル: `src/core/step/__tests__/commit-push-egress-invariant.test.ts`

- [x] `commitAndPush` scoped モード: push が 2 回失敗した後も `persistBeforePush` が commit OID で呼ばれていること
- [x] `commitAndPush` guarded モード: 同上
- [x] `commitAndPush` scoped モード: push 成功時も `persistBeforePush` が commit OID で呼ばれること（push 前に呼ばれている順序確認を含む）
- [x] `commitAndPush` scoped モード: `persistBeforePush` が throw した場合、`commitAndPush` が throw し push が実行されないこと
- [x] 各テストは実 git 操作なし。fake `spawnFn`（`commit-scoped-paths.test.ts` 等の既存パターンを参照）と fake `persistBeforePush` callback で構成する

**Acceptance Criteria**:
- 上記のすべてのケースが pass する
- `test` が green

---

## T-10: テスト — `commitFinalState` の persist-before-push 不変式

同ファイル: `src/core/step/__tests__/commit-push-egress-invariant.test.ts`

- [x] `commitFinalState`: push 成功時に `persistBeforePush` が commit OID で呼ばれること
- [x] `commitFinalState`: push 失敗時も `persistBeforePush` が commit OID で呼ばれること（push 失敗が OID 永続化をブロックしないこと）
- [x] `commitFinalState`: `persistBeforePush` が throw した場合でも push が試行されること（best-effort: warn して続行）
- [x] 各テストは実 git 操作なし。`PipelineSpawnFn` の fake を使用する

**Acceptance Criteria**:
- 上記のすべてのケースが pass する
- `test` が green

---

## T-11: テスト — push 失敗 → resume の egress 検証 pin

同ファイル: `src/core/step/__tests__/commit-push-egress-invariant.test.ts`

- [x] push 失敗時に `persistBeforePush` が呼ばれた OID が、次の `verifyEgressLedger` 呼び出しの ledger に含まれることで `EGRESS_UNKNOWN_COMMIT` が発生しないことを確認する
- [x] テスト構成: fake spawnFn で `rev-list HEAD --not --remotes=origin` が前回の synthesis commit OID を返す状況をシミュレートし、そのOIDが ledger に含まれていれば throw しないことを検証する

**Acceptance Criteria**:
- push 失敗後に store に記録された OID を含む ledger で `verifyEgressLedger` を呼んだ場合、`EGRESS_UNKNOWN_COMMIT` が throw されない
- `test` が green

---

## T-12: テスト — `pushFailedError` の stderr 包含

同ファイル: `src/core/step/__tests__/commit-push-egress-invariant.test.ts`

- [x] fake spawnFn が git push に `{ exitCode: 1, stderr: "remote: error: push rejected" }` を返す場合、`pushOnly` が throw する error の detail に "remote: error: push rejected" が含まれることを確認する

**Acceptance Criteria**:
- `pushFailedError` の detail フィールドに git stderr が含まれる
- `test` が green

---

## T-13: テスト — `verifyEgressLedger` の branch 名表示

同ファイル: `src/core/step/__tests__/commit-push-egress-invariant.test.ts`

- [x] `verifyEgressLedger` を `branch: "fix/my-feature-abc12345"` で呼び、publish range に台帳外 commit が含まれる場合に throw されるエラーメッセージに "fix/my-feature-abc12345" が含まれることを確認する

**Acceptance Criteria**:
- `verifyEgressLedger` 経由の `EGRESS_UNKNOWN_COMMIT` メッセージに実 branch 名が含まれる
- `test` が green

---

## T-14: 既存テストの regression 確認

- [x] `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts` が変更なしで green であることを確認する
- [x] `src/core/step/__tests__/commit-scoped-paths.test.ts` が変更なしで green であることを確認する
- [x] `src/core/step/__tests__/executor-oid-capture.test.ts` が変更なしで green であることを確認する
- [x] `typecheck && test` をフルで実行して green を確認する

**Acceptance Criteria**:
- 既存テストがすべて変更なしで pass する
- `typecheck && test` が green
