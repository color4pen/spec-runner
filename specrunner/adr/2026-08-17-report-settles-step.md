# ADR: agent step 完了契機を report 受領主・プロセス終了 fallback の二重系にする

- **Date**: 2026-08-17
- **Status**: Accepted
- **Slug**: report-settles-step

## Context

[2026-05-28-tool-driven-step-completion](./2026-05-28-tool-driven-step-completion.md) により、
agent step の完了判定は `report_result` custom tool の呼び出しに移行した。しかし claude-code
adapter の実装では、完了の「主契機」はあくまで **SDK message generator の終了
（= agent session プロセスの exit）** であり、`report_result` の受領自体はループを抜ける
条件になっていなかった。

- `report_result` MCP tool handler は受領内容を閉包変数 `capturedToolResult` に格納するだけで、
  main の `for await` loop を抜ける条件にはならない。loop は generator が終了するまで回り続ける。
- agent が `report_result` を呼んで完了を宣言済みでも、session に background task（harness が
  tool timeout した foreground コマンドを自動降格したものを含む）が残るとプロセスは exit できず
  generator が閉じない。
- 900 秒の inactivity watchdog が発火すると `abortController.abort()` が呼ばれ、catch 経路が
  `completionReason: "timeout"` かつ `toolResult: null` を返す。閉包に生きている受領済みの
  成功 report が破棄されて STEP_TIMEOUT で halt する（issue #1003。同一 job で 4 attempt 連続、
  うち少なくとも 1 attempt は `report_result {ok: true}` 受領済みの完了状態を破棄した実測）。
- `extractedSessionId` / `modelUsage` / `invocationMetrics` は最終 success result
  （`SDKResultSuccess`）からのみ抽出されるため、generator が閉じないと一切取れず、grace 後
  abort では postWork prompts（rules follow-up）の `resume: sessionId` も成立しない。

これは「agent が tool 呼び出しで完了を能動的に宣言する」という report_result 導入時の設計と
逆転している。上流（Claude Code / Agent SDK）には background task が session を塞ぐ問題の
確実な解決手段が無く、adapter 側で report 受領を契機に完了を昇格させるのが唯一確実な防御である。

**確定している前提（実測）:**

- session の実体は transcript（`~/.claude/projects/.../<session-id>.jsonl`）であり、プロセス kill
  で失われない。abort teardown は子プロセス（残存 background task を含む）を道連れにする（hang
  した `bun test` のゾンビ残存ゼロ）。
- session 初期化時に送られる `SDKSystemMessage`（init）は `session_id` を持ち、最初に到着する
  SDK message である。これにより最終 result を待たずに sessionId を確保できる。
- executor の verdict 導出（`src/core/step/step-completion.ts`）は reportTool を持つ step では
  `toolResult` から排他的に verdict を導出する。`resultContent` は reportTool を持たない step
  でしか使われない。

## 決定

### D1: report 受領を主契機化し、handler 起点の固定 grace timer で main work turn を settle する

`report_result` MCP handler が valid な報告で `capturedToolResult` を設定した瞬間に、固定長の
grace timer を起動する。grace 内に generator が自然終了すれば従来の happy path をそのまま通す。
grace 経過時は main work turn の generator を abort して抜け、受領済み `capturedToolResult` で
`completionReason: "success"` として settle する。

**Why**: report 受領こそが agent work turn の意味的完了である。grace の起点を handler（受領の瞬間）
に置くことで、受領後に別の SDK message が到着するかに依存せず grace を確実に開始できる。

**Rejected**:
- loop body で `capturedToolResult` が非 null に転じたのを検知して grace を張る案 — 受領後に
  session が無音化する（本件の failure mode）と loop body が再評価されず grace が張れない。
- `iterator.next()` を grace deadline と race させて loop を手動化する案 — 記述量が増え、
  subprocess 回収には結局 abort が要る。

### D2: main work turn 専用 AbortController を導入し、shared controller と分離する

main work turn の SDK query に渡す `AbortController`（mainQueryAbort）を、run() scope の shared
`abortController` とは別に生成する。shared → main の一方向伝播を `{ once: true }` listener で
張る。grace timer は mainQueryAbort のみを abort する。postWork prompts / output-repair turn は
`queryOptions` を spread して shared を継承したまま変更しない。

**Why**: grace 経過時に main work turn の subprocess を kill して残存 background task（ゾンビ）を
回収する必要がある一方、その後 postWork prompts は shared controller 上で走る。grace で shared を
abort すると postWork の `throwIfAborted` が即 throw し follow-up が成立しない。main だけを独立に
kill できれば、postWork / watchdog / step-timeout / SIGTERM はすべて shared のまま無改変で残せる。

**Rejected**:
- grace で shared を abort し、postWork には別 controller を新規に配線する案 — postWork /
  output-repair / hub 登録 / watchdog すべてを付け替える必要があり影響面が広い。

### D3: grace 経過による main work turn 終了は「正常 return」として下流 happy path に合流させる

