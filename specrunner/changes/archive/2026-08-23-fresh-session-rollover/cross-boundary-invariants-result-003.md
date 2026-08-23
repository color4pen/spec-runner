# Cross-Boundary-Invariants Review: fresh-session-rollover

**Iteration**: 3  
**Reviewer**: cross-boundary-invariants  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 前周 findings の解消状況

前周 (iteration-2) で HIGH/MEDIUM/LOW の 3 件を再指摘した。code-fixer の変更ファイル（`src/adapter/claude-code/agent-runner.ts` / `src/adapter/shared/session-log-writer.ts` / テスト群）を読み直し、解消状況を確認した。

| Finding | 裁定 | 解消状況 |
|---------|------|---------|
| F1 (HIGH) throw 経路が rollover ループを素通りする | operator: fix | **解消済み** |
| F2 (MEDIUM) budget 枯渇時の二重呼出し | operator: fix | **解消済み** |
| F3 (LOW) writeSummary の session/usage 整合性 | operator: fix | **解消済み** |

---

## 前周指摘の解消詳細（読み直し確認）

### F1 解消確認

`agent-runner.ts` の rollover ループ（lines 1003–1125）に try-catch が追加されている。

```typescript
for (let rolloverAttempt = 0; rolloverAttempt <= maxRollovers; rolloverAttempt++) {
  try {
    if (maxRetries === 0) {
      queryResult = await runMainWorkTurn();
    } else {
      queryResult = await retryWithBackoff(runMainWorkTurn, {...});
    }
  } catch (iterErr) {
    if (!abortController.signal.aborted) {
      const causeText = collectCauseText(iterErr instanceof Error ? iterErr : new Error(String(iterErr)));
      const throwIterIsExhaustion = causeText ? isContextExhaustionError(causeText) : false;

      if (throwIterIsExhaustion) {
        // ... rollover 処理 (budget あり → continue, budget なし → 即 return)
      }
    }
    throw iterErr; // 非 exhaustion / abort 発火中は再 throw
  }
  ...
}
```

throw 経路の context exhaustion が同一 rollover ループ内で捕捉され、result 経路と同じ判定を受ける。operator 裁定 (1) を充足している。✅

### F2 解消確認

post-loop handler（lines 1253–1259）に `!rolloverExhausted` ガードが追加されている。

```typescript
if (!rolloverExhausted) {
  contextObserver.observeResult(errorResult as Record<string, unknown>);
}
const errorJoined = joinErrorsFromResult(errorResult);
if (errorJoined && !rolloverExhausted) contextObserver.markExhaustion(errorJoined);
```

`rolloverExhausted = true` のとき、ループ内で既に `observeResult` + `markExhaustion` が呼ばれているため、二重呼出しが排除されている。operator 裁定 (2) を充足している。✅

### F3 解消確認

`sessionLogWriter.writeSummary` の呼び出し（lines 1503–1510）が修正されている。

```typescript
sessionLogWriter.writeSummary({
  sessionId: sessionRollovers.length > 0 ? undefined : extractedSessionId,
  model: resolvedConfig.model,
  modelUsage: extractedModelUsage,
});
```

rollover が発生した場合（`sessionRollovers.length > 0`）、`sessionId` を `undefined` にする。多セッションの累積 usage を最終 session ID に誤帰属させるミスマッチを防ぐ。コメント（lines 1499–1501）に意図が明記されている。operator 裁定 (3) を充足している。✅

---

## Findings（新規・iteration 3）

### F-NEW-1 — MEDIUM: post-success halt 3 種が `runResult.sessionRollovers` を転記しない

**ファイル**: `src/core/step/executor.ts`（call sites） / `src/core/step/step-halt.ts`（factory 定義）  
**行**: executor.ts 404 (makeDriftHalt) / 424 (makeOutputGateHalt) / 462-467 (makeCommitFailHalt)

**観察内容**:

`step-halt.ts` のファクトリ関数のうち、agent 成功後に呼ばれる 3 種がある。

| ファクトリ | 呼び出しタイミング | contextMetrics 転記 | sessionRollovers 転記 |
|-----------|-------------------|--------------------|-----------------------|
| `makeTimeoutHalt` | timeout 結果 | ✅ | ✅ |
| `makeNonSuccessHalt` | non-success 結果 | ✅ | ✅ |
| `makeDriftHalt` | **success 後** drift 検出 | ✅ | ❌ 引数なし |
| `makeOutputGateHalt` | **success 後** 出力契約違反 | ✅ | ❌ 引数なし |
| `makeCommitFailHalt` | **success 後** commit/push 失敗 | ✅ | ❌ 引数なし |

executor.ts の call site を読み直すと、3 種とも `runResult.contextMetrics` は渡しているが `runResult.sessionRollovers` は渡していない。

```typescript
// line 404 — drift halt
const halt = makeDriftHalt(drift, step.name, deps.slug, { startedAt }, runResult.contextMetrics);
//                                                                      ^^^^^^^^^^^^ のみ。sessionRollovers なし

// line 424 — output gate halt
const halt = makeOutputGateHalt(allViolations, step.name, state.branch ?? null, { startedAt }, runResult.contextMetrics);

// line 462-467 — commit fail halt
const halt = makeCommitFailHalt(finalizeError, step.name, { startedAt }, runResult.contextMetrics);
```

