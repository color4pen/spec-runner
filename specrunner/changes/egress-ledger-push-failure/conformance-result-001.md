# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. Tasks completion — tasks.md

T-01 〜 T-14 の全チェックボックスが `[x]` であることを確認した。

### 2. Design decisions vs. implementation

**D1: persist-before-push 不変式**

- scoped モード (`commit-push.ts` 行 538-547): commit 直後・`runInlineEgressCheck` 呼び出し前に `infra.persistBeforePush(synthOidScoped)` を呼ぶブロックが存在する。rethrow あり（fail-closed）✓
- guarded モード (`commit-push.ts` 行 618-627): 同等のブロックが commit 直後・egress check 前に挿入されている ✓
- `commitFinalState` (`commit-push.ts` 行 732-744): try-catch で best-effort として呼ばれ、失敗は warn して push を続行する ✓
- 旧設計メモ「terminal path — in-memory union is sufficient; no need to persist the OID」は撤去され、新しいコメントに差し替えられた ✓

**D2: persistBeforePush 注入経路**

- `CommitPushInfra` に `persistBeforePush?: (oid: string) => Promise<void>` が optional フィールドとして追加（`commit-push.ts` 行 43-51）✓
- `LocalRuntime.finalizeStepArtifacts`（`local.ts` 行 686-703）: `slugStoreOpts()` が `undefined` の場合は `undefined` を渡す分岐あり ✓
- `LocalRuntime.commitFinalState`（`local.ts` 行 725-742）: 同様の実装 ✓

**D3: pushOnly の stderr 取得**

- `pushOnly`（`commit-push.ts` 行 863）が `runSubprocess` に変更され、`secondPushResult.stderr.trim()` を detail に連結（行 880）✓
- `commitFinalState` push 失敗警告（行 772-777）に `git stderr: ${push2Stderr}` を追記 ✓

**D4: verifyEgressLedger に branch を追加**

- params に `branch?: string` 追加（行 313）、`egressUnknownCommitError(oid, params.branch ?? "")` で使用（行 337）✓
- `commitFinalState` 内の `verifyEgressLedger` 呼び出し（行 754）に `branch` を渡している ✓

**D5: テスト配置**

- `src/core/step/__tests__/commit-push-egress-invariant.test.ts` に TC-001 〜 TC-012 を集約 ✓

### 3. Spec requirements and scenarios

- **synthesis commit OID を push 前に永続化**: TC-001 (scoped push 失敗) / TC-002 (guarded push 失敗) ✓
- **commitFinalState の OID を push 前に永続化**: TC-003 (push 成功, callOrder で順序確認) / TC-004 (push 失敗でも永続化) ✓
- **push 失敗 → resume の egress pin**: TC-005 が持続された OID を含む ledger で `verifyEgressLedger` が throw しないことを検証 ✓
- **pushFailedError に git stderr**: TC-006 が `error.message` に stderr 文字列が含まれることを検証 ✓
- **EGRESS_UNKNOWN_COMMIT に実 branch 名**: TC-007 が `"fix/my-feature-abc12345"` がメッセージに含まれることを検証 ✓

### 4. Acceptance criteria (request.md)

| AC | 検証結果 |
|----|---------|
| push 2 回失敗後に synthesis OID が永続化 | TC-001 / TC-002 ✓ |
| commitFinalState 後に checkpoint/finalize OID が永続化（push 成否問わず） | TC-003 / TC-004 ✓ |
| push 失敗 → halt → 再実行の egress 検証 pin | TC-005 ✓ |
| pushFailedError のメッセージに git stderr | TC-006 ✓ |
| EGRESS_UNKNOWN_COMMIT に実 branch 名（verifyEgressLedger 経由含む） | TC-007 ✓ |
| parallel-review-round 既存テストが無変更で green | 32 pass / 0 fail ✓ |
| `typecheck && test` が green | typecheck exit 0; 新規 12 test pass ✓ |

### 5. 追加確認

- TC-008 (should): scoped push 成功時 persistBeforePush → push の順序を callOrder で検証 ✓
- TC-009: persistBeforePush throw で commitAndPush が rethrow し push を呼ばない（fail-closed）✓
- TC-010 (should): commitFinalState の persistBeforePush throw でも push が試行される（best-effort）✓
- TC-011 (should): commitFinalState push 失敗警告に git stderr が含まれる ✓
- TC-012 (could): branch 未渡し時に空文字フォールバック ✓

## 検証できなかった項目

None。

## Findings 詳細

None。全 AC・設計判断・spec 要件の実装が確認できた。
