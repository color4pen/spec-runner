# Tasks: migrate-project-context

## 1. ファイル移動

- [x] 1.1 `git mv openspec/project.md specrunner/project.md` を実行する
- [x] 1.2 `openspec/` ディレクトリが空であることを確認する（git が自動的に追跡対象から外す）
- [x] 1.3 `specrunner/project.md` 内の Directory Structure セクションで `openspec/` を `specrunner/` に修正する

**受け入れ基準**: `specrunner/project.md` が存在し、`openspec/` ディレクトリが存在しない

## 2. paths.ts に projectMdPath() 追加

- [x] 2.1 `src/util/paths.ts` に `projectMdPath()` を追加する。`"specrunner/project.md"` を返す純粋関数
- [x] 2.2 TC-034 堅持: 他の src/ モジュールからの import を追加しない

**ファイル**: `src/util/paths.ts`
**受け入れ基準**: `projectMdPath()` が `"specrunner/project.md"` を返す

## 3. AgentRunContext に projectContext フィールド追加

- [x] 3.1 `src/core/port/agent-runner.ts` の `AgentRunContext` インターフェースに `projectContext?: string` を追加する
- [x] 3.2 JSDoc コメントを追加: `/** Project-level context from specrunner/project.md. undefined when file does not exist. */`
- [x] 3.3 TC-002 コメントを更新: `projectContext` を含める

**ファイル**: `src/core/port/agent-runner.ts`
**受け入れ基準**: `AgentRunContext.projectContext` が optional string として型定義されている

## 4. StepExecutor に project.md 読み込みロジック追加

- [x] 4.1 `src/core/step/executor.ts` に `node:fs/promises` の `readFile` を import する
- [x] 4.2 `projectMdPath` を `src/util/paths.ts` から import する
- [x] 4.3 ファイル先頭（クラス外）に allowlist 定数を定義する:
  ```typescript
  const PROJECT_CONTEXT_STEPS: ReadonlySet<string> = new Set([
    "propose", "spec-review", "implementer", "code-review",
  ]);
  ```
- [x] 4.4 `runAgentStep()` 内、ctx オブジェクト構築の直前（L93 付近）で project.md を読み込む:
  ```typescript
  let projectContext: string | undefined;
  if (PROJECT_CONTEXT_STEPS.has(step.name)) {
    const cwd = deps.cwd ?? process.cwd();
    const pmPath = path.join(cwd, projectMdPath());
    try {
      projectContext = await readFile(pmPath, "utf-8");
    } catch {
      // File not found — projectContext remains undefined
    }
  }
  ```
- [x] 4.5 ctx オブジェクト（L93-106）に `projectContext` フィールドを追加する

**ファイル**: `src/core/step/executor.ts`
**受け入れ基準**: allowlist 内のステップでは `ctx.projectContext` に project.md の内容が設定され、allowlist 外では `undefined`。ファイル不在時もエラーにならない

## 5. claude-code adapter に projectContext 注入を追加

- [x] 5.1 `src/adapter/claude-code/agent-runner.ts` の `buildAdditionalInstructions()` で `ctx.projectContext` が存在する場合に `<project-context>` タグで追記する:
  ```typescript
  if (ctx.projectContext) {
    lines.push("");
    lines.push("<project-context>");
    lines.push(ctx.projectContext);
    lines.push("</project-context>");
  }
  ```

**ファイル**: `src/adapter/claude-code/agent-runner.ts`
**受け入れ基準**: `ctx.projectContext` が存在するステップで additionalInstructions に `<project-context>` タグが含まれる。`undefined` の場合は何も追記されない

## 6. managed-agent adapter に projectContext 注入を追加

- [x] 6.1 `src/adapter/managed-agent/agent-runner.ts` の `runProposeStyle()` 内、`streamEvents()` 呼び出し時の `requestContent` に projectContext を追記する（L163 付近）:
  ```typescript
  const effectiveRequestContent = ctx.projectContext
    ? `${ctx.requestContent}\n\n<project-context>\n${ctx.projectContext}\n</project-context>`
    : ctx.requestContent;
  ```
  `streamEvents()` 呼び出しの `requestContent` を `effectiveRequestContent` に置き換える
- [x] 6.2 `runPollingStyle()` 内、`initialMessage` 構築後（L314 付近）に projectContext を追記する:
  ```typescript
  if (ctx.projectContext) {
    initialMessage = `${initialMessage}\n\n<project-context>\n${ctx.projectContext}\n</project-context>`;
  }
  ```
  `let initialMessage` を `let` のまま維持するか確認する（現在 `let` であれば追記可能）

**ファイル**: `src/adapter/managed-agent/agent-runner.ts`
**受け入れ基準**: propose (SSE) と polling の両経路で、`ctx.projectContext` 存在時に `<project-context>` タグが含まれる

## 7. doctor check のリネームとパス更新

- [x] 7.1 `src/core/doctor/checks/repo/openspec-project-md.ts` を `specrunner-project-md.ts` にリネーム（`git mv`）
- [x] 7.2 リネーム後のファイル内容を更新:
  - export 名: `openspecProjectMdCheck` → `specrunnerProjectMdCheck`
  - check name: `"openspec-project-md"` → `"specrunner-project-md"`
  - パス: `path.join(ctx.cwd, "openspec", "project.md")` → `path.join(ctx.cwd, "specrunner", "project.md")`
  - pass メッセージ: `"openspec/project.md exists"` → `"specrunner/project.md exists"`
  - warn メッセージ・hint を `specrunner/project.md` に更新
- [x] 7.3 `src/core/doctor/checks/index.ts` の import を更新:
  - import パス: `"./repo/openspec-project-md.js"` → `"./repo/specrunner-project-md.js"`
  - シンボル名: `openspecProjectMdCheck` → `specrunnerProjectMdCheck`（`allChecks` 配列内 + re-export）

**ファイル**: `src/core/doctor/checks/repo/openspec-project-md.ts` → `specrunner-project-md.ts`, `src/core/doctor/checks/index.ts`
**受け入れ基準**: doctor check が `specrunner/project.md` を参照し、型チェックが通る

## 8. テストファイルの更新

- [x] 8.1 `tests/core/doctor/checks/repo/openspec-project-md.test.ts` を `specrunner-project-md.test.ts` にリネーム（`git mv`）
- [x] 8.2 リネーム後のファイル内容を更新:
  - import パス: `openspec-project-md.js` → `specrunner-project-md.js`
  - シンボル名: `openspecProjectMdCheck` → `specrunnerProjectMdCheck`
  - describe 文: `"openspecProjectMdCheck"` → `"specrunnerProjectMdCheck"`
  - TC コメント: `openspec/project.md` → `specrunner/project.md` に更新
  - テストの description 文字列も `specrunner/project.md` に更新

**ファイル**: `tests/core/doctor/checks/repo/openspec-project-md.test.ts` → `specrunner-project-md.test.ts`
**受け入れ基準**: テストが pass し、`specrunner/project.md` のパスを検証している

## 9. 型チェックとテスト実行

- [x] 9.1 `bun run typecheck` が全 pass
- [x] 9.2 `bun run test` が全 pass

**受け入れ基準**: エラーなし
