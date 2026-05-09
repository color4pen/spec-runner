# Test Cases: poll-timeout

## TC-040: POLL_TIMEOUT エラーコードと factory

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §1

### TC-040-1: pollTimeoutError factory が正しいエラーを生成する
```
GIVEN errors.ts に POLL_TIMEOUT コードと pollTimeoutError factory が追加されている
WHEN  pollTimeoutError("sess_abc", 900000) を呼び出す
THEN  error.code === "POLL_TIMEOUT"
AND   error.message に "sess_abc" を含む
AND   error.message に "900000" または "900" (ms/s 表記) を含む
AND   error に hint フィールドがあり "specrunner resume" と "specrunner cancel" の両方を含む
```

### TC-040-2: ERROR_CODES に POLL_TIMEOUT が登録されている
```
GIVEN errors.ts を静的解析する
WHEN  ERROR_CODES オブジェクトのキー一覧を確認する
THEN  "POLL_TIMEOUT" キーが存在し、値も "POLL_TIMEOUT" である
AND   "SESSION_TIMEOUT" キーは存在しない
```

---

## TC-041: pollUntilComplete — タイムアウト動作

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §2, 受け入れ基準

### TC-041-1: timeoutMs を超過すると PollTimeoutError を throw する
```
GIVEN pollUntilComplete を呼び出す
AND   timeoutMs: 1 (1ms)
AND   sleepFn は 50ms sleep する
AND   API は常に status: "running" を返す
WHEN  pollUntilComplete が実行される
THEN  PollTimeoutError (code: "POLL_TIMEOUT") を throw する
AND   SESSION_TERMINATED ではなく POLL_TIMEOUT コードである
```

### TC-041-2: timeoutMs 未指定時はタイムアウトしない
```
GIVEN pollUntilComplete を opts なしで呼び出す（timeoutMs 未指定）
AND   API は 1 回目で status: "idle" を返す
AND   sleepFn はすぐに resolve する
WHEN  pollUntilComplete が実行される
THEN  PollTimeoutError を throw しない
AND   正常に結果を返す（status: "idle"）
```

### TC-041-3: deadline はループ開始時に 1 度だけ計算される
```
GIVEN pollUntilComplete を timeoutMs: 5000 で呼び出す
AND   API は最初の 3 回 "running" を返し、4 回目で "idle" を返す
AND   sleepFn はすぐに resolve する（合計経過 < 5000ms）
WHEN  pollUntilComplete が実行される
THEN  タイムアウトせずに正常完了する
AND   deadline チェックは各 sleep 後に行われている
```

### TC-041-4: DEFAULT_POLL_TIMEOUT_MS が 900,000ms として export されている
```
GIVEN completion.ts をインポートする
WHEN  DEFAULT_POLL_TIMEOUT_MS を参照する
THEN  値が 900000 である
```

### TC-041-5: deadline チェックは sleepFn の後かつ API 取得の前に行われる
```
GIVEN timeoutMs: 1 の pollUntilComplete を実行する
AND   sleepFn は 10ms sleep する
WHEN  最初の sleep 後に deadline を超過している
THEN  API retrieve を呼び出さずに PollTimeoutError を throw する
```

---

## TC-042: SessionClient Port — timeoutMs 型定義

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §3

### TC-042-1: port の pollUntilComplete opts に timeoutMs が含まれる
```
GIVEN src/core/port/session-client.ts を読み込む
WHEN  pollUntilComplete の opts 型定義を確認する
THEN  timeoutMs?: number フィールドが存在する
AND   SESSION_TIMEOUT 文字列は含まれない
AND   "Wall-clock timeout has been removed" の旧コメントは存在しない
```

---

## TC-043: SessionClient Adapter — timeoutMs パススルー

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §4

