# Tasks: AgentRunner Contract Tests

## T-01: Create the shared contract test file

Create `tests/unit/contract/agent-runner-contracts.test.ts`. No source files are modified.

### Structure overview

```
tests/unit/contract/agent-runner-contracts.test.ts
  ├── RunnerFixture interface
  ├── FixtureOpts type
  ├── claudeCodeFixture  (ClaudeCodeRunner + injectable mocks)
  ├── codexFixture       (CodexAgentRunner + injectable mocks)
  ├── REGISTERED_LOCAL_RUNNERS  { "claude-code": claudeCodeFixture, "codex": codexFixture }
  ├── Registration completeness test (filesystem scan)
  ├── describeAgentRunnerContracts(fixture)  [5 describe blocks]
  └── for (const [name, fixture] of REGISTERED_LOCAL_RUNNERS) { describeAgentRunnerContracts(fixture) }
```

### Sub-tasks

- [x] Define `FixtureOpts` type: `{ tempDir: string; sleepFn: (ms: number) => Promise<void> }`

- [x] Define `RunnerFixture` interface with four methods:
  - `makeCapturingPrompt(opts: FixtureOpts): { runner: AgentRunner; getCapturedMainTurnPrompt(): string | undefined }`
  - `makeWithReportToolSuccess(opts: FixtureOpts): AgentRunner`
  - `makeWithTransientError(opts: FixtureOpts): AgentRunner`
  - `makeCountingInvocations(opts: FixtureOpts): { runner: AgentRunner; getCallCount(): number }`

- [x] Implement `claudeCodeFixture`:
  - Import `ClaudeCodeRunner`, `QueryFn`, `CreateMcpServerFn` from `src/adapter/claude-code/agent-runner.js`
  - `makeCapturingPrompt`: build a `_queryFn` that stores `params.prompt` from the first call in a closure, then yields a minimal success result message (`type:"result"`, `subtype:"success"`, `session_id:"test-session"`, `modelUsage:{}`)
  - `makeWithReportToolSuccess`: combine a `makeMockCreateMcpServerFn()` helper (captures handler) with a `_queryFn` that calls `getHandler()({ok:true})` before yielding the success result
  - `makeWithTransientError`: build a `_queryFn` that throws `new Error("ECONNREFUSED")` on the first call and yields a success result on subsequent calls
  - `makeCountingInvocations`: build a `_queryFn` that increments a counter on each call and yields a success result with `session_id:"test-session"` (required for postWorkPrompts loop to execute)

- [x] Implement `codexFixture`:
  - Import `CodexAgentRunner`, `CodexInstance`, `CodexThread` from `src/adapter/codex/agent-runner.js`
  - `makeCapturingPrompt`: build a mock `CodexThread` whose `runStreamed` captures the `prompt` arg on the first call; thread yields `item.completed` with `agent_message` text `""` and `turn.completed`. Wrap in a `CodexInstance` via `_codexFactory`.
  - `makeWithReportToolSuccess`: mock thread returns `agent_message` with `text: '{"ok":true}'` as `finalResponse`. The codex adapter calls `tryExtractToolResult(finalResponse, reportTool)` which parses this as `{ok:true}`.
  - `makeWithTransientError`: mock thread whose `runStreamed` throws `new Error("ECONNREFUSED")` on first call, succeeds on second. Inject `_sleepFn: opts.sleepFn` to avoid real delays.
  - `makeCountingInvocations`: mock thread that increments a counter on each `runStreamed` call and returns a successful turn.

- [x] Define shared `makeMinCtx(overrides)` helper that builds a minimal valid `AgentRunContext`:
  - `step`: minimal `AgentStep` with `kind:"agent"`, no `reportTool`, `buildMessage: () => "test"`, `resultFilePath: () => null`, `parseResult: () => ({verdict:"approved", findingsPath:null})`
  - `state`: minimal `JobState` (version, jobId, branch, etc.)
  - `config`: `{ version:1, runtime:"local", agents:{} }` as `SpecRunnerConfig`
  - `branch`: `"feat/test"`, `slug`: `"test-slug"`, `cwd`: `opts.tempDir`
  - `input`: `{ requestContent: "test request" }`
  - `session`: `{}`, `policy`: `{}`
  - `emit`: `vi.fn()` (captures events for assertion)

- [x] Define `REGISTERED_LOCAL_RUNNERS: Record<string, RunnerFixture>`:
  ```ts
  const REGISTERED_LOCAL_RUNNERS: Record<string, RunnerFixture> = {
    "claude-code": claudeCodeFixture,
    "codex": codexFixture,
  };
  ```

