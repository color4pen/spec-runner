# Test Cases: silent-exit-keepalive

Pipeline / process lifecycle binding で silent exit を構造的に消す。

---

## TC-01: KeepAlive — acquire で isActive が true になる

- **Category**: Unit / KeepAlive
- **Priority**: must
- **Source**: Task 1, Design D1

GIVEN KeepAlive インスタンスを生成した  
WHEN `acquire()` を呼ぶ  
THEN `isActive === true`

---

## TC-02: KeepAlive — release で isActive が false になる

- **Category**: Unit / KeepAlive
- **Priority**: must
- **Source**: Task 1, Design D1

GIVEN KeepAlive インスタンスで `acquire()` を呼んだ  
WHEN `release()` を呼ぶ  
THEN `isActive === false`

---

## TC-03: KeepAlive — acquire は idempotent

- **Category**: Unit / KeepAlive
- **Priority**: must
- **Source**: Task 1, Design D1

GIVEN KeepAlive インスタンスで `acquire()` を呼んだ  
WHEN `acquire()` を再度呼ぶ  
THEN `isActive === true` のまま、timer が新たに追加されない（内部 timer は 1 つ）

---

## TC-04: KeepAlive — release は idempotent（二重呼び出しで crash しない）

- **Category**: Unit / KeepAlive
- **Priority**: must
- **Source**: Task 1, Design D1

GIVEN KeepAlive インスタンスで `acquire()` → `release()` を呼んだ  
WHEN `release()` を再度呼ぶ  
THEN error が throw されず `isActive === false` のまま

---

## TC-05: KeepAlive — release 後に acquire で再取得できる

- **Category**: Unit / KeepAlive
- **Priority**: must
- **Source**: Task 1, Design D1

GIVEN KeepAlive インスタンスで `acquire()` → `release()` を呼んだ  
WHEN 再度 `acquire()` を呼ぶ  
THEN `isActive === true`

---

## TC-06: KeepAlive — 初期状態で isActive が false

- **Category**: Unit / KeepAlive
- **Priority**: should
- **Source**: Task 1

GIVEN KeepAlive インスタンスを生成した（acquire 前）  
WHEN `isActive` を参照する  
THEN `false`

---

## TC-07: ExitGuard — running job を awaiting-resume に遷移させる

- **Category**: Unit / ExitGuard
- **Priority**: must
- **Source**: Task 2, Design D3, AC「exit 時 invariant」

GIVEN `status: "running"` の job が `.specrunner/jobs/` に存在する  
WHEN `process` の `beforeExit` イベントが発火する  
THEN 当該 job の `status` が `"awaiting-resume"` に更新され、stderr に `[specrunner] warn: process exiting with running job <jobId>, transitioning to awaiting-resume` が出力される

---

## TC-08: ExitGuard — running job が存在しない場合は何もしない

- **Category**: Unit / ExitGuard
- **Priority**: must
- **Source**: Task 2, Design D3

GIVEN `.specrunner/jobs/` 内に `status: "running"` の job が存在しない  
WHEN `beforeExit` イベントが発火する  
THEN 状態変更なし、stderr への warning 出力なし

---

## TC-09: ExitGuard — handler は一度だけ実行される（fired guard）

- **Category**: Unit / ExitGuard
- **Priority**: must
- **Source**: Task 2, Design D3

GIVEN `registerExitGuard()` を呼んだ  
WHEN `beforeExit` イベントが 2 回発火する  
THEN handler 内のロジックは 1 回目のみ実行される（2 回目は no-op）

---

## TC-10: ExitGuard — I/O エラー発生時に crash しない

- **Category**: Unit / ExitGuard
- **Priority**: must
- **Source**: Task 2, Design D3

GIVEN jobs ディレクトリの読み取りで I/O エラーが起きる状況  
WHEN `beforeExit` イベントが発火する  
THEN handler が error を throw せず process が crash しない

---

## TC-11: DiagnosticLog — `SPECRUNNER_DEBUG` 未設定時に出力なし

- **Category**: Unit / DiagnosticLog
- **Priority**: must
- **Source**: Task 3, Design D5, AC「diagnostic log opt-in」

GIVEN `SPECRUNNER_DEBUG` 環境変数が設定されていない  
WHEN `logPipelineDiag("pipeline:run:entry")` を呼ぶ  
THEN stderr への出力がない

---

## TC-12: DiagnosticLog — `SPECRUNNER_DEBUG=pipeline` 設定時に stderr 出力あり

- **Category**: Unit / DiagnosticLog
- **Priority**: must
- **Source**: Task 3, Design D5, AC「diagnostic log opt-in」

