# Cross-Boundary-Invariants Review: fresh-session-rollover

**Iteration**: 1  
**Reviewer**: cross-boundary-invariants  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 検査範囲

主な確認ファイル:
- `src/adapter/claude-code/agent-runner.ts` — rollover ループの実装
- `src/adapter/claude-code/rollover-prompt.ts` — 継続 prompt 組み立て
- `src/core/step/executor.ts` — AgentRunner の呼び出しと成果の処理
- `src/core/step/commit-orchestrator.ts` — usage.json / state 永続化
- `src/core/step/step-halt.ts` — StepHalt の sessionRollovers 伝播
- `src/core/port/agent-runner.ts` — AgentRunResult.sessionRollovers 型定義
- `src/adapter/claude-code/context-observer.ts` — isContextExhaustionError (正本)
- `src/adapter/shared/transient-error.ts` — 既存 transient 判定（不変確認）
- `src/config/schema/types.ts`, `resolution.ts` — contextRollover 設定

---

## Findings

### F1 — HIGH: SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする

**ファイル**: `src/adapter/claude-code/agent-runner.ts` 行 1001–1124 (rollover ループ) / 行 1457–1527 (outer catch)

**問題**:

rollover ループ (for 文) は `runMainWorkTurn` / `retryWithBackoff(runMainWorkTurn)` の **戻り値** のみを検査する設計になっている。これらが **throw** した場合、throw は `for` ループ本体に到達せず outer catch (行 1457) へ直接伝播するため、rollover が一切発動しない。

```
for (rolloverAttempt ...) {
  queryResult = await retryWithBackoff(runMainWorkTurn, ...);  // ←throwはここを突き抜ける
  
  const { lastResult: iterResult } = queryResult;  // ← throwのときここに来ない
  if (iterResult && ...) { ... isExhaustion → rollover ... }
  break;
}
// 上記 for ブロックを出た throw は outer catch へ
```

outer catch (行 1509–1527) では `collectCauseText` + `isContextExhaustionError` で typed code (`CONTEXT_WINDOW_EXHAUSTED_CODE`) を正しく付与するが、rollover は行わない。

**影響する条件**: SDK がコンテキスト枯渇を error result (errors[] に枯渇文字列) として返す場合は rollover が発動する（実装済み）。SDK が **throw** する場合（`runQuery` 内の `for await` ループが AbortError 以外で throw、または SDK generator 自体が exhaustion をエラーとして throw）は rollover が発動せず、即 `CONTEXT_WINDOW_EXHAUSTED` halt になる。

**仕様との乖離**:

`tasks.md` T-04 は rollover ループの分岐条件を明示的に **「exhaustion の error result / throw」** と記述している:
> - exhaustion の error result / throw かつ `abortController.signal.aborted === false` かつ rollover 残数あり → rollover 実行して次イテレーション

実装は error result 経路のみ対応し、throw 経路が抜け落ちている。

**重要度が HIGH である理由**: コードベースの記述 (request.md) に「error result 経路と throw 経路の両方が存在する」ことが明記されており、実際の SDK 動作でどちらが返るかは provider 実装依存。throw 経路で枯渇した場合、新機能の主目的（fresh session 継続）が達成されない。

---

### F2 — MEDIUM: rollover budget 枯渇時に `contextObserver.observeResult` と `markExhaustion` が二重呼出しされる

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
- 行 1036–1037 (rollover ループ内)  
- 行 1152–1154 (post-loop error handler)

**問題**:

`rolloverAttempt === maxRollovers` (budget 枯渇) のとき、下記の順序で同一 result に対して `observeResult` と `markExhaustion` が **2 回** 呼ばれる:

1. rollover ループ内 (行 1036–1037): exhaustion 判定後、`rolloverExhausted = true; break` の直前
2. post-loop error handler (行 1152–1154): ループ脱出後、全 non-success result に対して無条件実行

両関数とも冪等（`contextWindowTokens`・`exhaustionAtTokens` は単純代入、同じ引数なら同じ値に上書きされる）なので **機能的影響は無い** が、ループ内で once を仮定している呼び出しの意図と矛盾する。

特に `observeResult` の 2 回目は、rollover ループが既に差し替えた `contextObserver`（fresh session 用）ではなく、ループ内で `rolloverExhausted = true; break` した時点の observer（最後の枯渇 session 用）に対して行われる。実際には break の前後で observer は差し替えられていない（budget 枯渇時は observer を差し替えないため）ので同じ observer に 2 回書き込むことになり、やはり冪等だが設計の論理整合性が低い。

---

### F3 — LOW: `sessionLogWriter.writeSummary` がロールオーバー済みセッションの usage を最終 session ID に紐付ける

**ファイル**: `src/adapter/claude-code/agent-runner.ts` 行 1396–1402

**問題**:

`sessionLogWriter` は `run()` 開始時に 1 度だけ生成され、rollover 時にリセット・クローズされない。ロールオーバーが発生した場合、ログファイルには以下が混在する:

1. 捨てられたセッションのメッセージ（SDKからのストリームメッセージ）
2. 最終セッション（fresh session）のメッセージ

成功時の `writeSummary` は:
```typescript
sessionLogWriter.writeSummary({
  sessionId: extractedSessionId,    // ← 最終 session の ID のみ
  model: resolvedConfig.model,
  modelUsage: extractedModelUsage,  // ← 全セッションの累積 usage (D6 で加算)
});
```

