# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証（9 箇所）

| アサーション | 検証結果 |
|---|---|
| `agent-runner.ts:531-534` — `resolvedConfig.timeoutMs !== null` チェック + AbortController タイマー | ✅ 正確（`let timeoutId: ReturnType<typeof setTimeout> \| undefined;` → `if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0)` の構造） |
| `agent-runner.ts:1099-1111` — catch ブロック timeout 検出 + `completionReason: "timeout"` | ✅ 正確（`if (abortController.signal.aborted && timeoutId !== undefined)` → `completionReason: "timeout"` return） |
| `step-config.ts:10` — timeoutMs 最終 fallback は null | ✅ 正確（コメント "6. SDK default (maxTurns undefined = unlimited, timeoutMs = null)"） |
| `executor.ts:367` — `completionReason === "timeout"` → `makeTimeoutHalt` → awaiting-resume | ✅ 正確（`if (runResult.completionReason === "timeout") { const halt = makeTimeoutHalt(...)` at exactly L367） |
| `agent-runner.ts:651` — main message loop `for await` | ✅ 正確（`for await (const message of messages as AsyncGenerator<SDKMessage, void>)` at L651） |
| `agent-runner.ts:772` — follow-up loop `for await` | ✅ 正確（`for await (const message of messages as AsyncGenerator<SDKMessage, void>)` at L772） |
| `agent-runner.ts:1008` — repair loop `for await` | ✅ 正確（`for await (const message of repairMessages as AsyncGenerator<SDKMessage, void>)` at L1008） |
| `codex/agent-runner.ts:329-332` — AbortController + timeoutMs タイマー | ✅ 正確（同型のパターン、同一行番号） |
| `codex/agent-runner.ts:398` — events loop `for await` | ✅ 正確（`for await (const ev of events)` at L398） |

### Step 2: step 定義の timeoutMs 設定

`src/core/step/*.ts` を grep で全件確認。timeoutMs を設定している箇所は **0 件**。request の主張「step 定義のどこにも timeoutMs を設定する箇所は存在しない(grep 0 件)」は正確。

### Step 3: makeTimeoutHalt の出力確認

`src/core/step/step-halt.ts:119` — `makeTimeoutHalt` は `kind: "awaiting-resume"` + `interruption: { type: "interruption", reason: "timeout" }` を返す。既存の timeout 経路合流設計は正しく動作する。

### Step 4: 既存 timeout テストの確認

`tests/unit/adapter/claude-code/agent-runner.test.ts` に TC-032〜TC-035 の wall-clock timeout テスト群が存在する。新しい無活動タイマー（15 分定数）はこれらのテストの壁時計速度（50ms/100ms）に対して無影響。既存テスト green 維持は実現可能。

### Step 5: catch ブロックの abort 判定条件確認

claude-code および codex adapter の catch ブロックはいずれも:
```typescript
if (abortController.signal.aborted && timeoutId !== undefined)
```
という条件で timeout を検出する。`timeoutId` は wall-clock timeout（`resolvedConfig.timeoutMs`）のタイマー ID。timeoutMs が null（既定）の場合 `timeoutId === undefined` になる。

無活動タイマーが abort したとき `timeoutId` が undefined だと、この条件が偽になり `completionReason: "error"` に落ちる。implementer はこの条件を `|| inactivityTimerId !== undefined` 等で拡張する必要がある。request は受け入れ基準（"completionReason: 'timeout' を返す"）でこの挙動をテストで固定しており、テストが catch する。

### Step 6: query-one-shot.ts の適用外確認

`src/adapter/claude-code/query-one-shot.ts` も AbortController + timeoutMs パターンを持つが、コメントに "AgentRunner と直交する（pipeline step lifecycle 外）" と明記されており、issue-fidelity-comparator にのみ使用される。request がスコープ外とした扱いは適切。

## 検証できなかった項目

None

## Findings 詳細

None（重大な問題なし）

---

実装時の注意として記録する観点（ブロッカーではない）:

- **abort 判定条件** — catch ブロックの `timeoutId !== undefined` 条件は wall-clock timer 前提。無活動タイマー専用の追跡変数（`inactivityTimerId`）を加えて条件を拡張しないと、timeoutMs=null（既定）環境で inactivity abort が `completionReason: "error"` に落ちる。受け入れ基準のテストで検出される。
- **halt メッセージへの elapsed 埋め込み** — `makeTimeoutHalt` は `runResult.error.message` をそのまま使う。無活動経過時間を含めるには、abort 前に `closureError` を作って catch ブロックで参照するか、abort reason 経由で error を渡す設計が必要。テストで固定要求されているため実装で解決が必要。
