# Cross-Boundary-Invariants Review: fresh-session-rollover

**Iteration**: 2  
**Reviewer**: cross-boundary-invariants  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 前周 findings の対応状況

前周 (iteration-1) で HIGH/MEDIUM/LOW の 4 件を報告した。
operator 裁定は (1)〜(3) が fixable 指示、(4) が cumulative 維持の decision-needed 裁定。
code-fixer の変更ファイルは `src/core/step/executor.ts` / `src/core/port/agent-runner.ts` の 2 件のみ（`src/adapter/claude-code/agent-runner.ts` は未変更）。

| Finding | 裁定 | agent-runner.ts 変更 | 解消状況 |
|---------|------|---------------------|---------|
| F1 (HIGH) throw 経路 rollover 素通り | fix required | なし | **未解消** |
| F2 (MEDIUM) budget 枯渇時の二重呼出し | fix required | なし | **未解消** |
| F3 (LOW) writeSummary の session ID / usage 混在 | fix required | なし | **未解消** |
| F4 (LOW) transientRetryAttempts 累積 | operator: cumulative 維持 | — | 解消（裁定受容） |

以下、未解消の 3 件を読み直しの上で再指摘する。

---

## Findings

### F1 — HIGH (再指摘): SDK throw 経路のコンテキスト枯渇が rollover ループを素通りする

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: 1001–1024（rollover ループ本体） / 1457–1527（outer catch）

**現在のコード（読み直し確認）**:

```typescript
for (let rolloverAttempt = 0; rolloverAttempt <= maxRollovers; rolloverAttempt++) {
  if (maxRetries === 0) {
    queryResult = await runMainWorkTurn();           // line 1004 — throw が素通り
  } else {
    queryResult = await retryWithBackoff(runMainWorkTurn, { ... });  // line 1007 — throw が素通り
  }

  const { lastResult: iterResult } = queryResult;  // ← throw のときここに到達しない

  if (iterResult && iterResult.subtype !== "success") {
    // ... isExhaustion チェック + rollover or break ...
  }
  break;
}
```

`runMainWorkTurn()` / `retryWithBackoff(runMainWorkTurn, …)` が throw した場合、ループ内に try-catch が存在しないため throw はループを脱出して outer try ブロック（line 990）を抜け、outer catch（line 1457）へ直接伝播する。

outer catch（lines 1504–1527）は `collectCauseText` + `isContextExhaustionError` で typed code `CONTEXT_WINDOW_EXHAUSTED_CODE` を正しく付与するが、rollover 処理は一切行わない。

**未修正の理由**:

code-fixer は `src/adapter/claude-code/agent-runner.ts` を変更していない（変更ファイル一覧に agent-runner.ts が含まれない）。rollover ループの各 iteration を try-catch で包む変更は加えられていない。

**operator 裁定との関係**:

operator 裁定 (1) は「rollover ループの各 iteration を try-catch で包み、throw として伝播する context exhaustion も rollover 分岐へルーティングする（budget 超過時は既存の typed halt）」と明示しており、tasks.md T-04 の「exhaustion の error result / throw かつ `abortController.signal.aborted === false` かつ rollover 残数あり → rollover 実行して次イテレーション」という仕様を実装する義務がある。現在の実装はこの throw 経路を対処していない。

**必要な修正の概要**:

```typescript
for (let rolloverAttempt = 0; rolloverAttempt <= maxRollovers; rolloverAttempt++) {
  try {
    if (maxRetries === 0) {
      queryResult = await runMainWorkTurn();
    } else {
      queryResult = await retryWithBackoff(runMainWorkTurn, { ... });
    }
  } catch (thrownErr) {
    // abort 発火中は rollover せず再 throw（timeout/watchdog 経路を保護）
    if (abortController.signal.aborted) throw thrownErr;
    // throw 経路の context exhaustion 判定
    const causeText = collectCauseText(thrownErr as Error);
    const isExhaustion = causeText ? isContextExhaustionError(causeText) : false;
    if (isExhaustion && rolloverAttempt < maxRollovers) {
      // rollover 処理（error result 経路と同じ steps）
      ...
      continue;
    } else if (isExhaustion) {
      rolloverExhausted = true;
      // queryResult を exhaustion result として埋めるか、break して post-loop を利用
      break;
    }
    throw thrownErr; // 非 exhaustion throw は従来どおり outer catch へ
  }
  // 以降は error result 経路の既存ロジック
  ...
}
```