ログファイルは複数セッション分のメッセージを含むが、サマリーは最終 session ID のみを記録し、`modelUsage` は全セッション合算値になる。ログを解析するツールが「session ID = このセッションのメッセージ・コスト」と仮定している場合、ミスマッチが生じる。

機能的影響は軽微（debug ログは正規の metricsstore ではない）だが、per-session log integrity という既存の暗黙的不変条件を破る。

---

### F4 — LOW: `transientRetryAttempts` がロールオーバーを跨いで累積する（セマンティクス変化）

**ファイル**: `src/adapter/claude-code/agent-runner.ts` 行 1015 (onRetry), 行 971 (follow-up onRetry)

**問題**:

`transientRetryAttempts` は `run()` スコープで宣言され、rollover ループの各イテレーションで `retryWithBackoff` が呼ばれるたびに `transientRetryAttempts++` が加算される。

rollover 前: `transientRetryAttempts` = 第1セッションの transient retry 回数  
rollover 後: `transientRetryAttempts` = 第1セッション + 第2セッション（fresh）の合計

既存の呼び出し元（`CommitOrchestrator` → `pushStepResult` → state.json `StepRun.transientRetryAttempts`）はこの値を「このステップ実行における transient retry 回数」として記録していた。rollover を経た場合、記録値は複数セッション分になる。

機能的には破壊的ではないが、モニタリングや運用ダッシュボードが「1ステップあたりの transient retry は高々 maxRetries 回」という不変条件を前提にしている場合、rollover によって期待値を超えた数値が記録される可能性がある（maxRetries × (maxRollovers + 1) まで到達し得る）。

---

## 観察事項（Observations）

以下は機能影響なしの設計メモ。

**O1: `agentRedirectCounter` はロールオーバーを跨いで共有（意図的）**  
design D6 では timer・watchdog を共有し続けると記述されているが、`agentRedirectCounter` も同様に共有される。第1セッションで 2 回 Agent/Task リダイレクトが発生し、fresh session でさらに 2 回あった場合、合計 4 回で上限 (>3) に達する。安全装置としての性質上、これは意図的だが、合計カウントが上限に意図せず近づく状況が生じ得る。

**O2: `touchedFileMessages` がロールオーバーを跨いで蓄積（仕様どおり）**  
design D6 「touched files 収集用の assistant message 蓄積（worktree に対する事実の和集合）」と明示されており、仕様準拠。

**O3: rollover ループ内の `contextObserver.observeResult` 呼び出しは成功パスでは行われない（正しい）**  
成功 result は post-loop の行 1212 で `observeResult` を呼ぶ。rollover ループ内では exhaustion result のみを observeResult している。成功 result に対して二重呼出しはない。

**O4: rolloverExhausted 時は最後セッションの contextMetrics は `sessionRollovers` に入らず `contextMetrics` フィールドに入る（設計どおり）**  
budget 枯渇で break した最後セッションのメトリクスは `contextObserver.snapshot()` で最終 result の `contextMetrics` に入り、`sessionRollovers` には現れない。design D7「最終 `AgentRunResult.contextMetrics` は最終 session の観測値」に準拠。

**O5: rollover 後の prompt 構造は既存の不変条件を維持している**  
`rolloverSection` は `firstTurnCompletionDirective` の直前に挿入される：
`baseFullPrompt + promptRulesSection + rolloverSection + firstTurnCompletionDirective`。
「completion directive が prompt 末尾に来る」という既存不変条件が保たれている。

---

## 確認済み不変条件（green）

- `src/adapter/shared/transient-error.ts` の `TRANSIENT_TOKENS` は本変更で未変更。コンテキスト枯渇は引き続き transient と判定されない（fail-closed 維持）。
- `delete queryOptions["resume"]` が rollover 時に実行され、fresh session は resume 無し（受け入れ条件準拠）。
- `resumeFallbackDone = true` が rollover 時に設定され、既存の resume → fresh session fallback の二重発火を防止。
- rollover ループの abort ガード (`!abortController.signal.aborted`) により、step timeout / watchdog 中に rollover が起きない。
- `capturedToolResult = null` が rollover 時にリセットされ、捨てられた session の report_result が fresh session に混入しない。
- `executor.ts` の `finalizeStepArtifacts` 呼び出しは 1 回のみ（success 経路のみ）。rollover 成功時に commit が複数回走る経路はない。
- `src/core/step/step-halt.ts` の `makeTimeoutHalt` / `makeNonSuccessHalt` が `sessionRollovers` を適切に転記する。
- `CommitOrchestrator.commitHalt` でも `halt.sessionRollovers` の contextOnly エントリを best-effort 追記している。

---

## エビデンスサマリー

| 項目 | checked | skipped | unverified |
|------|---------|---------|------------|
| rollover ループの error result / throw 対称性 | ✓ | | |
| observeResult 呼出し回数 | ✓ | | |
| sessionLogWriter 境界 | ✓ | | |
| transientRetryAttempts 累積 | ✓ | | |
| abort ガード（timeout / watchdog） | ✓ | | |
| capturedToolResult リセット | ✓ | | |
| finalizeStepArtifacts 単一呼出し | ✓ | | |
| TRANSIENT_TOKENS 不変 | ✓ | | |
| resumeFallbackDone 二重発火防止 | ✓ | | |
| 既存 halt factories の sessionRollovers 転記 | ✓ | | |
| commitHalt の rollover contextOnly 追記 | ✓ | | |
| prompt 末尾に completion directive が来る不変条件 | ✓ | | |

計: checked=12, skipped=0, unverified=0