GIVEN `SPECRUNNER_DEBUG=pipeline` が設定されている  
WHEN `logPipelineDiag("pipeline:run:entry", "someDetail")` を呼ぶ  
THEN stderr に `[pipeline-diag <ISO timestamp>] pipeline:run:entry: someDetail` が出力される

---

## TC-13: DiagnosticLog — `SPECRUNNER_DEBUG=pipeline,other` でも出力あり

- **Category**: Unit / DiagnosticLog
- **Priority**: should
- **Source**: Task 3, Design D5

GIVEN `SPECRUNNER_DEBUG=pipeline,other` が設定されている  
WHEN `logPipelineDiag("pipeline:step:pre-execute")` を呼ぶ  
THEN stderr に出力がある

---

## TC-14: DiagnosticLog — `SPECRUNNER_DEBUG=other`（pipeline を含まない）では出力なし

- **Category**: Unit / DiagnosticLog
- **Priority**: should
- **Source**: Task 3, Design D5

GIVEN `SPECRUNNER_DEBUG=other` が設定されている  
WHEN `logPipelineDiag("pipeline:step:pre-execute")` を呼ぶ  
THEN stderr への出力がない

---

## TC-15: DiagnosticLog — detail なしのフォーマット確認

- **Category**: Unit / DiagnosticLog
- **Priority**: should
- **Source**: Task 3, Design D5

GIVEN `SPECRUNNER_DEBUG=pipeline` が設定されている  
WHEN `logPipelineDiag("pipeline:terminal")` を detail なしで呼ぶ  
THEN stderr に `[pipeline-diag <ISO timestamp>] pipeline:terminal` が出力される（`": "` が付かない）

---

## TC-16: AgentRedirect — `disallowedTools` が queryOptions に含まれる

- **Category**: Unit / AgentRedirect
- **Priority**: must
- **Source**: Task 8, Design D4, AC「#399 再現性の解消」

GIVEN agent-runner が queryOptions を組み立てる  
WHEN queryOptions の内容を確認する  
THEN `disallowedTools` に `"Agent"` と `"Task"` が含まれている

---

## TC-17: AgentRedirect — disallowedTools が queryOptions に含まれる

- **Category**: Unit / AgentRedirect
- **Priority**: must
- **Source**: Task 8, Design D4, AC「#399 再現性の解消」
- **Note**: 実装で確定した仕様 (= abort-and-escalate)。当初 D4 案 (= agents no-op handler で tool_result に redirect message を返す redirect-and-continue) は採用せず、`disallowedTools` + Stream monitoring + abort で統一した。詳細は implementation-notes.md の Design Deviation Notes 参照。

GIVEN ClaudeCodeRunner が query を実行する  
WHEN queryOptions を観察する  
THEN `disallowedTools` に `"Agent"` と `"Task"` が含まれている

---

## TC-18: AgentRedirect — redirect counter が 3 回超過で abort される

- **Category**: Unit / AgentRedirect
- **Priority**: must
- **Source**: Task 8, Design D4, AC「redirect retry 上限」
- **Note**: `agentRedirectCounter` は 1 step の 1 query() 内で local な scope (= step 跨ぎで持ち越されない、step ごとに新規 counter)。

GIVEN ClaudeCodeRunner が query を実行し AbortController が接続されている  
WHEN stream 中の `tool_use` で `Agent` / `Task` が 4 回目 (上限の 3 を超えた) に発火する  
THEN `abortController.abort()` が呼ばれ、クエリが打ち切られて `AGENT_REDIRECT_LIMIT_EXCEEDED` error で step が escalation に倒れる

---

## TC-19: AgentRedirect — 1〜3 回目の Agent/Task 呼び出しでは abort されない

- **Category**: Unit / AgentRedirect
- **Priority**: must
- **Source**: Task 8, Design D4, AC「redirect retry 上限」
- **Note**: 1〜3 回目は counter increment のみで abort されない (= 4 回目以降に escalation)。当初 D4 案では「毎回 redirect message が返る」だったが、実装では tool_result を返さず counter のみ。

GIVEN ClaudeCodeRunner が query を実行する  
WHEN stream 中の `tool_use` で `Agent` / `Task` が 3 回呼ばれる  
THEN abort されず、`agentRedirectCounter.count === 3` となる

---

## TC-20: AdditionalInstructions — Agent/Task 使用禁止ルールが含まれる

- **Category**: Unit / PromptBuilder
- **Priority**: must
- **Source**: Task 9, Design D4

GIVEN `buildAdditionalInstructions()` を呼ぶ  
WHEN 出力文字列を確認する  
THEN `"Do not use the Agent or Task tool"` または同等の禁止指示が含まれている