grace timer による mainQueryAbort abort で generator が throw したら、runQuery 内でそれを捕捉し、
収集済み `lastResult` を付けて**正常 return**する（throw を外へ伝播させない）。以降は既存の happy
path をそのまま通る: usage 抽出（lastResult が無ければ欠損許容）→ report retry は
`capturedToolResult` 非 null によりスキップ → postWork prompts → result file read →
`completionReason: "success"` で settle。

**Why**: grace 経路を happy path に合流させると postWork / result file read / settle をすべて再利用
でき、catch 内に複製しなくて済む。report retry スキップも既存条件で自然に成立する。

**Rejected**:
- grace 後の settle を catch 内で完結させる案 — result file read と postWork を catch 内に
  複製する必要があり重複が増える。

### D4: sessionId を最終 success result より前に確保する

main work turn の `for await` ループで、`session_id` を持つ最初の SDK message から
`extractedSessionId` を確保する。最終 success result での代入は「未取得時のみ埋める」形
（`successResult.session_id ?? extractedSessionId`）にして早期確保値を上書きしない。

**Why**: grace 後 abort 経路には最終 success result が無いため sessionId を取れない。session
初期化時の `SDKSystemMessage`（init）が `session_id` を持ち最初に到着するため、これで確保でき
postWork prompts の `resume: sessionId` が grace 経路でも成立する。

### D5: abort catch 経路は受領済み report を破棄せず success として返す

watchdog / step-timeout / SIGTERM の abort catch 経路（outer catch）に、timeout 判定より前段で
「`abortController.signal.aborted` かつ `capturedToolResult !== null`」の場合の分岐を追加する。
この分岐は `completionReason: "success"`・受領済み `toolResult`・usage / metrics は best-effort
（取れていれば付与、無ければ欠損）で返す。

主契機（D1 grace）が扱えない稀な race（report 受領後、grace 完了前に hard な abort が発火する
ケース）の二重防御。`completionReason` を "success" のままにすることで、executor から見た契約
（success + toolResult）が不変になり executor 側の変更が不要になる。

**Rejected**:
- `completionReason` に新値（例 "settled-by-report"）を足す案 — executor の routing 変更を誘発する。
  D3（tool-driven-step-completion ADR）の「技術的 3 値維持」原則に反する。

### D6: grace は固定 60 秒、設定化しない

`REPORT_SETTLE_GRACE_MS = 60_000` を module scope の定数として定義し、config 化しない（YAGNI）。
60 秒は report 受領後の待ちであり、コマンド実行時間（`bun run test` 実測 59 秒）とは競合しない
（report 受領後の待機で、コマンド実行と同時進行しない）。即 abort でなく grace を挟む理由は、
正常系（generator が report 直後に閉じる大多数のケース）の usage / cost 実測を保つためである。

**Rejected**:
- 即 abort — 正常系の usage 欠損を招く。
- config field 化 — 調整需要が観測されてから開放する。

### D7: watchdog は report 受領で bump しない

report 受領は watchdog（inactivity 検知）を bump しない。grace は watchdog と独立した専用 timer で
扱う。report 受領は「完了」であって「活動」ではなく、watchdog の意味論（無活動検知）を汚さない。

## Alternatives Considered

### Alternative 1: watchdog を report 受領で bump して timeout を延長する

- **Pros**: 既存機構（inactivity-watchdog）だけで対応できる。コードの追加が最小。
- **Cons**: watchdog の意味論（無活動検知）が汚れる。report 受領は「完了」であって「活動」ではない。
  bump しても background task が居座り続ければ結局 timeout し、問題の根本解決にならない。
- **Why not**: 意味論の歪みに対して効果が不十分。grace は watchdog と独立した専用 timer とする
  （D7）。

### Alternative 2: report 受領後 grace なしで即 abort する

- **Pros**: コードが短い。grace timer の状態管理が不要。
- **Cons**: 正常系（generator が report 直後に閉じる大多数のケース）の `modelUsage` /
  `invocationMetrics` が常に欠損する。cost 実測の可視性が失われる。
- **Why not**: 正常系のコスト可視性を失う代償が大きく、採用しない（D6）。

### Alternative 3: loop body で capturedToolResult 監視して grace を張る

- **Pros**: abort よりも軽量な完了契機として機能しうる。
- **Cons**: 受領後に session が無音化すると（本件の failure mode）、loop body が再評価されず
  grace が張れない。受領の瞬間に handler から直接 arm する D1 の方が確実。
- **Why not**: 本件の failure mode（report 後に session が無音化）を解決できない（D1）。

### Alternative 4: abort せず iterator.return() / GC に任せる

- **Pros**: abort 呼び出しが不要。コード追加ゼロ。
- **Cons**: subprocess（残存 background task）が回収されず、本件の failure mode をそのまま残す。
  実測では abort teardown のみがゾンビを回収する（hang した `bun test` のゾンビ残存ゼロ）。
