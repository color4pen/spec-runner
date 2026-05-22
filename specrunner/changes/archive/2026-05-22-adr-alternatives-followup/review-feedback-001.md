# Review Feedback: adr-alternatives-followup — Iteration 1

- **verdict**: needs-fix
- **date**: 2026-05-22

---

## Summary

実装は概ね正確。`types.ts`・`executor.ts`・`adr-gen.ts` の変更はすべて仕様通り。typecheck + test green。  
ただし test-cases.md TC-06 (must) に対応する executor ユニットテストが欠落している。

---

## Findings

### F-01 [high] TC-06 (must): executor の `getFollowUpPrompt` 優先ロジックがテストされていない

**場所**: `tests/unit/step/executor.test.ts`

`executor.ts:146` の変更:
```typescript
followUpPrompt: step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt,
```
は「`getFollowUpPrompt` が定義されていれば静的 `followUpPrompt` より優先する」という新規ロジックである。

test-cases.md TC-06 (must) はこの挙動を executor レベルで検証する必要があると明記しているが、`executor.test.ts` には対応するテストが追加されていない。既存の TC-05（静的 followUpPrompt の転記）はカバーするが、`getFollowUpPrompt` メソッドが定義されているケースは未検証。

この挙動が regression しても検出できない。

**修正**: `executor.test.ts` に以下を追加する。

```typescript
it("TC-06-new: getFollowUpPrompt が定義されている場合、静的 followUpPrompt より優先される", async () => {
  const { runner, captured } = makeCapturingFollowUpRunner();
  const executor = new StepExecutor(new EventBus(), runner);

  const step: Step = {
    kind: "agent" as const,
    name: "design",
    agent: makeAgentDef("design"),
    toolHandlers: undefined,
    followUpPrompt: "static-value",           // 静的も設定
    getFollowUpPrompt: () => "dynamic-value", // 動的が優先されるべき
    buildMessage: () => "msg",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
  };

  const state = makeMinimalState("tc-06-new");
  await executor.execute(step, state, makeFollowUpDeps());

  expect(captured.ctx!.followUpPrompt).toBe("dynamic-value");
});
```

---

### F-02 [low] TC-07: THEN 句と実装の挙動が矛盾している（テストなし）

**場所**: `specrunner/changes/adr-alternatives-followup/test-cases.md:73-82`

TC-07 の THEN は「静的値にフォールバックしない」と書いているが、実装の `??` 演算子は `getFollowUpPrompt` が `undefined` を返したとき静的値にフォールバックする。design.md D2 の注記はこの矛盾を認識しつつ「AdrGenStep は静的を持たないため実害なし」と説明している。

TC-07 のテストは追加されていないため failing はないが、将来のメンテナが「フォールバックしない保証がある」と誤読するリスクがある。

**修正 (optional)**: TC-07 の THEN を実際の挙動（AdrGenStep コンテキストでの実効値）に合わせて書き直す。

```markdown
THEN `followUpPrompt` は `undefined` である
  （AdrGenStep は静的 followUpPrompt を持たないため `?? undefined` → undefined）
```

---

## Confirmed Correct

- `AgentStep.getFollowUpPrompt?` の型定義 — TC-10, TC-11 ✓ (`getMaxTurns` と同型の optional method)
- `AdrGenStep.getFollowUpPrompt(adr: true)` → string — TC-01, TC-03 ✓
- `AdrGenStep.getFollowUpPrompt(adr: false)` → undefined — TC-02 ✓
- follow-prompt 文面: 「追記」を含み「判定せよ」を含まない — TC-04 ✓
- 機械的 validator / adr-fixer step なし — TC-12, TC-13 ✓
- `adr: false` の no-op パスで follow-prompt が送られない — TC-14 ✓ (getFollowUpPrompt → undefined → executor に undefined が渡る)
- DesignStep の静的 followUpPrompt は既存 executor TC-05 で引き続き動作確認 — TC-15 ✓
- `bun run typecheck` green — TC-16 ✓
- `bun run test` green (2574 tests passed) — TC-17 ✓
