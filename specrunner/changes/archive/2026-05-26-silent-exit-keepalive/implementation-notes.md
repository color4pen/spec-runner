# Implementation Notes: silent-exit-keepalive

## result: completed

## tasks_completed: 13/13

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/lifecycle/keepalive.ts` | created | KeepAlive sentinel timer class — acquire/release/isActive. Idempotent, wraps setInterval to keep event loop alive. |
| `src/core/lifecycle/exit-guard.ts` | created | createExitGuardHandler() (fired-once guard) + registerExitGuard() — scans running jobs on beforeExit and transitions them to awaiting-resume. Best-effort I/O. |
| `src/core/lifecycle/diagnostic.ts` | created | logPipelineDiag() — zero-overhead diagnostic logger activated by SPECRUNNER_DEBUG=pipeline env var. |
| `src/core/command/runner.ts` | modified | Added KeepAlive acquire after initVerboseLog; wrapped Steps 2-7 in try/finally with release. |
| `src/core/finish/orchestrator.ts` | modified | Added KeepAlive after assertJobFinishable; wrapped Phase 0-4 in try/finally with release. |
| `src/cli/run.ts` | modified | Added registerExitGuard(cwd) call at start of runRunCore(). |
| `src/cli/resume.ts` | modified | Added registerExitGuard(cwd) call at start of runResumeCore(). |
| `src/cli/finish.ts` | modified | Added registerExitGuard(opts.cwd) call at start of runFinish(). |
| `src/core/pipeline/pipeline.ts` | modified | Added logPipelineDiag import + 6 diagnostic points: pipeline:run:entry, pipeline:step:pre-execute, pipeline:step:post-execute, pipeline:transition:resolved, pipeline:terminal, pipeline:loop:exhausted. |
| `src/core/step/executor.ts` | modified | Added logPipelineDiag import + 5 diagnostic points: executor:step:dispatch (both branches), executor:agent:pre-run, executor:agent:post-run, executor:commit:pre, executor:commit:post. |
| `src/adapter/claude-code/agent-runner.ts` | modified | Added logPipelineDiag import + 2 diagnostic points (query:start, query:complete). Added disallowedTools: ["Agent", "Task"] to queryOptions. Added agentRedirectCounter + stream detection + AGENT_REDIRECT_LIMIT_EXCEEDED error when > 3 Agent/Task calls. |
| `src/adapter/shared/prompt-builder.ts` | modified | Added Agent/Task prohibition lines at end of buildAdditionalInstructions(), always appended regardless of branch/projectContext. |
| `src/core/lifecycle/__tests__/keepalive.test.ts` | created | Unit tests for KeepAlive: isActive before/after acquire/release, idempotent acquire, safe double release, re-acquire cycle. |
| `src/core/lifecycle/__tests__/keepalive-integration.test.ts` | created | Behavioral integration tests: stays active during async work, released after completion, released in finally on error, re-acquire after release. |
| `src/core/lifecycle/__tests__/exit-guard.test.ts` | created | Tests for createExitGuardHandler: running job → awaiting-resume, non-running unchanged, fired-once guard, I/O error swallowed. |
| `src/core/lifecycle/__tests__/diagnostic.test.ts` | created | Tests for logPipelineDiag: SPECRUNNER_DEBUG unset/pipeline/pipeline+other/other, format with/without detail. |
| `src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts` | created | Integration tests for agent redirect: disallowedTools in options, 4+ Agent calls → AGENT_REDIRECT_LIMIT_EXCEEDED, normal tools unaffected. |
| `specrunner/project.md` | modified | Added Lifecycle binding section before 設定. |
| `README.md` | modified | Added Troubleshooting section with silent exit diagnosis steps. |

## Blocked Tasks

None.

## Design Deviation Notes

- **D4 redirect 経路**: 当初設計では `agents` no-op handler で **redirect message を tool_result として返す (= redirect-and-continue)** ことを想定していたが、実装では `agents` option による no-op handler は登録せず、**Stream で `tool_use` を検出 → counter increment → 3 回超で `abortController.abort()` + `AGENT_REDIRECT_LIMIT_EXCEEDED` error** で escalation する方式 (= abort-and-escalate) に統一した。理由:
  - `disallowedTools` (Layer 1) と prompt 注入 (Layer 2) が一次防衛として有効であれば redirect 経路自体が発火しない
  - hang を silent ではなく **観測可能な failure** (= escalation) に変える方が spec-runner の原理 (= 「silent でなくす」) と整合
  - `agents` option の SDK 仕様 (= subagent ハンドラ登録) を本来用途外で流用するより、stream level の検出と abort の方が責務が明快
- **`agentRedirectCounter` の scope**: 1 step の 1 query() 内で local (= step 跨ぎで持ち越されない、step ごとに新規 counter)。
- **`disallowedTools` 単独の効果**: anthropics/claude-agent-sdk-typescript#162 で「prompt-based のみ」と報告あり、SDK level 実効性は単独で過大評価しないこと。Layer 2 (prompt 注入) + Stream monitoring + abort の defense in depth で堅牢化している。
- **TC-17 / TC-19 の振る舞いとの差分**: 「redirect message が tool_result として返る」「3 回まで redirect message が返る」という記述は当初の設計 D4 案に基づくもの。実装では 1〜3 回目は counter increment のみ、4 回目で abort + escalation。TC-18 (= 4 回目で abort) と TC-26 (= integration) は実装と整合。
