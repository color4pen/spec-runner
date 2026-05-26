# Code Review Feedback: resume-prompt-injection
**Iteration**: 1  
**Reviewer**: code-review agent  
**Date**: 2026-05-27

---

## Summary

実装・型チェック・テストはすべて green。受け入れ基準 5 項目は実装上すべて満たされている。データフロー（CLI flag → ResumeOptions → PrepareResult → PipelineDeps → StepExecutor → AgentRunContext → adapter）は設計通り正確に実装されており、one-shot 消費メカニズムも正しい。

ただし、test-cases.md で **must** 指定された 4 シナリオがテスト未カバーであるため `needs-fix`。

---

## Findings

| # | severity | location | description |
|---|----------|----------|-------------|
| F-01 | minor | `tests/unit/cli/specrunner-resume-dispatch.test.ts` | **TC-02 未カバー（must）**: `--prompt-file` でファイル内容が `runResume` に渡されることのテストがない。TC-DISPATCH-009 は `--prompt` のみカバー。`fs.readFileSync` 呼び出しパスが無検証のまま |
| F-02 | minor | `tests/unit/cli/specrunner-resume-dispatch.test.ts` | **TC-05 未カバー（must）**: `--prompt-file` に存在しないパスを指定したとき stderr に `"Error: Cannot read prompt file …"` が出力されて exit code 1 になることのテストがない |
| F-03 | minor | `tests/` | **TC-15 / TC-16 未カバー（must）**: `ManagedAgentRunner` の `resumePrompt` 注入テストがない。SSE パス（`streamWithPollingFallback` — `effectiveRequestContentWithResume`）と polling パス（`preparePollingMessage` — `initialMessage`）の両方がテスト未カバー |
| F-04 | cosmetic | `test-cases.md` vs `src/cli/command-registry.ts:406` | TC-03 のスペックは stderr 出力を `"Error: --prompt and --prompt-file are mutually exclusive."` と定義しているが、実装は `FlagParseError` throw → specrunner.ts で `e.message` のみ書き出すため `"Error: "` プレフィックスなし。動作は正しく TC-DISPATCH-010 のテストも実装に合わせて書かれているが、spec との文言不一致がある |

---

## Positive Notes

- **実装品質が高い**: 設計書（design.md）の Component Structure, Data Flow, D1〜D4 すべてが忠実に実装されている。
- **後方互換**: `resumePrompt` は全箇所で optional。既存 `PipelineRunCommand` や run コマンドへの影響がゼロ。
- **one-shot 消費が正確**: executor.ts の `ctx` 構築直後に `deps.resumePrompt = undefined` を設定、CLI ステップは消費しない設計を正確に実装。
- **両 adapter 対応**: ClaudeCodeRunner（`fullPrompt` 構築）と ManagedAgentRunner（SSE / polling 双方の `initialMessage` 構築）で `<resume-context>` セクションが正しく挿入されている。
- **テスト設計が丁寧**: TC-EXEC-003 の 2 回目呼び出しで `undefined` を確認するテスト、TC-10c の順序確認テストなど、critical path は細かくカバーされている。

---

## Fix Guide

### F-01: TC-02 — `--prompt-file` ファイル読み込みテストを追加

`tests/unit/cli/specrunner-resume-dispatch.test.ts` に以下を追加する。
一時ファイルに内容を書き出して `--prompt-file` で指定し、`runResume` に `prompt: "file content"` が渡されることを確認する。

```typescript
describe("TC-DISPATCH-011: --prompt-file reads file content and passes to runResume", () => {
  it("passes file content as prompt", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");
    const tmpFile = path.join(os.tmpdir(), `tc-dispatch-011-${Date.now()}.md`);
    await fs.writeFile(tmpFile, "fix content");
    try {
      await runMain(["job", "resume", "my-slug", `--prompt-file=${tmpFile}`]);
      expect(runResume).toHaveBeenCalledWith(
        "my-slug",
        expect.objectContaining({ prompt: "fix content" }),
      );
    } finally {
      await fs.rm(tmpFile, { force: true });
    }
  });
});
```

### F-02: TC-05 — 存在しないファイルパスで exit 1 テストを追加

```typescript
describe("TC-DISPATCH-012: --prompt-file with nonexistent path → exit 1", () => {
  it("exits with code 1 and writes error to stderr", async () => {
    const error = await runMain([
      "job", "resume", "my-slug",
      "--prompt-file=./nonexistent-file-99999.md",
    ]);
    expect(error).toBe("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cannot read prompt file"),
    );
  });
});
```

### F-03: TC-15 / TC-16 — ManagedAgentRunner resumePrompt テストを追加

既存の `tests/unit/adapter/managed-agent/` 配下のファイル（または新規）に追加する。
polling パスの `preparePollingMessage()` を呼ぶルートで `initialMessage` に `<resume-context>` が含まれることと、`resumePrompt` なしでは含まれないことを確認する。
SSE パスは `streamWithPollingFallback` の引数 `requestContent` を検証するか、`sessionClient.streamEvents` のモックで `requestContent` をキャプチャして確認する。

### F-04: cosmetic — 対応は任意

test-cases.md の TC-03 の `THEN` 記述を実際の出力（`"Error: "` プレフィックスなし）に合わせて更新するか、実装側で `process.stderr.write("Error: " + message)` に合わせるかを選択する。どちらでもよい。

---

## Verdict

- **verdict**: needs-fix

**理由**: F-01〜F-03 はいずれも test-cases.md で **must** 指定されたシナリオが未テスト。実装コードは正しいが、テストカバレッジのギャップが明確なため修正が必要。F-04 は cosmetic のみで fix 判定の要因ではない。
