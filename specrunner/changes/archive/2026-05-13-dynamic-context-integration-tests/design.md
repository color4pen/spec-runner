# Design: DynamicContext 注入の統合テスト

## 概要

`tests/pipeline-integration.test.ts` に DynamicContext 注入チェーン全体を検証する統合テストを追加する。既存テストは `runPipeline` に `dynamicContext` を渡しておらず（`undefined`）、注入経路の正しさは未検証。

## 設計判断

### D1: テストレベル — pipeline-integration に追加

**選択肢:**
- A) `tests/pipeline-integration.test.ts` に追加（既存の mock インフラを再利用）
- B) 新しいファイル `tests/dynamic-context-integration.test.ts` を作成

**決定: A**

理由: 既存の `buildPipelineMockClient` / `buildMockGithubClient` / `buildConfig` / `buildRunner` をそのまま利用できる。新ファイルにするとこれらのユーティリティを export または複製する必要が生じ、既存テストファイルへの変更が増える。request の scope は「統合テストの追加」であり、テストインフラのリファクタリングではない。

### D2: 検証アプローチ — runner.run() の ctx を spy で捕捉

**問題:** `runPipeline` は内部で `StepExecutor` → `AgentRunner.run(ctx)` と呼ぶが、ctx の中身（dynamicContext, projectContext）は外部から直接観察できない。

**選択肢:**
- A) `AgentRunner.run()` を spy に差し替え、各呼び出しの `ctx` 引数をキャプチャ
- B) `StepExecutor` にテスト用 hook を追加
- C) EventBus に dynamicContext を emit する変更を入れる

**決定: A**

理由: `createManagedAgentRunner` が返す runner の `run` メソッドを `vi.spyOn` でラップすれば、プロダクションコードの変更なしに `AgentRunContext` を全ステップ分キャプチャできる。B, C はプロダクションコードへの変更が必要で scope 逸脱。

### D3: projectContext の検証 — ファイルシステム上に project.md を配置

**問題:** `StepExecutor.runAgentStep()` が `projectMdPath()` = `specrunner/project.md` を `readFile` で読む。テスト中にこのファイルが存在しないと `projectContext` は常に `undefined` になる。

**決定:** テストの `beforeEach` で `tempDir` 内に `specrunner/project.md` を書き出す。allowlist ステップでは `ctx.projectContext` が文字列、非 allowlist ステップでは `undefined` であることを assert する。

ただし、既存の pipeline-integration テストでは `deps.cwd` を渡していないため `process.cwd()` がフォールバックとして使われる。テストで `deps.cwd` を tempDir に設定するか、もしくは `process.cwd()` を tempDir に合わせる必要がある。`deps.cwd` を渡す方式が安全。

### D4: enrichContext の検証 — spec-review ステップでの baselineSpecs 追加

**問題:** `SpecReviewStep.enrichContext()` は `specrunner/changes/<slug>/specs/` ディレクトリを読み、対応する baseline spec を `specrunner/specs/<cap>/spec.md` から読んで `baselineSpecs` に追加する。

**決定:** テストで以下のファイルシステムを構築する:
- `specrunner/changes/test-slug/specs/my-cap/` (ディレクトリのみ — enrichContext のトリガー)
- `specrunner/specs/my-cap/spec.md` (baseline spec の実体)

spec-review ステップの `ctx.dynamicContext.baselineSpecs` に `my-cap` がキーとして存在することを assert する。

### D5: specIndex の検証

`collectDynamicContext` が返す `specIndex` はファイルシステム依存。統合テストでは `collectDynamicContext` は呼ばれない（`deps.dynamicContext` を直接注入する）ため、テスト用の DynamicContext オブジェクトに `specIndex` を含めて渡し、`ctx.dynamicContext.specIndex` が各ステップに伝搬されることを検証する。

## テスト構造

```
describe("TC-DC-100: DynamicContext injection through pipeline")
  ├── it("dynamicContext is forwarded to all agent steps via AgentRunContext")
  ├── it("specIndex is present in dynamicContext for all steps")
  ├── it("projectContext is injected only for allowlist steps")
  ├── it("projectContext is undefined for non-allowlist steps")
  └── it("enrichContext adds baselineSpecs for spec-review step")
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `tests/pipeline-integration.test.ts` | TC-DC-100 系のテストケースを追加 |

プロダクションコードの変更なし。
