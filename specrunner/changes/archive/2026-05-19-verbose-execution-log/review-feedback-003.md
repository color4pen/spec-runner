# Code Review — verbose-execution-log (iteration 3)

## Summary

iter 2 で指摘した F-01 (TC-07-01/02, TC-08-01, TC-09-01 の SSE / poll / managed session 計装テスト) はすべて新規 3 ファイル (`sse-stream-verbose-log.test.ts`, `completion-verbose-log.test.ts`, `agent-runner-verbose-log.test.ts`) で対応済み。implementation 本体は設計通りで完成度が高く、XDG 準拠・JSON Lines・append mode・maskSensitive・全 exit path での `closeVerboseLog` いずれも正しい。typecheck + test 2236 件 green。

未対応の must シナリオが 1 件残存: TC-06-02 / TC-06-03 (CommandRunner の成功・エラー exit path で `closeVerboseLog` が呼ばれることの単体テスト)。

---

## Findings

### [MAJOR] F-01: CommandRunner ライフサイクルの verbose log close — unit test 未実装 (TC-06-02, TC-06-03 — Priority: must)

- **file**: `tests/unit/core/command/runner.test.ts`
- **description**: `test-cases.md` で Priority: **must** の TC-06-02 / TC-06-03 が未実装。既存 `runner.test.ts` は `verbose: false` でしか CommandRunner を呼んでおらず、verbose=ON かつ initVerboseLog 後に成功・エラー exit した場合に `getVerboseLogFilePath()` が null を返す (= fd が閉じられている) ことを assert するテストが存在しない。

  | TC | 対象 | 期待内容 |
  |----|------|---------|
  | TC-06-02 | pipeline 正常終了 | `getVerboseLogFilePath()` が null を返す (fd リークなし) |
  | TC-06-03 | pipeline 例外終了 | 同上 |

  実装側は正しい: `runner.ts` の setupWorkspace 失敗・buildDeps 失敗・pipeline throw・正常終了のすべての return path に `closeVerboseLog()` が配置されている。しかしテストがないため、将来の refactoring で漏れが生じても検出できない。

  `runner.test.ts` は既存の `buildMockRuntime` / `TestCommand` インフラを使えば追加テストを数行で書ける。`XDG_STATE_HOME` を tempDir に向けて verbose=true の `PrepareResult` を渡し、execute() 後に `getVerboseLogFilePath()` を assert するだけ。

- **suggestion**:
  ```typescript
  // tests/unit/core/command/runner.test.ts に追加
  describe("TC-06-02: verbose log closed on pipeline success", () => {
    it("execute() success path → getVerboseLogFilePath() returns null", async () => {
      process.env["XDG_STATE_HOME"] = tempDir;
      setVerbose(true);
      const runtime = buildMockRuntime({ finalState: { status: "awaiting-merge", branch: "feat/test", steps: {} } });
      const cmd = new TestCommand(runtime, buildPrepareResult({ verbose: true }));
      const state = buildJobState();
      // persist minimal job state so initVerboseLog can open the file
      await persistJobState(tempDir, state);
      await cmd.execute();
      expect(getVerboseLogFilePath()).toBeNull();
      setVerbose(false);
    });
  });

  describe("TC-06-03: verbose log closed on pipeline error", () => {
    it("execute() pipeline throw → getVerboseLogFilePath() returns null", async () => {
      process.env["XDG_STATE_HOME"] = tempDir;
      setVerbose(true);
      const runtime = buildMockRuntime({ pipelineThrow: new Error("pipeline error") });
      const cmd = new TestCommand(runtime, buildPrepareResult({ verbose: true }));
      const state = buildJobState();
      await persistJobState(tempDir, state);
      await cmd.execute();
      expect(getVerboseLogFilePath()).toBeNull();
      setVerbose(false);
    });
  });
  ```

---

## Observations (non-blocking)

### TC-04-02 (must): resume --verbose integration シナリオ

- **description**: test-cases.md が「integration test」と明示しており、実 CLI 起動が必要なため unit test では検証不可能。TC-04-01 (append mode unit test) + `resume.ts` で `resolveVerboseFlag` → `initVerboseLog` が同一 jobId で呼ばれる code review により機能は確認済み。受け入れ基準の note ("integration test") から見て unit test 範囲外と判断し、本 finding は non-blocking 扱いとする。

---

## Test Coverage Summary

| TC | Priority | Status |
|----|----------|--------|
| TC-01-01〜05 | must / should | ✅ covered |
| TC-02-01〜04 | must | ✅ covered |
| TC-03-01〜08 | must / should | ✅ covered |
| TC-04-01 | must | ✅ covered |
| TC-04-02 | must | ⚠ integration-only; mechanism covered |
| TC-05-01〜02 | must | ✅ covered |
| TC-06-01 | should | ✅ covered (logInfo call in runner.ts) |
| **TC-06-02** | **must** | ❌ **not covered** |
| **TC-06-03** | **must** | ❌ **not covered** |
| TC-07-01〜02 | must | ✅ covered (iter 3 新規) |
| TC-08-01 | must | ✅ covered (iter 3 新規) |
| TC-09-01〜02 | must | ✅ covered (iter 3 新規) |
| TC-10-01〜03 | must | ✅ covered |
| TC-11-01〜02 | must | ✅ backward compat unchanged |
| TC-13-01〜02 | must | ✅ verification green |
| TC-14-01 | must | ✅ ADR with all 4 decisions |

---

## Verdict

- **verdict**: needs-fix