ファクトリ関数のシグネチャ自体にも `sessionRollovers` 受け口がない。

**壊れる不変条件**:

design D7 は「rollover 発生は `step:rollover` event と usage.json の `contextOnly` エントリとして**必ず残る**」と規定している。`CommitOrchestrator.commitHalt`（lines 587–606）は `halt.sessionRollovers` が undefined のとき contextOnly エントリを書かない。

エッジケース: rollover が発生して最終 session が成功（`completionReason === "success"`）した後、post-success guard（drift / output-gate / commit-fail）が halt を生成する場合、`runResult.sessionRollovers` が非空であっても halt には含まれず、usage.json の rollover `contextOnly` エントリが記録されない。

`step:rollover` event は rollover 時点で emit 済みのため JSONL ログには残るが、usage.json の durable record という要件が満たされない。

**発生条件の評価**:

- 1 回の rollover で最終 session が成功する（主 use case）→ executor は成功経路へ
- その後、main checkout drift / 出力契約違反 / commit push 失敗が発生する
- → drift は rollover 中に git 変更を別プロセスが行った場合にのみ起きる（珍しい）
- → output contract 違反は step ごとのチェック仕様次第
- → commit fail は ephemeral runner での push 失敗等で起き得る

このうち「rollover 成功 + commit fail」はカバレッジとして重要: context 枯渇が発生する workload（大きな実装）では commit fail のリスクも相対的に高い可能性がある。

**修正の方向**:

1. `makeDriftHalt` / `makeOutputGateHalt` / `makeCommitFailHalt` のシグネチャに `sessionRollovers?: AgentSessionRollover[]` を追加する
2. `StepHalt` の両 variant（failed / awaiting-resume）は既に `sessionRollovers?: AgentSessionRollover[]` フィールドを持つため、型定義の変更は不要
3. executor.ts の 3 call site で `runResult.sessionRollovers` を追加で渡す

---

## 確認済み不変条件（iteration 3）

以下は今周で確認し変化がないことを検証した。

| 確認項目 | 状態 |
|---------|------|
| throw 経路 rollover ループ内 try-catch 追加（F1 修正） | ✅ green |
| budget 枯渇時 observeResult/markExhaustion 二重呼出し除去（F2 修正） | ✅ green |
| writeSummary undefined sessionId（F3 修正） | ✅ green |
| transientRetryAttempts 累積維持（operator 裁定 4） | ✅ green（変化なし） |
| abort ガード: timeout / watchdog 中に rollover しない | ✅ green |
| `capturedToolResult = null` が throw/result 両 rollover パスでリセット | ✅ green |
| `resumeFallbackDone = true` で resume→fresh 二重発火防止 | ✅ green |
| `delete queryOptions["resume"]` で fresh session に resume なし | ✅ green |
| `finalizeStepArtifacts` は成功経路のみ 1 回（executor.ts: !roundOwnsGitEffects) | ✅ green |
| `TRANSIENT_TOKENS` 不変（`src/adapter/shared/transient-error.ts` 未修正） | ✅ green |
| prompt 末尾の completion directive 不変条件（rollover 後も同順） | ✅ green |
| `touchedFileMessages` がロールオーバーを跨いで蓄積継続 | ✅ green |
| `agentRedirectCounter` 共有（安全装置、意図的設計） | ✅ green |
| `makeTimeoutHalt` / `makeNonSuccessHalt` が `sessionRollovers` を転記 | ✅ green |
| `CommitOrchestrator.commitHalt` が `halt.sessionRollovers` 分を best-effort 追記 | ✅ green |
| `CommitOrchestrator.applySuccessPostPersistEffects` が `sessionRollovers` 分を追記 | ✅ green |
| `rollover-prompt.ts` が git commit/push を促す文言を含まない | ✅ green |
| throw path budget 枯渇時の即 return で post-loop 処理をスキップ（二重処理なし） | ✅ green |
| contextObserver が session ごとに新規生成（D7 分離） | ✅ green |
| `isContextExhaustionError()` が新 classifier を追加せず唯一の判定正本 | ✅ green |

---

## エビデンスサマリー

| 確認項目 | checked | 状態 |
|---------|---------|------|
| F1: throw 経路 rollover ループ内 try-catch（解消確認） | ✓ | 解消済み |
| F2: budget 枯渇時二重呼出し除去（解消確認） | ✓ | 解消済み |
| F3: writeSummary session/usage 整合性（解消確認） | ✓ | 解消済み |
| F-NEW-1: post-success halt 3 種の sessionRollovers 欠落 | ✓ | NEW MEDIUM |
| abort ガード | ✓ | green |
| finalizeStepArtifacts 単一呼出し | ✓ | green |
| TRANSIENT_TOKENS 不変 | ✓ | green |
| capturedToolResult リセット | ✓ | green |
| prompt 末尾 completion directive 不変条件 | ✓ | green |
| COMMIT_DISCIPLINE（rollover-prompt.ts） | ✓ | green |

計: checked=10, skipped=0, unverified=0
