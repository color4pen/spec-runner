# Design: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

## Context

claude-code adapter (`src/adapter/claude-code/agent-runner.ts`) の agent step は、SDK
message generator の終了を唯一の完了契機としている。

- `report_result` MCP tool の handler は、valid な報告を閉包変数 `capturedToolResult`
  に格納するだけで、main の `for await` loop を抜ける契機にはならない
  (`agent-runner.ts:564,579-585` handler / `:677-707` loop に break 条件なし)。loop は
  generator の終了 (= agent session プロセスの exit) でのみ終わる。
- agent が `report_result` を呼んで完了を宣言済みでも、session に background task
  (harness が tool timeout した foreground コマンドを自動降格したものを含む) が残ると
  プロセスは exit できず generator が閉じない。900 秒の inactivity watchdog
  (`inactivity-watchdog.ts:12` `DEFAULT_INACTIVITY_TIMEOUT_MS`) が発火して
  `abortController.abort()` を呼ぶ。
- watchdog abort の catch 経路 (`agent-runner.ts:1136-1154`) は
  `completionReason: "timeout"` かつ `toolResult: null` を返し、閉包に生きている
  **受領済みの成功 report を破棄して STEP_TIMEOUT で halt する** (issue #1003)。
- `extractedSessionId` / `modelUsage` / `invocationMetrics` は最終 success result
  (`SDKResultSuccess`) からのみ抽出される (`:904-921`)。generator が閉じないと一切
  取れないため、grace 後 abort では postWork prompts (rules follow-up, `:955-967`) の
  `resume: extractedSessionId` も成立しない。

これは「agent が tool 呼び出しで完了を能動的に宣言する」という report_result 導入時の
設計、および「adapter は toolResult という事実を返し executor が ok を解釈する」という
既存の verdict 契約と逆転している。上流 (Claude Code / Agent SDK) には background task が
session を塞ぐ問題の確実な解決手段が無く、adapter 側で report 受領を契機に完了を昇格させる
のが唯一確実な防御である。

**確定している前提 (実測):**

- session の実体は transcript (`~/.claude/projects/.../<session-id>.jsonl`) であり、
  プロセス kill で失われない。abort teardown は子プロセス (残存 background task を含む) を
  道連れにする (hang した `bun test` のゾンビ残存ゼロ)。
- session 初期化時に送られる `SDKSystemMessage` (init) は `session_id` を持つ。これが最初に
  到着する SDK message であり、最終 result を待つことなく sessionId を判明させられる
  (`SDKUserMessage.session_id` は optional であり全 message が持つとは限らない)。
- executor の verdict 導出 (`src/core/step/step-completion.ts:166-234`) は、reportTool を
  持つ step では `toolResult` から排他的に verdict を導出する。`resultContent` は reportTool
  を持たない step (prose-parse path) でしか使われない。report ok の解釈は executor の責務で、
  本変更では触らない。

## Goals / Non-Goals

**Goals**:

- main work turn 中に valid な `report_result` を受領したら、それを step 完了の主契機に
  する。ok:true / ok:false を問わず受領時点で step の semantic result を確定する。
- 受領後に短い固定 grace だけ generator の自然終了を待ち、閉じれば従来どおり最終 result から
  usage / metrics を回収する。閉じなければ main work turn だけを abort し、受領済み
  `capturedToolResult` で success として settle する。
- sessionId を最終 result より前に確保し、grace 後 abort 経路でも postWork prompts
  (rules follow-up) が `resume: sessionId` で走るようにする。
- watchdog / step-timeout の abort catch 経路が、受領済み report を破棄しないようにする。
- report 不在時の fallback (report retry follow-up → error、watchdog → STEP_TIMEOUT halt) を
  一切変えない。

**Non-Goals** (スコープ外):

- rules の配送方式 (follow-up / prompt 注入) の変更。
- `bun test` の repo レベル封鎖 (bunfig.toml)。
- `@anthropic-ai/claude-agent-sdk` の update。
- inactivity watchdog の閾値・機構自体の変更 (report 受領で watchdog を bump しない)。
- executor 側の verdict 解釈・routing の変更 (`completionReason` に新値を足さない)。
- codex adapter の変更 (report が finalResponse そのもので、session 居残り構造が存在しないため
  この欠陥がない)。

## Decisions

### D1: report 受領を主契機化し、handler 起点の固定 grace timer で main work turn を settle する

report_result MCP handler が valid な報告で `capturedToolResult` を設定した瞬間に、固定長の
grace timer を起動する。grace 内に generator が自然終了すれば従来の happy path をそのまま
通す。grace 経過時は main work turn の generator を abort して抜ける。

- **Rationale**: report 受領こそが agent work turn の意味的完了である。grace の起点を
  handler (受領の瞬間) に置くことで、「受領後に別の SDK message が到着するか」に依存せず
  grace を確実に開始できる。
- **Alternatives considered**:
  - loop body で `capturedToolResult` が非 null に転じたのを検知して grace を張る案 —
    受領後に必ず後続 message が届くことに依存する。session が受領直後に無音化する
    (まさに本件の failure mode) と loop body が再評価されず grace が張れない。却下。
  - `iterator.next()` を grace deadline と race させて loop を手動化する案 — 記述量が増え、
    かつ subprocess (ゾンビ) を確実に回収するには結局 abort が要る。却下。

### D2: main work turn 専用 AbortController を導入し、shared controller と分離する

main work turn の SDK query には、run() scope の shared `abortController` とは別の専用
`AbortController` を渡す。shared → main の一方向伝播 (shared が abort したら main も abort) を
listener で張る。grace timer は main 専用 controller のみを abort する。

- **Rationale**: grace 経過時に main work turn の subprocess を kill して残存 background task
  (ゾンビ) を回収する必要がある一方、その後 postWork prompts (rules follow-up) は shared
  controller 上で走る (`:955-967` が `...queryOptions` を spread し shared を継承する)。grace で
  shared を abort すると postWork の `throwIfAborted` が即 throw し follow-up が成立しない。
  main だけを独立に kill できれば、postWork / watchdog / step-timeout / SIGTERM はすべて shared
  のまま無改変で残せる。
- **Alternatives considered**:
  - grace で shared を abort し、postWork には別 controller を新規に配線する案 — postWork /
    output-repair / hub 登録 / watchdog すべてを付け替える必要があり、影響面が広い。main だけを
    分離する方が最小差分。却下。
  - abort せず `iterator.return()` / GC に任せる案 — subprocess (残存 background task) が回収
    されず、本件の failure mode をそのまま残す。実測で abort teardown のみがゾンビを回収する。却下。

### D3: grace 経過による main work turn 終了は「正常 return」として下流 happy path に合流させる

grace timer による main-controller abort で generator が throw したら、runQuery 内でそれを
捕捉し、収集済み `lastResult` を付けて **正常 return** する (throw を外へ伝播させない)。以降は
既存 happy path をそのまま通る:usage 抽出 (lastResult が無ければ欠損許容) → report retry は
`capturedToolResult` 非 null によりスキップ → postWork prompts → result file read →
`completionReason: "success"` で settle。

- **Rationale**: grace 経路を happy path に合流させると、postWork prompts / result file read /
  settle をすべて再利用でき、catch 内に複製しなくて済む。report retry のスキップも
  `capturedToolResult` 非 null という既存条件で自然に成立する。
- **Alternatives considered**: grace 後の settle を catch 内で完結させる案 — result file read と
  postWork を catch 内に複製する必要があり重複が増える。却下。

### D4: sessionId を最終 success result より前に確保する

main work turn の loop で、`session_id` を持つ最初の SDK message から `extractedSessionId` を
確保する。最終 success result での代入 (`:919`) は「未取得時のみ埋める」形にして、
早期確保値を undefined で上書きしないようにする。

- **Rationale**: grace 後 abort 経路には最終 success result が無いため、そこから sessionId を
  取れない。session 初期化時の `SDKSystemMessage` (init) が `session_id` を持ち、最初に到着する
  message であるため init で確保でき、postWork prompts の `resume: sessionId` が grace 経路でも
  成立する。resume 時に replay される message の session_id は継続中の同一 session の id であり、
  早期確保して問題ない。
- **Alternatives considered**: abort した subprocess から後追いで sessionId を得る案 — 取得手段が
  ない。却下。

### D5: abort catch 経路は受領済み report を破棄せず success として返す

watchdog / step-timeout / SIGTERM の abort catch 経路 (`:1136-`) に、timeout 判定より前段で
「`abortController.signal.aborted` かつ `capturedToolResult` 非 null なら success + 受領済み
toolResult で返す」分岐を足す。`toolResult: null` での上書きを廃す。usage / metrics は
best-effort (取れていれば付ける、無ければ欠損)。

- **Rationale**: 主契機 (D1 grace) が扱えない稀な race — report 受領後、grace 完了前に hard な
  abort (step wall-clock timeout / watchdog / SIGTERM) が発火するケース — の二重防御。受領済み
  report の保全が不変条件で、usage は欠損許容。`completionReason` を "success" のままにすることで
  executor から見た契約 (success + toolResult) が不変になり、executor 側の変更が不要になる。
- **Alternatives considered**: `completionReason` に新値 (例 "settled-by-report") を足す案 —
  executor の routing 変更を誘発する。architect 判断により却下、success を維持する。

### D6: grace は固定 60 秒、設定化しない

grace 長は module scope の固定定数とし、config 化しない。

- **Rationale**: 調整需要が観測されてから開放する (YAGNI)。60 秒は report 受領後の待ちであり、
  コマンド実行時間 (`bun run test` 実測 59 秒) とは競合しない (report 後の待機で、コマンド実行と
  同時進行しない)。即 abort ではなく grace を挟むのは、正常系 (generator が report 直後に閉じる
  大多数) の usage / cost 実測を保つため。
- **Alternatives considered**: config field 化 / 即 abort。前者は YAGNI、後者は正常系の usage 欠損を
  招くため却下。

### D7: watchdog は report 受領で bump しない

report 受領は watchdog を bump しない。grace は watchdog と独立した専用 timer で扱う。

- **Rationale**: report 受領は「完了」であって「活動」ではない。watchdog の意味論 (無活動検知) を
  汚さず、完了契機は別機構で表現する。

## Risks / Trade-offs

- **[Risk] grace timer と generator 自然終了の二重発火** → Mitigation: grace-exit の判定は
  runQuery-local な一度きりの flag で行い、runQuery の `finally` で grace timer を必ず clear する。
  自然終了が先なら timer は未発火のまま clear される。
- **[Risk] shared → main への abort 伝播 listener の leak** → Mitigation: listener は `{ once: true }`
  で登録し、runQuery の `finally` で明示的に removeEventListener する。runQuery 呼び出しは逐次
  (resume fallback も直列) のため同時に複数 listener は生きない。
- **[Risk] D5 catch 経路の success settle が `resultContent` を欠く** → Mitigation: reportTool を
  持つ step の verdict は `toolResult` から導出され `resultContent` に依存しない
  (executor `deriveStepCompletion` で確認済)。主契機の grace 経路は happy path 経由で
  `resultContent` を保持する。catch 経路は稀な hard-abort race 限定で、report 保全を優先する。
- **[Risk] main work turn の controller 差し替えによる既存 timeout テストの回帰** → Mitigation:
  watchdog / step-timeout は従来どおり shared を abort し、shared → main 伝播で main の hang は従来と
  同様に解ける。`capturedToolResult === null` の場合は D5 分岐を通らず既存 timeout 経路に落ちる。
  既存 timeout テスト (`agent-runner-timeout-last-tool.test.ts`) は無改変で green を維持する。
- **[Trade-off] grace 後 abort では usage / metrics が欠損する** → 受容。要件で明示された欠損許容。
  正常系 (grace 内自然終了) では従来どおり回収される。

## Open Questions

なし。abort teardown による background task (孫プロセス) 回収は `bun test` ケースで実測済み。
他コマンドでの回収確実性は SDK / OS の abort 挙動に依存する既知の天井であり、本変更の
スコープ (report 保全) を超えない。

<!-- spec-fixer-deferred: [LOW] TC-005: D5 catch path に到達するテスト構成が未記述 test-cases.md は spec-fixer の書き込み許可対象外 (許可: design.md / spec.md / tasks.md のみ)。テスト実装者向けの補足: REPORT_SETTLE_GRACE_MS (60s) < DEFAULT_INACTIVITY_TIMEOUT_MS (900s) のため単純な timer 前進では grace (D3) が先に発火する。D5 catch 経路に到達するには shared abortController.abort() をテスト側から直接呼ぶか、step wall-clock timeout を grace 未満に設定して先に発火させること。 -->