### TC-043-1: AnthropicSessionClient が timeoutMs を inner pollUntilComplete に渡す
```
GIVEN AnthropicSessionClient.pollUntilComplete を timeoutMs: 600000 で呼び出す
AND   inner completion.pollUntilComplete をモックしている
WHEN  メソッドが実行される
THEN  inner pollUntilComplete の opts.timeoutMs === 600000 で呼ばれる
```

### TC-043-2: timeoutMs が undefined の場合も opts に含まれる（undefined パススルー）
```
GIVEN AnthropicSessionClient.pollUntilComplete を timeoutMs 未指定で呼び出す
WHEN  inner pollUntilComplete が呼ばれる
THEN  opts.timeoutMs === undefined が渡される（null 変換されない）
```

---

## TC-044: ManagedAgentRunner — タイムアウト解決と POLL_TIMEOUT ハンドリング

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §5

### TC-044-1: step config の timeoutMs を pollUntilComplete に渡す
```
GIVEN config.steps.implementer.timeoutMs === 1800000 が設定されている
AND   runPollingStyle を implementer ステップで実行する
WHEN  pollUntilComplete が呼び出される
THEN  opts.timeoutMs === 1800000 で呼ばれる
```

### TC-044-2: step config に timeoutMs がない場合は DEFAULT_POLL_TIMEOUT_MS を使用する
```
GIVEN config.steps に timeoutMs が未設定（null）
AND   defaults にも timeoutMs がない
WHEN  runPollingStyle が pollUntilComplete を呼ぶ
THEN  opts.timeoutMs === 900000 (DEFAULT_POLL_TIMEOUT_MS)
```

### TC-044-3: POLL_TIMEOUT 発生時は completionReason: "timeout" を返す
```
GIVEN sessionClient.pollUntilComplete が POLL_TIMEOUT error で終了する
  （status: "terminated", error: { code: "POLL_TIMEOUT" }）
WHEN  runPollingStyle がその結果を受け取る
THEN  { completionReason: "timeout", resultContent: null, sessionId: <id> } を返す
AND   throwWrappedError を呼ばない
```

### TC-044-4: runProposeStyle の polling fallback でも timeoutMs を解決する
```
GIVEN runProposeStyle がポーリング fallback に入る
AND   step config に timeoutMs: 1200000 が設定されている
WHEN  pollUntilComplete が呼ばれる
THEN  opts.timeoutMs === 1200000 で呼ばれる
AND   POLL_TIMEOUT 発生時は completionReason: "timeout" を返す
```

---

## TC-045: StepExecutor — タイムアウト時の awaiting-resume 遷移

**Category**: correctness  
**Priority**: must  
**Source**: tasks.md §6, 受け入れ基準・設計 D3

### TC-045-1: completionReason: "timeout" で awaiting-resume に遷移する
```
GIVEN AgentRunner.run が completionReason: "timeout" を返す
WHEN  StepExecutor.runAgentStep がその結果を処理する
THEN  state.status === "awaiting-resume" に設定される
AND   state.resumePoint.reason が timeout を示す値で設定される
AND   state.error にエラー情報が含まれる
AND   store.persist(state) が呼ばれる
AND   history に "{step}-timeout" エントリが追加される
AND   error に state が付与されて rethrow される（attachStateAndRethrow）
```

### TC-045-2: timeout は failed ではなく awaiting-resume である
```
GIVEN completionReason: "timeout" の StepExecutor 実行
WHEN  rethrow された error を catch する
THEN  error に付与された state.status === "awaiting-resume"
AND   state.status !== "failed"
```

### TC-045-3: completionReason: "error" は従来通り処理される（regression なし）
```
GIVEN AgentRunner.run が completionReason: "error" を返す
WHEN  StepExecutor.runAgentStep が処理する
THEN  "timeout" 分岐に入らない
AND   従来のエラー処理フローが実行される
```

---

## TC-046: remove-session-timeout テストの更新

**Category**: testing  
**Priority**: must  
**Source**: tasks.md §7, 設計 D4