---

## TC-21: KeepAlive Integration — pipeline step 遷移中に process が exit しない

- **Category**: Integration / Pipeline
- **Priority**: must
- **Source**: Task 10, Design D2, AC「#386 再現性の解消」

GIVEN CommandRunner.execute() が KeepAlive を acquire した状態で pipeline が実行されている  
WHEN pipeline が step 間の async gap（await 境界）を通過する  
THEN process が event loop の drain により自然 exit せず、次の step が実行される

---

## TC-22: KeepAlive Integration — pipeline 完了後に release される

- **Category**: Integration / Pipeline
- **Priority**: must
- **Source**: Task 10, Design D2

GIVEN CommandRunner.execute() が KeepAlive を acquire した状態で pipeline が動いている  
WHEN pipeline が正常完走する  
THEN `finally` ブロックで `keepAlive.release()` が呼ばれ `isActive === false` になる

---

## TC-23: KeepAlive Integration — pipeline が error で終了した場合も release される

- **Category**: Integration / Pipeline
- **Priority**: must
- **Source**: Task 10, Design D2

GIVEN CommandRunner.execute() が KeepAlive を acquire した状態で pipeline が動いている  
WHEN pipeline が unhandled error で終了する  
THEN `finally` ブロックで `keepAlive.release()` が呼ばれる（release 漏れなし）

---

## TC-24: KeepAlive Integration — step timeout 発火時に release され exit/escalate する

- **Category**: Integration / Pipeline
- **Priority**: must
- **Source**: Task 10, Design D2, D7, AC「timeout 整合性」

GIVEN KeepAlive が active な状態で step の `timeoutMs` が設定されている  
WHEN step の実行が `timeoutMs` を超過する  
THEN AbortController が abort を発火し、pipeline がエラー/escalation 経路に倒れ、`finally` で `keepAlive.release()` が呼ばれ、process が exit/escalate する

---

## TC-25: KeepAlive Integration — finish orchestrator でも acquire/release される

- **Category**: Integration / Finish
- **Priority**: must
- **Source**: Task 5, Design D2

GIVEN `runFinishOrchestrator()` が呼ばれる  
WHEN git fetch retry sleep を含む処理が実行される  
THEN KeepAlive が active な状態を維持し、処理完了後に `finally` で release される

---

## TC-26: AgentRedirect Integration — Agent tool_use を含む stream で 4 回目に escalation する

- **Category**: Integration / AgentRedirect
- **Priority**: must
- **Source**: Task 11, Design D4, AC「#399 再現性の解消」
- **Note**: 実装で確定した仕様 (= abort-and-escalate)。当初 D4 案 (= redirect-and-continue) は採用せず。hang を silent ではなく observable な escalation (= `AGENT_REDIRECT_LIMIT_EXCEEDED`) に変える設計。詳細は implementation-notes.md の Design Deviation Notes 参照。

GIVEN mock queryFn が Agent tool_use を 4 回以上含む stream を返すように設定されている  
WHEN agent-runner がその stream を処理する  
THEN silent hang せず、`AGENT_REDIRECT_LIMIT_EXCEEDED` error で step が escalation に倒れる

---

## TC-27: AgentRedirect Integration — 正常な tool（Read/Bash 等）の呼び出しに影響なし

- **Category**: Integration / AgentRedirect
- **Priority**: must
- **Source**: Task 11, Design D4, AC「既存パイプライン回帰なし」

GIVEN mock queryFn が Read/Bash tool_use を含む stream を返すように設定されている  
WHEN agent-runner がその stream を処理する  
THEN redirect counter が増加せず、abort もされず、通常通りに処理が完了する

---

## TC-28: DiagnosticLog 配置 — `pipeline:run:entry` ポイントで出力される

- **Category**: Unit / DiagnosticLog配置
- **Priority**: should
- **Source**: Task 7, Design D5

GIVEN `SPECRUNNER_DEBUG=pipeline` が設定されている  
WHEN `pipeline.run()` が呼ばれる  
THEN stderr に `pipeline:run:entry` を含む diag ログが出力される

---

## TC-29: DiagnosticLog 配置 — `pipeline:step:pre-execute` と `pipeline:step:post-execute` で出力される

- **Category**: Unit / DiagnosticLog配置
- **Priority**: should
- **Source**: Task 7, Design D5

GIVEN `SPECRUNNER_DEBUG=pipeline` が設定されている  
WHEN pipeline が step を execute する  
THEN `executor.execute()` の直前に `pipeline:step:pre-execute`、直後に `pipeline:step:post-execute` が stderr に出力される

---

## TC-30: DiagnosticLog 配置 — `query:start` と `query:complete` で出力される

