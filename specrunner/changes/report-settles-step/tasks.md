# Tasks: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

全変更は `src/adapter/claude-code/agent-runner.ts` と、その `__tests__/` 配下の新規テストに
閉じる。codex adapter / inactivity-watchdog / executor / port 型は変更しない。

## T-01: grace 定数の定義

- [ ] `src/adapter/claude-code/agent-runner.ts` の module scope に `export const REPORT_SETTLE_GRACE_MS = 60_000;` を追加する (report 受領後に generator の自然終了を待つ固定 grace、60 秒)。
- [ ] JSDoc に「report 受領を契機に開始する grace。generator の自然終了を待つ固定値 (D6: 設定化しない)」旨を記す。

**Acceptance Criteria**:
- `REPORT_SETTLE_GRACE_MS` が export され、値が `60_000` (60 秒) である。
- 新規テストから import して timer 前進に使える。

## T-02: sessionId の早期確保

- [ ] `run()` の main work turn loop (`runQuery` 内 `for await`) で、`extractedSessionId` が未取得のとき、各 SDK message の `session_id` (string かつ非空) から `extractedSessionId` を確保する。
- [ ] 最終 success result での代入 (現 `:919` `extractedSessionId = successResult.session_id`) を、早期確保値を undefined で上書きしない形 (`successResult.session_id ?? extractedSessionId`) に変える。
- [ ] replay message (`isReplay === true`) からの session_id も継続中の同一 session の id であるため、除外しない (早期確保対象に含めてよい)。

**Acceptance Criteria**:
- 最終 success result が到着しなくても、init など先行 SDK message の `session_id` から `extractedSessionId` が設定される。
- 最終 success result が到着した従来経路でも、`extractedSessionId` の値は変わらない (回帰なし)。

## T-03: main work turn 専用 AbortController と shared → main 伝播

- [ ] `runQuery` 内で、main work turn の SDK query 専用の `AbortController` (以下 mainQueryAbort) を生成する。
- [ ] shared `abortController` → mainQueryAbort の一方向伝播を張る:呼び出し時点で shared が既に aborted なら即 mainQueryAbort を abort し、そうでなければ `abortController.signal.addEventListener("abort", …, { once: true })` で伝播 listener を登録する。
- [ ] main work turn の SDK query options を `{ ...queryOptions, abortController: mainQueryAbort }` にして、main だけが専用 controller を使うようにする (postWork `:955-967` / output-repair `:1031-1041` は `queryOptions` を spread し shared を継承したまま、変更しない)。
- [ ] `runQuery` の `finally` で伝播 listener を removeEventListener する (leak 防止)。
- [ ] agent redirect 超過時の `abortController.abort()` (現 `:699`) は shared のまま維持する (伝播で main も止まり、従来どおり error 経路へ)。

**Acceptance Criteria**:
- main work turn の query に渡る `abortController` は shared とは別インスタンスである。
- shared が abort されると main work turn も abort される (watchdog / step-timeout の従来挙動が維持される)。
- postWork prompts / output-repair turn の query options に渡る `abortController` は shared のままである。
- `typecheck && test` が green (既存 timeout テストが無改変で pass)。

## T-04: handler 起点の grace timer と grace-exit の正常 return

- [ ] `run()` scope に grace 起動用の可変参照 (例 `let armReportGrace: (() => void) | null = null;`) を `capturedToolResult` 付近に宣言する。
- [ ] report_result MCP handler (現 `:579-585`) で、`parseResult.ok` により `capturedToolResult` を設定した直後に `armReportGrace?.()` を呼ぶ (受領の瞬間に grace 起動)。
- [ ] `runQuery` 内で `armReportGrace` に「一度だけ grace timer を張る」closure を代入する。grace timer は `REPORT_SETTLE_GRACE_MS` 経過で runQuery-local な `settledByReport` flag を立て mainQueryAbort を abort する。既に timer 済 / settled 済なら no-op。
- [ ] main work turn の `for await` を try で囲み、mainQueryAbort abort 起因の throw を捕捉する。`settledByReport` が真かつ shared が未 abort の場合は、収集済み `lastResult` を付けて **正常 return** する (throw を外へ伝播しない)。それ以外の throw は従来どおり re-throw する。
- [ ] `runQuery` の `finally` で grace timer を clear し、`armReportGrace` を null に戻す。
- [ ] grace-exit 後の下流経路が既存 happy path をそのまま通ることを保証する:report retry は `capturedToolResult` 非 null によりスキップ (現 `:931` 条件)、postWork prompts は `extractedSessionId` (T-02 で早期確保) を使って走る、最終 settle は `completionReason: "success"` + `toolResult: capturedToolResult`。

