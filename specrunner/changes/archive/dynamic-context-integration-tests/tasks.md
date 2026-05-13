# Tasks: DynamicContext 注入の統合テスト

## Task 1: runner.run() spy による DynamicContext 転送検証 [x]

**ファイル:** `tests/pipeline-integration.test.ts`

**実装内容:**

`TC-DC-100` describe ブロックを追加。`runPipeline` に `dynamicContext` 付きの `PipelineDeps` を渡し、`runner.run()` の各呼び出しで `ctx.dynamicContext` が正しく転送されていることを検証する。

1. テスト用 `DynamicContext` オブジェクトを定義:
   ```typescript
   const testDynamicContext: DynamicContext = {
     gitLog: "abc1234 feat: add tests",
     diffStat: " tests/foo.test.ts | 10 +++\n 1 file changed",
     changesList: ["dynamic-context-integration-tests", "other-change"],
     specIndex: [
       { capability: "cli-commands", purpose: "CLI subcommands", requirementCount: 10 },
       { capability: "pipeline-orchestrator", purpose: "Pipeline state machine", requirementCount: 13 },
     ],
   };
   ```

2. `buildRunner()` が返す runner の `run` メソッドを `vi.spyOn` でラップし、全呼び出しの `ctx` 引数をキャプチャする。ただし spy はオリジナルの実装を呼び出す（`mockImplementation` ではなく spy through）。

3. `runPipeline` の deps に `dynamicContext: testDynamicContext` を含めて呼び出す。

4. Assert:
   - `runner.run` の全呼び出しで `ctx.dynamicContext` が defined
   - `ctx.dynamicContext.gitLog` が `testDynamicContext.gitLog` と一致
   - `ctx.dynamicContext.diffStat` が `testDynamicContext.diffStat` と一致
   - `ctx.dynamicContext.changesList` が `testDynamicContext.changesList` と一致

**注意:** `runner.run()` は `ManagedAgentRunner.run()` であり、内部で `ctx.dynamicContext` を `StepContext.dynamicContext` に転記して `step.buildMessage` に渡す。spy は `AgentRunner.run(ctx)` の引数を捕捉するので、`StepExecutor` → `AgentRunner` の転送が正しいことを検証できる。

**受け入れ基準:** テストが pass し、agent ステップの全呼び出しで dynamicContext が存在する。

---

## Task 2: specIndex の伝搬検証 [x]

**ファイル:** `tests/pipeline-integration.test.ts`

**実装内容:**

Task 1 の spy データを使い、各 agent ステップの `ctx.dynamicContext.specIndex` が入力と一致することを検証する it ブロックを追加。

Assert:
- `ctx.dynamicContext.specIndex.length` === 2
- `specIndex[0].capability` === "cli-commands"
- `specIndex[1].capability` === "pipeline-orchestrator"

Task 1 と同じ describe ブロック内に配置。

**受け入れ基準:** specIndex が全 agent ステップに正しく伝搬されている。

---

## Task 3: projectContext allowlist 検証 [x]

**ファイル:** `tests/pipeline-integration.test.ts`

**実装内容:**

`deps.cwd` を `tempDir` に設定し、`{tempDir}/specrunner/project.md` にテスト用内容を書き出す。runner.run spy の各呼び出しから `ctx.projectContext` を検証する。

1. `beforeEach` または it ブロック内で:
   ```typescript
   await fs.mkdir(path.join(tempDir, "specrunner"), { recursive: true });
   await fs.writeFile(path.join(tempDir, "specrunner", "project.md"), "# Test Project Context");
   ```

2. `deps.cwd = tempDir` を設定。

3. Assert:
   - allowlist ステップ（propose, spec-review, implementer, code-review）の呼び出しで `ctx.projectContext` === `"# Test Project Context"`
   - 非 allowlist ステップ（spec-fixer, test-case-gen, build-fixer, code-fixer）の呼び出しで `ctx.projectContext` === `undefined`

**注意:** パイプラインのフロー上、spec-fixer は needs-fix → approved パスでのみ呼ばれる。最低限 propose / spec-review / implementer / code-review の 4 ステップで allowlist 検証ができれば十分。非 allowlist は test-case-gen で検証可能（approved パスで必ず通る）。

**受け入れ基準:** allowlist ステップのみに projectContext が注入され、それ以外は undefined。

---

## Task 4: enrichContext による baselineSpecs 追加の検証 [x]

**ファイル:** `tests/pipeline-integration.test.ts`

**実装内容:**

spec-review ステップの `enrichContext()` が `baselineSpecs` を dynamicContext に追加することを検証する。

1. テスト用ファイルシステムを構築:
   ```typescript
   // delta spec ディレクトリ（enrichContext のトリガー）
   await fs.mkdir(path.join(tempDir, "specrunner/changes/test-slug/specs/my-cap"), { recursive: true });
   // baseline spec（enrichContext が読み込む実体）
   await fs.mkdir(path.join(tempDir, "specrunner/specs/my-cap"), { recursive: true });
   await fs.writeFile(
     path.join(tempDir, "specrunner/specs/my-cap/spec.md"),
     "# my-cap baseline spec content"
   );
   ```

2. `deps.cwd = tempDir` を設定。

3. spy の spec-review ステップ呼び出しを特定（`ctx.step.name === "spec-review"`）。

4. Assert: ManagedAgentRunner 内部で enrichContext が呼ばれた結果、`step.buildMessage` に渡される dynamicContext に `baselineSpecs["my-cap"]` が含まれる。

   **検証方法:** `runner.run()` の spy は `AgentRunContext` しか見えず、`enrichContext` 後の状態は見えない。そのため `SpecReviewStep.enrichContext` 自体を spy して呼び出しを検証するか、`step.buildMessage` を spy して渡された `StepDeps.dynamicContext.baselineSpecs` を確認する。

   実装指針: `SpecReviewStep.enrichContext` を `vi.spyOn` し、返却値が `baselineSpecs` を含むことを assert する。

**受け入れ基準:** enrichContext が spec-review ステップで呼ばれ、baselineSpecs が追加される。

---

## Task 5: テスト実行と既存テストの健全性確認 [x]

**コマンド:**

```bash
bun run typecheck
bun run test
```

**受け入れ基準:**
- 新規テスト TC-DC-100 系が全 pass
- 既存テスト TC-010〜TC-061 が全 pass
- 型エラーなし