- **Why not**: subprocess 回収のために abort が必須である（D2）。

### Alternative 5: grace 後 settle を catch 内で完結させる

- **Pros**: 正常 return を catch 外に出さず、制御フローが単純に見える。
- **Cons**: result file read と postWork prompts を catch 内に複製する必要があり、重複が増える。
  既存の happy path（report retry スキップ条件を含む）を再利用できない。
- **Why not**: happy path 再利用が最小差分であり、複製は保守コストを増やすだけ（D3）。

### Alternative 6: completionReason に新値（"settled-by-report" 等）を追加する

- **Pros**: 完了の根拠が呼び出し元から識別できる。
- **Cons**: executor の routing 変更を誘発する。[2026-05-28-tool-driven-step-completion](./2026-05-28-tool-driven-step-completion.md) D3「completionReason は技術的 3 値維持」に反する。adapter が business semantic を運搬することになり層が混入する。
- **Why not**: executor 側の変更が不要になる "success" のままが最小差分。architect 判断により
  却下（D5）。

## リスクと受容判断

**[Risk] grace timer と generator 自然終了の二重発火**

→ grace-exit の判定は runQuery-local な一度きりの `settledByReport` flag で行い、`finally` で
grace timer を必ず clear する。自然終了が先なら timer は未発火のまま clear される。

**[Risk] shared → main への abort 伝播 listener の leak**

→ listener は `{ once: true }` で登録し、runQuery の `finally` で明示的に `removeEventListener`
する。runQuery 呼び出しは逐次（resume fallback も直列）のため同時に複数 listener は生きない。

**[Risk] D5 catch 経路の success settle が `resultContent` を欠く**

→ reportTool を持つ step の verdict は `toolResult` から導出され `resultContent` に依存しない
（executor `deriveStepCompletion` で確認済み）。D5 catch 経路は稀な hard-abort race 限定で、
report 保全を優先する。

**[Risk] main work turn の controller 差し替えによる既存 timeout テストの回帰**

→ watchdog / step-timeout は従来どおり shared を abort し、shared → main 伝播で main の hang も
止まる。`capturedToolResult === null` の場合は D5 分岐を通らず既存 timeout 経路に落ちる。
既存テスト（`agent-runner-timeout-last-tool.test.ts`）は無改変で green を維持する。

**[Trade-off] grace 後 abort では usage / metrics が欠損する**

→ 受容。要件で明示された欠損許容。正常系（grace 内自然終了）では従来どおり回収される。

## Consequences

### Positive

- report 受領済みの成功 report が watchdog / step-timeout で破棄されるケース（issue #1003）が
  解消される。
- abort catch 経路（D5）が二重防御として機能し、grace より前に hard abort が発火した稀な
  race でも report を保全する。
- sessionId の早期確保により、grace 後 abort 経路でも postWork prompts（rules follow-up）が
  正常に走る。
- executor / 遷移テーブルから見た契約（`completionReason: "success"` + `toolResult`）は不変であり、
  executor 側の変更が不要。

### Negative

- grace 後 abort 経路では `modelUsage` / `invocationMetrics` が欠損する（欠損許容として受容済み）。
- AbortController の二層構造（shared + mainQueryAbort）により、abort 経路の追跡がやや複雑になる。
  `ponytail:` コメントで天井と upgrade path を明記している。

### Known Debt

- D5 catch 経路に到達するテストは step wall-clock timeout を `REPORT_SETTLE_GRACE_MS` より小さく
  設定する方法（`config.steps.implementer.timeoutMs = 5000`）で実現しており、専用の low-level
  ハーネスは未整備。
- background task（孫プロセス）の回収確実性は SDK / OS の abort 挙動に依存する既知の天井であり、
  本変更のスコープ（report 保全）を超えない。

## Files Changed

| File | Change |
|------|--------|
| `src/adapter/claude-code/agent-runner.ts` | `REPORT_SETTLE_GRACE_MS` 定数追加、`mainQueryAbort` 分離、sessionId 早期確保、`armReportGrace` grace timer 機構、D5 catch 分岐追加 |
| `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts` | 新規（TC-001〜TC-007 の 7 ケース） |

## 関連 ADR

- [2026-05-28-tool-driven-step-completion](./2026-05-28-tool-driven-step-completion.md) — 本 ADR の
  直接の前提。「adapter は事実（toolResult）のみを返す」「completionReason は技術的 3 値維持」
  「D3: postWorkPrompts ターン中の report_result は無視する」を確定させた。本 ADR はその契約を
  維持しつつ、report 受領を主契機とする二重系を追加する。
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — postWork
  prompts の実行パターン。grace 後 abort 経路でも同パターンが走ることを本 ADR が保証する。
- [2026-05-26-process-lifecycle-keepalive](./2026-05-26-process-lifecycle-keepalive.md) — プロセス
  lifecycle 管理。abort teardown による background task 回収の実測前提と整合する。
