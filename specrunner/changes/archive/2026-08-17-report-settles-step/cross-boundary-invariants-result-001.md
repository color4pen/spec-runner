# Cross-Boundary Invariants Review — report-settles-step (Iteration 1)

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更していないコードの暗黙の前提を新しい挙動が黙って破っていないかを検出する。

---

## Scope

対象差分: `src/adapter/claude-code/agent-runner.ts`（+157 lines / −32 lines）および新規テスト `agent-runner-report-settles.test.ts`。

変更の核心は 4 点:

- **T-02**: `extractedSessionId` を最終 success result より前に early capture（init message 等から）
- **T-03**: main work turn に専用 `mainQueryAbort` を導入し、shared → main の一方向伝播を張る
- **T-04**: report_result handler 起点の grace timer（60s）で main work turn を grace-exit させる
- **T-05 (D5)**: outer catch で `capturedToolResult !== null` なら `completionReason: "success"` で返す

---

## Findings

### Finding 1 — HIGH: T-02 の早期捕捉が resume-fallback シナリオで古い session_id を固定し、postWork が誤セッションを resume する

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: ~727（T-02 guard）/ ~838–844（resume-fallback 第 2 runQuery 呼び出し）

**不変条件の定義**:  
`extractedSessionId` は、postWork prompts が `resume: extractedSessionId` で投げるときに参照するセッション識別子であり、**進行中の作業セッションの id を正確に表さなければならない**。

**破れ方**:

`extractedSessionId` は `run()` スコープで宣言されており、`runQuery` 呼び出しをまたいでリセットされない。

1. call 1（`resumeSessionId` あり）: init message から `extractedSessionId = OLD_SESSION_ID` を早期捕捉（T-02）
2. call 1 が非 abort エラーで失敗 → resume-fallback（`delete queryOptions["resume"]`）
3. call 2（fresh session）開始: T-02 guard `if (!extractedSessionId)` → すでに `OLD_SESSION_ID` が設定済みのため、新セッションの init message の `session_id` を**スキップ**
4. call 2 で grace-exit が発生（success result が来ない）→ `extractedSessionId = OLD_SESSION_ID` のまま
5. postWork が `resume: OLD_SESSION_ID`（古いセッション）で走る → 誤ったセッションにルール follow-up が適用される

**非 grace-exit 経路は安全**: call 2 が success result を返した場合、  
`extractedSessionId = successResult.session_id ?? extractedSessionId`  
で `??` の左辺（新セッション id）が採用され、`OLD_SESSION_ID` は上書きされる。grace-exit 経路にのみ成立する regression。

**既存コードとの比較**: T-02 以前は call 1 の失敗時に `extractedSessionId` が `undefined` のままであったため、call 2 の success result から正しい新セッション id が取得されていた。T-02 が resume-fallback 境界でリセットしないことで新たに導入された regression。

**影響シナリオ**:  
fixer step（spec-fixer / code-fixer / build-fixer）+ resume failure（セッション失効等）+ 新セッションで report 後にハング + postWorkPrompts 設定済み（rules follow-up）

この組み合わせは稀だが実在する（resume 失敗はセッション失効で発生し、新 feature の grace は report 後のハングで発火する）。postWork が誤セッションで実行されると rules follow-up 結果が不正確になる。

---

### Finding 2 — MEDIUM: D5 outer catch のスコープが follow-up フェーズも包含するため `followUpAttempts` / `addedTurns` が不正確になる

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: ~1213（D5 catch 分岐）

**不変条件の定義**:  
`AgentRunResult` の doc comment が宣言する: "Invariant: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`"。さらに暗黙の前提として、`followUpAttempts` は実際に消費した follow-up ターン数を表す。

**破れ方**:

outer catch は main work turn + report retry + postWork + output repair の全フェーズをカバーする。`capturedToolResult !== null` の条件は main work turn での受領に限らず、follow-up フェーズ中の abort でも成立する。

D5 path は `followUpAttempts: 0`, `addedTurns: ADDED_TURNS_ZERO` を固定で返すが、abort が postWork 中に発火した場合はすでに `postWork++` が実行済みである。

