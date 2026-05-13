# Test Cases: DynamicContext 注入の統合テスト

## TC-DC-101: DynamicContext の転送チェーン検証

- **Category**: Integration
- **Priority**: must
- **Source**: Task 1 / 要件 2.1 / 要件 2.2

### Scenario

```
GIVEN  PipelineDeps.dynamicContext に { gitLog, diffStat, changesList, specIndex } を持つ
       testDynamicContext を注入する
AND    runner.run() を vi.spyOn でラップして各呼び出しの ctx 引数をキャプチャする
AND    パイプラインが propose → spec-review approved → test-case-gen → implementer
       → verification → code-review approved → pr-create と進む構成になっている

WHEN   runPipeline(jobState, deps) を実行する

THEN   runner.run() が呼ばれた全呼び出しで ctx.dynamicContext が defined である
AND    ctx.dynamicContext.gitLog が testDynamicContext.gitLog と一致する
AND    ctx.dynamicContext.diffStat が testDynamicContext.diffStat と一致する
AND    ctx.dynamicContext.changesList が testDynamicContext.changesList と一致する
```

**検証ポイント**: `StepExecutor.runAgentStep()` が `deps.dynamicContext` を `AgentRunContext.dynamicContext` に転記する経路（executor.ts:128）。

---

## TC-DC-102: specIndex の全ステップ伝搬

- **Category**: Integration
- **Priority**: must
- **Source**: Task 2 / 要件 2.5

### Scenario

```
GIVEN  testDynamicContext.specIndex に 2 エントリ（"cli-commands", "pipeline-orchestrator"）
       を含む PipelineDeps を用意する
AND    runner.run() を vi.spyOn でラップする

WHEN   runPipeline(jobState, deps) を実行する

THEN   runner.run() が呼ばれた全呼び出しで ctx.dynamicContext.specIndex が defined である
AND    ctx.dynamicContext.specIndex の length が 2 である
AND    specIndex[0].capability が "cli-commands" である
AND    specIndex[1].capability が "pipeline-orchestrator" である
```

**検証ポイント**: DynamicContext の新フィールド `specIndex` が全エージェントステップに伝搬されること。

---

## TC-DC-103: projectContext の allowlist ステップへの注入

- **Category**: Integration
- **Priority**: must
- **Source**: Task 3 / 要件 2.3

### Scenario

```
GIVEN  tempDir 配下に specrunner/project.md を "# Test Project Context" で書き出す
AND    deps.cwd = tempDir を設定する
AND    runner.run() を vi.spyOn でラップする
AND    パイプラインが propose → spec-review approved → test-case-gen → implementer
       → verification → code-review approved → pr-create の経路を通る

WHEN   runPipeline(jobState, deps) を実行する

THEN   ctx.step.name === "propose" の呼び出しで ctx.projectContext === "# Test Project Context"
AND    ctx.step.name === "spec-review" の呼び出しで ctx.projectContext === "# Test Project Context"
AND    ctx.step.name === "implementer" の呼び出しで ctx.projectContext === "# Test Project Context"
AND    ctx.step.name === "code-review" の呼び出しで ctx.projectContext === "# Test Project Context"
```

**検証ポイント**: `executor.ts:22` の `PROJECT_CONTEXT_STEPS` allowlist（propose / spec-review / implementer / code-review）にのみ projectContext が注入されること。

---

## TC-DC-104: projectContext の非 allowlist ステップへの非注入

- **Category**: Integration
- **Priority**: must
- **Source**: Task 3 / 要件 2.4

### Scenario

```
GIVEN  tempDir 配下に specrunner/project.md が存在する
AND    deps.cwd = tempDir を設定する
AND    runner.run() を vi.spyOn でラップする
AND    パイプラインが propose → spec-review approved → test-case-gen → implementer
       → verification → code-review approved → pr-create の経路を通る

WHEN   runPipeline(jobState, deps) を実行する

THEN   ctx.step.name === "test-case-gen" の呼び出しで ctx.projectContext が undefined である
AND    ctx.step.name === "spec-fixer" の呼び出し（needs-fix パスが通る場合）で
       ctx.projectContext が undefined である
AND    ctx.step.name === "code-fixer" の呼び出し（code-review needs-fix パスが通る場合）で
       ctx.projectContext が undefined である
AND    ctx.step.name === "build-fixer" の呼び出し（verification failed パスが通る場合）で
       ctx.projectContext が undefined である
```

**検証ポイント**: allowlist 外のステップに projectContext が漏れ出ないこと。TC-DC-103 と合わせてポジティブ/ネガティブ両面を検証する。

---

## TC-DC-105: enrichContext による baselineSpecs の追加

- **Category**: Integration
- **Priority**: must
- **Source**: Task 4 / 要件 2.6

### Scenario