**重要度が HIGH である理由**: SDK が exhaustion をどちらの形式（error result / throw）で返すかは provider 実装依存であり、throw 経路では rollover が一切発動しない。これにより「context 枯渇時に fresh session で継続する」というこの機能の主目的が達成されない可能性がある。

---

### F2 — MEDIUM (再指摘): rollover budget 枯渇時に `contextObserver.observeResult` と `markExhaustion` が二重呼出しされる

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: 1036–1037（rollover ループ内） / 1152–1154（post-loop handler）

**現在のコード（読み直し確認）**:

ループ内（budget 枯渇パス: `rolloverAttempt === maxRollovers` のとき `rolloverAttempt < maxRollovers` が false なので `else` ブランチへ）:

```typescript
if (isExhaustion && !abortController.signal.aborted) {
  contextObserver.observeResult(errorResult as Record<string, unknown>); // line 1036 ← 1回目
  contextObserver.markExhaustion(errorJoined);                           // line 1037 ← 1回目

  if (rolloverAttempt < maxRollovers) {
    // ... rollover処理（budget 枯渇時はここに入らない） ...
  } else {
    rolloverExhausted = true;
    break;
  }
}
```

post-loop handler（lines 1149–1154、`rolloverExhausted = true` の場合も `lastResult` が non-success なので必ずここに入る）:

```typescript
if (lastResult && lastResult.subtype !== "success") {
  const errorResult = lastResult as SDKResultMessage & { errors?: string[] };
  contextObserver.observeResult(errorResult as Record<string, unknown>); // line 1152 ← 2回目
  const errorJoined = joinErrorsFromResult(errorResult);
  if (errorJoined) contextObserver.markExhaustion(errorJoined);          // line 1154 ← 2回目
```

`rolloverExhausted = true` のとき、同一の `contextObserver`（budget 枯渇時は observer が差し替えられないため）に対して同一の引数で `observeResult` と `markExhaustion` が 2 回呼ばれる。両関数は冪等（`contextWindowTokens`・`exhaustionAtTokens` は単純代入）なので機能的破壊はないが、設計の論理整合性が低く、observer の状態遷移に関する暗黙の「1回のみ」前提を破る。

**未修正の理由**:

code-fixer は `src/adapter/claude-code/agent-runner.ts` を変更していない。

**operator 裁定との関係**:

operator 裁定 (2) は「budget 枯渇時の contextObserver.observeResult / markExhaustion の二重呼出しを除去する」と明示した。修正されていない。

**修正の方向**:

- ループ内で budget 枯渇 (`rolloverExhausted = true`) と判定したとき、post-loop handler がその same result に対して `observeResult` / `markExhaustion` を再度呼ばないように条件分岐を加える
- または、ループ内 budget 枯渇パスでは `observeResult` / `markExhaustion` を呼ばず、post-loop に一本化する（ただし rollover 実行パスの snapshot 取得順序 T-05 との整合に注意）

---

### F3 — LOW (再指摘): `sessionLogWriter.writeSummary` がロールオーバー済みセッションの usage を最終 session ID に紐付ける

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: 1395–1402

**現在のコード（読み直し確認）**:

```typescript
if (sessionLogWriter) {
  sessionLogWriter.writeSummary({
    sessionId: extractedSessionId,   // 最終 session の ID のみ
    model: resolvedConfig.model,
    modelUsage: extractedModelUsage, // 全セッション（rollover 分 + 最終）の累積値
  });
  sessionLogWriter.close();
}
```

rollover が発生した場合:
- `extractedModelUsage` には、各 rollover セッションの usage が per-model 加算されている（lines 1057–1071）
- `extractedSessionId` には最終 session の ID のみが入っている