- 数値の invariant 自体（`reportRetry + outputRepair === followUpAttempts`）は D5 path でも成立（両辺 0）
- ただし「実際に消費したターン数」の意味論的不変条件が破れる
- usage telemetry / state 記録で follow-up 消費コストが過少申告される

**設計意図との乖離**:  
D5 の設計意図（design.md D5）は「grace 完了より前に hard abort が発火するレア race」の二重防御。follow-up フェーズ中の abort を D5 で捕捉することは設計に明示されていない。

---

### Finding 3 — LOW: D5 path が `touchedFiles` を省略する

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: ~1217–1227（D5 return object）

**不変条件の定義**:  
ClaudeCodeRunner の `run()` は `touchedFiles` を返し、CommitOrchestrator が state.touchedFiles に記録する。`undefined` の場合「このランタイムは touched files を記録しない」と解釈され、エントリが作成されない。

**破れ方**:

D5 path の return object に `touchedFiles` が含まれていない。main work turn で assistant messages を収集した `touchedFileMessages` は populate されている可能性があるが、D5 path では `extractTouchedFilesFromMessages` が呼ばれず廃棄される。

**緩和要因**:  
既存の timeout path（`completionReason: "timeout"`）も `touchedFiles` を省略するため、D5 が追加する regression の絶対量は小さい。D3 grace-exit（happy path）では `touchedFiles` は正しく伝播される。

---

### Finding 4 — LOW: D5 path が `sessionLogWriter.writeSummary()` を省略する

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: ~1216（D5: `sessionLogWriter?.close()` のみ呼ぶ）/ ~1152–1158（happy path: writeSummary → close）

**不変条件の定義**:  
セッションログが有効（`logPath` 設定済み）の場合、`sessionLogWriter` は `writeSummary` で session メタデータ（sessionId, model, modelUsage）を記録してから `close` する。

**破れ方**:

D5 path は `sessionLogWriter?.close()` を直接呼ぶが、その前に `writeSummary` を呼ばない。session ログにサマリー行が欠落する。

**緩和要因**:  
timeout path も同様に `writeSummary` なしで `close` するため、D5 の追加 regression は小さい。デバッグログの欠落であり機能的影響はない。

---

## Evidence Summary

| Finding | 変更前コードの前提 | 変更後の挙動 | 経路条件 |
|---------|-------------------|-------------|---------|
| 1 | `extractedSessionId` は success result から取得、resume-fallback では call 2 の result が正しいものに上書き | T-02 が early capture し `if (!extractedSessionId)` guard で call 2 の id を無視 | fixer + resume failure + grace exit + postWork |
| 2 | outer catch は main work turn の失敗のみを処理（follow-up は別経路） | follow-up 中の abort も D5 に落ちる | abort during postWork/outputRepair |
| 3 | timeout path が touchedFiles を省略する（pre-existing） | D5 も同様に省略 | D5 発火時 |
| 4 | timeout path が writeSummary を省略する（pre-existing） | D5 も同様に省略 | D5 発火時 + sessionLogWriter 有効 |

## Evidence

- `agent-runner.ts` 差分を全行精読（T-02/T-03/T-04/T-05 の実装確認）
- `AgentRunResult` ポート定義（`src/core/port/agent-runner.ts`）確認
- `step-completion.ts` で reportTool ステップの verdict が `toolResult` から導出されることを確認（D5 の `resultContent: null` が安全である根拠）
- `shouldRunFollowUp` / `mergeFollowUpResult`（`src/adapter/shared/follow-up.ts`）確認
- `step-context-builder.ts` で fixer ステップが `postWorkPrompts`（rulesPrompts）を受け取る経路を確認
- `runMainWorkTurn` の resume-fallback 経路（~line 838）を追跡し `extractedSessionId` が reset されないことを確認
- テストファイル（`agent-runner-report-settles.test.ts`）全体確認：TC-001〜TC-007 すべて resume-fallback シナリオを含まない
