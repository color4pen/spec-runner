# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/egress-ledger-push-failure/design.md` — 設計判断 D1〜D5 を確認
- `specrunner/changes/egress-ledger-push-failure/tasks.md` — T-01〜T-14 の実装チェックリストを確認
- `specrunner/changes/egress-ledger-push-failure/test-cases.md` — TC-001〜TC-015 を確認
- `specrunner/changes/egress-ledger-push-failure/verification-result.md` — build / typecheck / test / lint / coverage が all-green を確認
- `src/core/step/commit-push.ts` — 実装全体を通読（diff ベース）
- `src/core/runtime/local.ts` — finalizeStepArtifacts / commitFinalState の実装変更を確認
- `src/core/step/__tests__/commit-push-egress-invariant.test.ts` — 新規テストファイル全体を通読
- `tests/unit/cli/repo-root-exactly-once.test.ts` — 変更内容を確認（grepE の exclude 追加、TC-018 のフィルタ追加）

### 確認した内容

**T-01: CommitPushInfra.persistBeforePush フィールド追加**
- optional フィールドとして追加済み。既存コード（parallel round など）は undefined のまま動作することを確認。

**T-02 / T-03: commitAndPush の persist-before-push 不変式（scoped / guarded）**
- commit 成功後・runInlineEgressCheck 呼び出し前に `gitExec(["rev-parse", "HEAD"])` → `persistBeforePush(oid)` を呼ぶ順序を確認。
- `persistBeforePush` が throw した場合は rethrow（fail-closed）、null OID の場合はスキップ（設計 T-02 明示）。
- 呼び出し順序: 作成 → 記録 → egress 検証 → push ✅

**T-04: commitFinalState の persist-before-push（best-effort）**
- commit 成功後、push 前に `rev-parse HEAD` → `persistBeforePush(oid)` を try-catch で呼ぶ実装を確認。
- throw 時は stderrWrite("Warning: ... Continuing with push.") で続行。
- `:693` の誤った設計メモ "terminal path — in-memory union is sufficient; no need to persist the OID" が撤去済みを確認。

**T-05 / T-06: LocalRuntime での callback 注入**
- `finalizeStepArtifacts`: `slugStoreOpts()` が non-null の場合に `appendSynthesizedCommit` を使う callback を `CommitPushInfra` に注入。
- `commitFinalState`: 同様の callback を params に注入。
- `slugStoreOpts()` が undefined の場合は no-op（workspace 未初期化時の安全ガード）。

**T-07: pushOnly の stderr 取得**
- `gitExecExitCode` → `runSubprocess` への変更を確認。
- `secondPushResult.stderr.trim()` が非空の場合に `exit code N: <stderr>` 形式で detail に連結。
- `commitFinalState` の push 失敗警告にも `push2.stderr` を追加済み。

**T-08: verifyEgressLedger に branch パラメータ追加**
- `branch?: string` を params に追加し、`egressUnknownCommitError(oid, params.branch ?? "")` で使用。
- `commitFinalState` 内の呼び出し側で `branch` を渡すことを確認。

**テストカバレッジ（TC-001〜TC-015）**
- TC-001: scoped mode push 失敗 → persistBeforePush が OID で呼ばれる ✅
- TC-002: guarded mode push 失敗 → persistBeforePush が OID で呼ばれる ✅
- TC-003: commitFinalState push 成功 → persistBeforePush が push 前に呼ばれる（順序確認込み）✅
- TC-004: commitFinalState push 失敗 → persistBeforePush が呼ばれる ✅
- TC-005: push 失敗後の resume egress pin（最重要ケース）✅
- TC-006: pushFailedError に stderr が含まれる ✅
- TC-007: verifyEgressLedger に branch を渡すと EGRESS_UNKNOWN_COMMIT に branch 名が入る ✅
- TC-008: scoped mode push 成功でも persistBeforePush が egress 前に呼ばれる ✅
- TC-009: persistBeforePush が throw → commitAndPush が rethrow し push は実行されない（fail-closed）✅
- TC-010: commitFinalState で persistBeforePush が throw しても push が試行される（best-effort）✅
- TC-011: commitFinalState push 失敗警告に git stderr が含まれる ✅
- TC-012: branch を渡さない場合は空文字フォールバック ✅
- TC-013〜TC-015: 既存テスト regression + typecheck && test 全体 → verification-result.md で green を確認 ✅

**受け入れ基準の全項目を確認済み**
- push 2 回失敗後の synthesis OID 永続化 → TC-001/TC-002 で pin ✅
- commitFinalState の OID 永続化（push 成否問わず）→ TC-003/TC-004 で pin ✅
- push 失敗 → resume → egress unknown にならない → TC-005 で pin ✅
- pushFailedError に stderr → TC-006 で pin ✅
- EGRESS_UNKNOWN_COMMIT に branch 名 → TC-007 で pin ✅
- parallel-review-round 既存テスト green → optional field で影響なし、verification 確認 ✅
- typecheck && test green → verification-result.md 確認 ✅

## 検証できなかった項目

None — すべての受け入れ基準と TC を確認した。

## Findings 詳細

None（blocking なし）。

---

### Observations（情報のみ、対応不要）

**1. rev-parse HEAD の二重呼び出し（scoped / guarded）**

`commitAndPush` の scoped / guarded 両モードで、commit 後に `rev-parse HEAD` が 2 回実行される:
- T-02/T-03 の persistBeforePush 用
- `runInlineEgressCheck` 内の `newCommitOid` 取得用

両者は連続して呼ばれるため OID は同じであり機能的に問題はない。ただし git プロセスが 1 回余分に走る。`runInlineEgressCheck` の OID 取得を `persistBeforePush` で取得済みの値に置き換える（コールバック返り値 or 共有変数）ことで削減できるが、現時点でパフォーマンス上の問題はなくコードが明快なためリファクタは scope 外で妥当。

**2. commitFinalState の rev-parse HEAD 二重呼び出し**

`commitFinalState` でも同様に:
- persistBeforePush 用の `rev-parse HEAD`
- egress verification ブロックの `rev-parse HEAD`

同上。

**3. null OID 時の push 継続（design 明記済みの edge case）**

rev-parse HEAD が null を返す（spawn 失敗）場合、persistBeforePush はスキップされ push が継続する。T-02/T-03 の設計仕様に明記されており意図的だが、理論上は「OID 永続化未確認でも push する」経路が残る。実運用で rev-parse が失敗するケースは git repo が壊れている状況であり、commit 自体も成功しているはずなので現実的リスクは極めて低い。

**4. tests/unit/cli/repo-root-exactly-once.test.ts の付随変更**

この変更は `egress-ledger-push-failure` のスコープ外ファイルへの修正だが、変更内容は正当:
- `grepE` の exclude 追加（node_modules / .git / dist を grep から除外）: ローカル実行時の誤検知を防ぐ hygiene 修正
- TC-018 の `verification-result.md` フィルタ追加: この PR の `verification-result.md` がテスト名（"B-13"）を含むため TC-018 の grep が false positive を返す問題への対処

いずれも test の安定性向上であり regression リスクなし。