結果として、ログファイルには複数セッションのメッセージが混在しているにもかかわらず、サマリーは最終 session ID に全セッション合算の usage を紐付けて記録する。ログ解析ツールが「session ID = そのセッションのコスト」と仮定している場合にミスマッチが生じる。

**未修正の理由**:

code-fixer は `src/adapter/claude-code/agent-runner.ts` を変更していない。

**operator 裁定との関係**:

operator 裁定 (3) は「sessionLogWriter.writeSummary の per-session log integrity 指摘を修正する（複数セッション混在時のサマリー紐付けを実態と一致させる）」と明示した。修正されていない。

**修正の方向（候補）**:

- rollover が発生した場合、`writeSummary` にロールオーバー数または "multi-session" の注記を加える
- または、`writeSummary` に渡す `modelUsage` を最終セッションのみの usage（累積前の値）に限定する（ただし累積値は既に `extractedModelUsage` に含まれているため分離には最終 session の raw usage を別途保持する必要がある）
- または、`sessionLogWriter` 自体を rollover ごとに close / 再 open し、per-session ログファイルを分離する

---

## 確認済み不変条件（green）

以下は前周で確認済みの事項を再検証し、変化がないことを確認した。

- `src/adapter/shared/transient-error.ts` の `TRANSIENT_TOKENS` は本変更で未変更。コンテキスト枯渇は引き続き transient と判定されない（fail-closed 維持）。
- `delete queryOptions["resume"]` が rollover 時に実行されており、fresh session は resume 無し（受け入れ条件準拠）。
- `resumeFallbackDone = true` が rollover 時に設定され、既存の resume → fresh session fallback の二重発火を防止している。
- rollover ループの abort ガード (`!abortController.signal.aborted`) により、step timeout / watchdog 中に rollover が起きない。
- `capturedToolResult = null` が rollover 時にリセットされ（line 1076）、捨てられた session の report_result が fresh session に混入しない。
- `executor.ts` の `finalizeStepArtifacts` 呼び出しは 1 回のみ（success 経路のみ）。rollover 成功時に commit が複数回走る経路はない。
- `src/core/step/step-halt.ts` の `makeTimeoutHalt` / `makeNonSuccessHalt` が `sessionRollovers` を適切に転記する。
- `CommitOrchestrator.commitHalt` でも `halt.sessionRollovers` の contextOnly エントリを best-effort 追記している。
- prompt 末尾に completion directive が来る不変条件は維持されている（rollover 後も `baseFullPrompt + promptRulesSection + rolloverSection + firstTurnCompletionDirective` の順）。
- operator 裁定 (4)「transientRetryAttempts は累積維持」は design D6 の全セッション合算方針と整合しており、再指摘しない。
- `touchedFileMessages` はロールオーバーを跨いで蓄積を継続する（リセットしない）。design D6 の worktree 由来の事実は引き継ぐ方針に準拠。
- `agentRedirectCounter` はロールオーバーを跨いで共有される。安全装置としての性質上、意図的な設計（O1: 前周で確認済み）。

---

## エビデンスサマリー

| 確認項目 | checked | 状態 |
|---------|---------|------|
| F1: throw 経路が rollover ループを素通りするか | ✓ | 未修正 |
| F2: budget 枯渇時の二重呼出しが除去されたか | ✓ | 未修正 |
| F3: writeSummary の session/usage 整合性 | ✓ | 未修正 |
| F4: transientRetryAttempts 累積（裁定済） | ✓ | 裁定受容 |
| abort ガード（timeout / watchdog） | ✓ | green |
| capturedToolResult リセット | ✓ | green |
| finalizeStepArtifacts 単一呼出し | ✓ | green |
| TRANSIENT_TOKENS 不変 | ✓ | green |
| resumeFallbackDone 二重発火防止 | ✓ | green |
| 既存 halt factories の sessionRollovers 転記 | ✓ | green |
| prompt 末尾 completion directive 不変条件 | ✓ | green |
| touchedFileMessages 蓄積継続 | ✓ | green |

計: checked=12, skipped=0, unverified=0