- **Category**: Unit / DiagnosticLog配置
- **Priority**: should
- **Source**: Task 7, Design D5

GIVEN `SPECRUNNER_DEBUG=pipeline` が設定されている  
WHEN agent-runner が `queryFn()` を呼び出す  
THEN 直前に `query:start`、`for await` ループ完了後に `query:complete` が stderr に出力される

---

## TC-31: DiagnosticLog — `SPECRUNNER_DEBUG` 未設定時は 13 ポイント全て出力なし

- **Category**: Unit / DiagnosticLog配置
- **Priority**: must
- **Source**: Task 7, Design D5, AC「diagnostic log opt-in」

GIVEN `SPECRUNNER_DEBUG` 環境変数が設定されていない状態で通常の pipeline が実行される  
WHEN pipeline が複数 step を実行する  
THEN stderr に `[pipeline-diag` を含む行が一切出力されない

---

## TC-32: ExitGuard 統合 — CLI entry point で registerExitGuard が登録される

- **Category**: Integration / ExitGuard
- **Priority**: must
- **Source**: Task 6, Design D3, AC「exit 時 invariant」

GIVEN `runRunCore()` / `runResumeCore()` / finish handler が呼ばれる  
WHEN process の初期化処理が行われる  
THEN `process` に `beforeExit` handler が登録されている

---

## TC-33: Regression — typecheck が green

- **Category**: Regression / Build
- **Priority**: must
- **Source**: AC「bun run typecheck && bun run test が green」

GIVEN 全 Task の実装が完了している  
WHEN `bun run typecheck` を実行する  
THEN 型エラーが 0 件で終了する

---

## TC-34: Regression — 全テストが green

- **Category**: Regression / Build
- **Priority**: must
- **Source**: AC「bun run typecheck && bun run test が green」

GIVEN 全 Task の実装が完了している  
WHEN `bun run test` を実行する  
THEN 全テストが pass し、失敗ゼロで終了する

---

## TC-35: Regression — 通常の run コマンドが以前と同等に動く

- **Category**: Regression / E2E
- **Priority**: must
- **Source**: AC「既存パイプライン回帰なし」

GIVEN KeepAlive / ExitGuard が統合された状態で通常の pipeline を実行する  
WHEN `specrunner run` を実行する  
THEN pipeline が正常完走し、observable な regression（出力の変化、パフォーマンス劣化等）がない

---

## TC-36: Regression — 通常の finish コマンドが以前と同等に動く

- **Category**: Regression / E2E
- **Priority**: must
- **Source**: AC「既存パイプライン回帰なし」

GIVEN KeepAlive が finish orchestrator に統合された状態  
WHEN `specrunner finish` を実行する  
THEN finish が正常完了し、observable な regression がない

---

## TC-37: Doc — `specrunner/project.md` に lifecycle binding の記述が追加される

- **Category**: Documentation
- **Priority**: should
- **Source**: AC「doc 更新」, Task 13

GIVEN `specrunner/project.md` が更新されている  
WHEN ファイルを確認する  
THEN KeepAlive sentinel timer を使った lifecycle binding 設計について 1 段落以上の記述が存在する

---

## TC-38: Doc — `README.md` の troubleshooting に silent exit の対処が追記される

- **Category**: Documentation
- **Priority**: should
- **Source**: AC「doc 更新」, Task 13

GIVEN `README.md` が更新されている  
WHEN troubleshooting セクションを確認する  
THEN `SPECRUNNER_DEBUG=pipeline` を使って silent exit を診断する手順が記載されている

---

## TC-39: KeepAlive — pipeline が abort signal を受けた場合も release される（SIGINT/SIGTERM）

- **Category**: Unit / KeepAlive
- **Priority**: should
- **Source**: Design D7

GIVEN CommandRunner.execute() が KeepAlive を acquire した状態で pipeline が動いている  
WHEN SIGINT / SIGTERM により `process.exit(130)` が呼ばれる  
THEN process が exit し、KeepAlive の状態に関わらず process は終了する（signal handler が直接 exit を呼ぶため KeepAlive は irrelevant）

---

## TC-40: AgentRedirect — redirect message が LLM-friendly な形式

- **Category**: Unit / AgentRedirect
- **Priority**: should
- **Source**: Design D4, request.md「redirect message の文言」

GIVEN no-op agent handler が呼ばれる  
WHEN redirect message の文言を確認する  
THEN メッセージに `Read`, `Grep`, `Edit`, `Bash`, `Write`, `Glob` などの使用可能 tool が具体的に列挙され、rejection ではなく redirect として LLM が方針を切替えやすい形式になっている