**Acceptance Criteria**:
- report 受領後 grace 内に generator が閉じなければ、grace 経過で main work turn が abort され、`completionReason: "success"` + 受領済み `toolResult` で settle する。
- report 受領後 grace 内に generator が自然終了すれば、grace timer は未発火で clear され、従来どおり最終 result から `modelUsage` が回収される。
- grace-exit 経路で shared `abortController` は abort されない (postWork が走れる)。
- report 不在時は grace timer が張られず、従来の generator 終了 → report retry → error / watchdog → STEP_TIMEOUT 経路が不変。

## T-05: abort catch 経路での受領済み report の保全 (D5)

- [ ] outer catch (現 `:1134-`) の timeout 判定より前段に、「`abortController.signal.aborted` かつ `capturedToolResult !== null`」の場合の分岐を足す。この分岐は `completionReason: "success"`、`toolResult: capturedToolResult`、`modelUsage`/`sessionId`/`invocationMetrics` は取得済みなら付与 (best-effort) で返す。`toolResult: null` での上書きをしない。
- [ ] 既存 timeout 分岐 (`abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)`) は、`capturedToolResult === null` のときのみ到達する (report 保全分岐を先に評価する)。分岐本体は無改変。
- [ ] `timeoutId` の clearTimeout / sessionLogWriter close 等の後始末は保全分岐でも行う。
- [ ] `completionReason` の型に新値を足さない ("success" を返す)。

**Acceptance Criteria**:
- report 受領後に shared abort (watchdog / step-timeout / SIGTERM) が発火しても、`completionReason: "success"` + 受領済み `toolResult` で返り、report が破棄されない。
- report 不在で watchdog が発火した場合の STEP_TIMEOUT halt (`completionReason: "timeout"`、`toolResult: null`、`error.code === "STEP_TIMEOUT"`) は従来と同一。

## T-06: テスト (受け入れ基準の固定)

新規テストファイル (例 `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`) を追加する。既存の `agent-runner-timeout-last-tool.test.ts` の fake-timer + `hangingQueryFn` の作法、`artifact-bundle-injection.test.ts` の `mockReportTool` / `_createMcpServerFn` 注入の作法を流用する。report の受領は、注入した `_createMcpServerFn` で handler を捕捉し、テスト側 `queryFn` の中でその handler を呼ぶことで再現する (SDK を介さず `capturedToolResult` を設定する)。

- [ ] **TC-A (ok:true grace 後 abort → success)**: reportTool 設定、`queryFn` main turn が session_id を持つ init message を yield → handler を `ok:true` で呼ぶ → 以後 mainQueryAbort まで hang。`REPORT_SETTLE_GRACE_MS` 分 timer を前進。`completionReason === "success"` かつ `toolResult` が受領済み (`ok:true`) であることを固定。
- [ ] **TC-B (ok:false grace 後 abort → success settle)**: 同上を `ok:false` の報告で行い、`completionReason === "success"` かつ `toolResult.ok === false` が executor へ渡る形で返ることを固定。
- [ ] **TC-C (sessionId 早期確保 + grace 後 postWork resume)**: `policy.postWorkPrompts` を 1 件設定。main turn は init message (session_id) → handler → hang。grace 前進後、postWork turn の query options の `resume` が init message の session_id と一致することを固定 (`queryFn` で `params.options.resume` を捕捉)。あわせて `completionReason === "success"`。
- [ ] **TC-D (grace 内自然終了 → usage 回収)**: main turn が init message (session_id) → handler (`ok:true`) → `modelUsage` 付き success result を yield して自然終了 (hang しない)。grace 未満で完了し、`result.modelUsage` が最終 result 由来で回収されることを固定。
- [ ] **TC-E (report 不在 fallback 不変)**: 既存 `agent-runner-timeout-last-tool.test.ts` が無改変で green であることを確認 (report 不在 → watchdog → STEP_TIMEOUT)。加えて必要なら reportTool 設定かつ report 未呼び出しで generator が閉じるケースの report retry → 経路が従来どおりであることを確認。
- [ ] **TC-F (D5 catch 保全)**: report 受領後に watchdog を発火させ (grace より watchdog を先に到達させる構成、または main の hang を shared abort 経由で解く構成)、catch 経路で `completionReason === "success"` + 受領済み `toolResult` が返り timeout にならないことを固定する。

**Acceptance Criteria**:
- TC-A〜TC-F がすべて pass する。
- 既存テスト (特に `agent-runner-timeout-last-tool.test.ts`) が無改変で green。
- `typecheck && test` 全体が green。