- [x] Implement registration completeness test (outside `describeAgentRunnerContracts`):
  ```ts
  describe("AgentRunner contract suite — registration completeness", () => {
    it("all local adapter directories with agent-runner.ts are registered", () => {
      const NON_LOCAL_DIRS = new Set(["managed-agent", "github", "shared", "dispatching"]);
      const adapterRoot = path.resolve(ROOT, "src/adapter");
      const dirs = fs.readdirSync(adapterRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && !NON_LOCAL_DIRS.has(d.name))
        .filter(d => fs.existsSync(path.join(adapterRoot, d.name, "agent-runner.ts")))
        .map(d => d.name);
      for (const dir of dirs) {
        expect(Object.keys(REGISTERED_LOCAL_RUNNERS), `${dir} must be in REGISTERED_LOCAL_RUNNERS`).toContain(dir);
      }
    });
  });
  ```

- [x] Implement `describeAgentRunnerContracts(fixture: RunnerFixture)`:

  **Contract 1 — resumePrompt**:
  ```
  describe(`AgentRunner contract [${fixture.name}] — resumePrompt`, () => {
    it("main-turn prompt contains <resume-context> when resumePrompt is set", async () => {
      const { runner, getCapturedMainTurnPrompt } = fixture.makeCapturingPrompt({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, session: { resumePrompt: "extra context" } });
      await runner.run(ctx);
      const prompt = getCapturedMainTurnPrompt();
      expect(prompt).toContain("<resume-context>");
      expect(prompt).toContain("extra context");
    });
  });
  ```

  **Contract 2 — reportTool**:
  ```
  describe(`AgentRunner contract [${fixture.name}] — reportTool`, () => {
    it("result.toolResult is non-null and ok=true when agent reports", async () => {
      const runner = fixture.makeWithReportToolSuccess({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, policy: { reportTool: REPORT_TOOL } });
      const result = await runner.run(ctx);
      expect(result.toolResult).not.toBeNull();
      expect(result.toolResult!.ok).toBe(true);
    });
  });
  ```

  **Contract 3 — transient retry**:
  ```
  describe(`AgentRunner contract [${fixture.name}] — transient retry`, () => {
    it("retries on ECONNREFUSED, emits step:retry, returns transientRetryAttempts >= 1", async () => {
      const runner = fixture.makeWithTransientError({ tempDir, sleepFn });
      const emittedEvents: string[] = [];
      const ctx = makeMinCtx({
        tempDir,
        config: { version: 1, runtime: "local" as const, agents: {}, transientRetry: { maxRetries: 1 } },
        emit: (event: string) => emittedEvents.push(event),
      });
      const result = await runner.run(ctx);
      expect(result.completionReason).toBe("success");
      expect(result.transientRetryAttempts).toBeGreaterThanOrEqual(1);
      expect(emittedEvents).toContain("step:retry");
    });
  });
  ```

  **Contract 4 — logPath**:
  ```
  describe(`AgentRunner contract [${fixture.name}] — logPath`, () => {
    it("creates JSONL file at logPath and writes at least one line", async () => {
      const logPath = path.join(tempDir, "agent-session.jsonl");
      const { runner } = fixture.makeCapturingPrompt({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, session: { logPath } });
      await runner.run(ctx);
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = (await fs.readFile(logPath, "utf-8")).split("\n").filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      expect(() => JSON.parse(lines[0]!)).not.toThrow();
    });
  });
  ```

  **Contract 5 — postWorkPrompts**:
  ```
  describe(`AgentRunner contract [${fixture.name}] — postWorkPrompts`, () => {
    it("invokes SDK at least 1 + N times for N postWorkPrompts", async () => {
      const { runner, getCallCount } = fixture.makeCountingInvocations({ tempDir, sleepFn });
      const ctx = makeMinCtx({ tempDir, policy: { postWorkPrompts: ["cleanup please"] } });
      await runner.run(ctx);
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });
  });
  ```

- [x] Call `describeAgentRunnerContracts` for each registered fixture:
  ```ts
  for (const fixture of Object.values(REGISTERED_LOCAL_RUNNERS)) {
    describeAgentRunnerContracts(fixture);
  }
  ```

**Acceptance Criteria**:
- `tests/unit/contract/agent-runner-contracts.test.ts` exists
- All 5 contracts are tested for both `claude-code` and `codex` (10 test cases total from the contract suite)
- Registration completeness test verifies both adapters are registered; unregistered local adapters fail the test
- No source files under `src/` are modified

## T-02: Verify typecheck and tests pass

- [x] Run `bun run typecheck` — exits 0 with no type errors
- [x] Run `bun run test tests/unit/contract/agent-runner-contracts.test.ts` — all tests green
- [x] Run `bun run test` — full suite remains green

**Acceptance Criteria**:
- `bun run typecheck && bun run test` exits 0