### TC-046-1: TC-008 — completion.ts に SESSION_TIMEOUT が存在しない（維持）
```
GIVEN completion.ts のソース
WHEN  テキストを静的解析する
THEN  "SESSION_TIMEOUT" を含まない
AND   "sessionTimeoutError" を含まない
AND   "elapsed >= timeoutMs" を含まない
```

### TC-046-2: TC-008 — port の timeoutMs アサーションは削除されている
```
GIVEN remove-session-timeout.test.ts の TC-008
WHEN  テスト内容を確認する
THEN  session-client.ts の expect(content).not.toContain("timeoutMs") アサーションが存在しない
  （timeoutMs が port に戻ったため）
```

### TC-046-3: TC-011 — completion.ts の SESSION_TIMEOUT 関連コードが不在（維持）
```
GIVEN completion.ts のソース
WHEN  テキストを静的解析する
THEN  "SESSION_TIMEOUT" を含まない（POLL_TIMEOUT とは別概念）
```

### TC-046-4: TC-011 — PollOptions の timeoutMs 不在アサーションは削除されている
```
GIVEN remove-session-timeout.test.ts の TC-011
WHEN  テスト内容を確認する
THEN  expect(content).not.toContain("timeoutMs") が PollOptions チェックとして存在しない
  （timeoutMs が PollOptions に再追加されたため意図的な変更）
```

---

## TC-047: 既存テストへの regression なし

**Category**: testing  
**Priority**: must  
**Source**: 受け入れ基準

### TC-047-1: bun run typecheck が green
```
GIVEN poll-timeout の全変更が適用された状態
WHEN  bun run typecheck を実行する
THEN  型エラーが 0 件
```

### TC-047-2: bun run test が green
```
GIVEN poll-timeout の全変更が適用された状態
WHEN  bun run test を実行する
THEN  全テストが pass
AND   TC-028, TC-031, TC-034 など既存テストが壊れていない
AND   TC-007, TC-010, TC-012, TC-015 が引き続き pass する
```

### TC-047-3: SESSION_TIMEOUT が completion.ts に混入していない
```
GIVEN src/adapter/managed-agent/completion.ts のソース
WHEN  grep "SESSION_TIMEOUT" completion.ts を実行する
THEN  マッチ 0 件
```

---

## TC-048: デフォルトタイムアウト値の妥当性

**Category**: correctness  
**Priority**: should  
**Source**: design.md D2、request.md 要件3

### TC-048-1: デフォルト 15 分は step config 未設定時のフォールバック
```
GIVEN ManagedAgentRunner が resolvedConfig.timeoutMs === null を取得した
WHEN  pollUntilComplete に渡す timeoutMs を決定する
THEN  timeoutMs === 900000 (15 分) が使われる
AND   null や undefined ではなく数値が渡される
```

### TC-048-2: step config で timeoutMs を上書きできる
```
GIVEN config.steps.defaults.timeoutMs === 1200000 が設定されている
AND   特定のステップに個別 timeoutMs が未設定
WHEN  ManagedAgentRunner が timeoutMs を解決する
THEN  resolvedConfig.timeoutMs === 1200000 が使われる（デフォルトより優先）
```

---

## TC-049: エラーメッセージの品質

**Category**: maintainability  
**Priority**: should  
**Source**: tasks.md §1.2

### TC-049-1: POLL_TIMEOUT エラーに sessionId と経過時間が含まれる
```
GIVEN pollTimeoutError("sess_xyz", 1800000) を呼び出す
WHEN  error.message を確認する
THEN  "sess_xyz" を含む
AND   経過時間（1800000ms または 1800s 等）を含む
AND   メッセージが人間可読である（数字のみでない）
```

### TC-049-2: hint が resume と cancel の両コマンドを案内する
```
GIVEN pollTimeoutError の返り値
WHEN  error.hint を確認する
THEN  "specrunner resume" を含む
AND   "specrunner cancel" を含む
```