```
GIVEN  tempDir 配下に以下のファイルシステムを構築する:
       - specrunner/changes/test-slug/specs/my-cap/ (ディレクトリ)
       - specrunner/specs/my-cap/spec.md (内容: "# my-cap baseline spec content")
AND    deps.cwd = tempDir を設定する
AND    SpecReviewStep.enrichContext を vi.spyOn でラップする
AND    spec-review ステップが approved を返すよう mock する

WHEN   runPipeline(jobState, deps) を実行する

THEN   SpecReviewStep.enrichContext が 1 回呼ばれている
AND    enrichContext の返却値に baselineSpecs["my-cap"] が含まれる
AND    baselineSpecs["my-cap"] が "# my-cap baseline spec content" と一致する
```

**検証ポイント**: `SpecReviewStep.enrichContext()` が delta spec ディレクトリの存在をトリガーに baseline spec を読み込み、`baselineSpecs` を DynamicContext に追加すること（spec-review.ts:85-106）。

---

## TC-DC-106: enrichContext が呼ばれない（delta spec なし）

- **Category**: Integration
- **Priority**: should
- **Source**: Task 4 の境界条件

### Scenario

```
GIVEN  tempDir 配下に specrunner/changes/test-slug/specs/ ディレクトリが存在しない
AND    deps.cwd = tempDir を設定する
AND    SpecReviewStep.enrichContext を vi.spyOn でラップする

WHEN   runPipeline(jobState, deps) を実行する

THEN   enrichContext が返す DynamicContext に baselineSpecs が含まれない
       （または baselineSpecs が undefined / 空オブジェクトである）
AND    pipeline は正常に完了する
```

**検証ポイント**: delta spec が存在しない場合に enrichContext が DynamicContext を変更せず、pipeline が破綻しないこと。

---

## TC-DC-107: project.md が存在しない場合の projectContext フォールバック

- **Category**: Integration
- **Priority**: should
- **Source**: Task 3 の境界条件 / executor.ts:109-116

### Scenario

```
GIVEN  tempDir 配下に specrunner/project.md が存在しない
AND    deps.cwd = tempDir を設定する
AND    runner.run() を vi.spyOn でラップする

WHEN   runPipeline(jobState, deps) を実行する

THEN   allowlist ステップ（propose, spec-review, implementer, code-review）の
       ctx.projectContext が全て undefined である
AND    pipeline が正常に完了する（project.md 不在でエラーが throw されない）
```

**検証ポイント**: `executor.ts:115` の catch 節が機能し、project.md 不在時でも pipeline を破壊しないこと。

---

## TC-DC-108: dynamicContext を渡さない場合の後方互換性

- **Category**: Integration
- **Priority**: should
- **Source**: 後方互換性 / PipelineDeps.dynamicContext が optional

### Scenario

```
GIVEN  deps に dynamicContext を含めない（undefined）
AND    runner.run() を vi.spyOn でラップする

WHEN   runPipeline(jobState, deps) を実行する

THEN   runner.run() の各呼び出しで ctx.dynamicContext が undefined である
AND    pipeline が正常に完了する（dynamicContext 不在でエラーが throw されない）
```

**検証ポイント**: `StepContext.dynamicContext` が optional であり、既存テスト（TC-010〜TC-061）が動き続けること。

---

## TC-DC-109: 既存テストとの共存

- **Category**: Regression
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準「既存テストが壊れない」

### Scenario

```
GIVEN  TC-DC-100 系テストを追加した後の tests/pipeline-integration.test.ts

WHEN   bun run test を実行する

THEN   TC-010〜TC-061 の全テストが pass する
AND    TC-DC-101〜TC-DC-108 の全テストが pass する
AND    bun run typecheck でエラーが出ない
```

**検証ポイント**: 新テストが既存 mock インフラ（buildPipelineMockClient / buildMockGithubClient / buildConfig / buildRunner）と干渉しないこと。

---

## テスト実装メモ

### spy の取り方

```typescript
// TC-DC-101〜TC-DC-104 共通パターン
const runner = buildRunner(client, githubClient);
const capturedCtxList: AgentRunContext[] = [];
const originalRun = runner.run.bind(runner);
vi.spyOn(runner, "run").mockImplementation(async (ctx) => {
  capturedCtxList.push(ctx);
  return originalRun(ctx);
});
```

### allowlist ステップの特定

```typescript
const proposeCtx = capturedCtxList.find(c => c.step.name === "propose");
const testCaseGenCtx = capturedCtxList.find(c => c.step.name === "test-case-gen");
```

### enrichContext の spy

```typescript
import { SpecReviewStep } from "../src/core/step/spec-review.js";
const enrichSpy = vi.spyOn(SpecReviewStep, "enrichContext");
```

> **注**: enrichContext の返り値は runner.run に渡る `ctx.dynamicContext` には現れない（StepExecutor が enrichContext を呼んだ後に buildMessage を呼ぶが、AgentRunContext には enrichContext 前の dynamicContext が入る）。TC-DC-105 では enrichContext 自体の呼び出しと返却値を spy で直接検証する。
