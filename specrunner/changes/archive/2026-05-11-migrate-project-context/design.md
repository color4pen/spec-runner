# Design: migrate-project-context

## Overview

`openspec/project.md` を `specrunner/project.md` に移行し、StepExecutor → AgentRunContext → adapter の経路で propose / spec-review / implementer / code-review の 4 ステップに system prompt として注入する。

## Design Decisions

### D1: 読み込み責務は StepExecutor に置く

**問題**: project.md の読み込みを adapter 側に置くと、claude-code / managed-agent の 2 箇所で同じ I/O ロジックが重複する。

**決定**: StepExecutor の `runAgentStep()` 内で `specrunner/project.md` を読み込み、`AgentRunContext.projectContext` に設定する。adapter は `ctx.projectContext` を参照するだけ。

**根拠**: enrichContext パターンとは別経路。enrichContext は step 固有の動的データ用、projectContext は全対象 step 共通の固定データ用。読み込み責務を executor に一元化することで adapter 間の重複を排除する。

### D2: 注入対象の制御は StepExecutor 内の allowlist で行う

**問題**: どのステップに project context を注入するかの判定ロジックの配置。

**決定**: StepExecutor の `runAgentStep()` 内に allowlist 定数 `PROJECT_CONTEXT_STEPS` を定義し、`step.name` がリストに含まれる場合のみ `projectContext` を設定する。リスト外のステップでは `undefined` のまま。

**allowlist**: `["propose", "spec-review", "implementer", "code-review"]`

**除外理由**:
- fixer 系（spec-fixer, build-fixer, code-fixer）: findings に基づく修正タスク。project context は冗長で scope creep リスク
- test-case-gen: 設計成果物からシナリオを導出するため、プロジェクト規約は不要
- verification / pr-create: CliStep であり agent prompt を持たない

### D3: adapter での注入方式

**問題**: `ctx.projectContext` を agent の prompt にどう組み込むか。

**決定**:
- **claude-code**: `buildAdditionalInstructions()` で `ctx.projectContext` が存在する場合、`<project-context>` タグで追記する。関数は同期のまま（projectContext は既に読み込み済み文字列）。
- **managed-agent polling**: `initialMessage` に `<project-context>` タグで追記する。
- **managed-agent propose (SSE)**: `streamEvents()` の `requestContent` に追記する。

**タグ形式**: `\n\n<project-context>\n${content}\n</project-context>` — XML タグで明確に境界を示す。

### D4: ファイル不在時の振る舞い

**問題**: `specrunner/project.md` が存在しないリポジトリでの動作。

**決定**: `fs.readFile` が ENOENT を返した場合、`projectContext` を `undefined` にする。エラーにしない。adapter 側は `ctx.projectContext` が `undefined` なら何も追記しない。

**根拠**: project.md は任意ファイル。doctor check も `required: false` のまま。

### D5: doctor check のリネーム

**問題**: `openspecProjectMdCheck` がパスとして `openspec/project.md` をハードコードしている。

**決定**: ファイル名を `specrunner-project-md.ts` にリネーム、export 名を `specrunnerProjectMdCheck` に変更、チェック対象パスを `specrunner/project.md` に更新する。`checks/index.ts` の import とテストファイルも追従する。

### D6: project.md 移行後の openspec/ ディレクトリ

**問題**: `openspec/project.md` が唯一の残存ファイル。移動後に空ディレクトリになる。

**決定**: git mv で移動し、空になった `openspec/` は git が自動的に追跡対象から外す。明示的な rmdir は不要。

## Affected Files

| File | Change |
|------|--------|
| `openspec/project.md` | 削除（git mv で移動元） |
| `specrunner/project.md` | 新規（git mv で移動先） |
| `src/util/paths.ts` | `projectMdPath()` 追加 |
| `src/core/port/agent-runner.ts` | `AgentRunContext.projectContext?: string` 追加 |
| `src/core/step/executor.ts` | allowlist + project.md 読み込みロジック追加 |
| `src/adapter/claude-code/agent-runner.ts` | `buildAdditionalInstructions()` に projectContext 注入追加 |
| `src/adapter/managed-agent/agent-runner.ts` | polling/SSE 両経路に projectContext 注入追加 |
| `src/core/doctor/checks/repo/openspec-project-md.ts` | リネーム → `specrunner-project-md.ts`、パス・export 名変更 |
| `src/core/doctor/checks/index.ts` | import パス・シンボル名を追従 |
| `tests/core/doctor/checks/repo/openspec-project-md.test.ts` | リネーム → `specrunner-project-md.test.ts`、import・テスト内容を追従 |

## Test Constraints

- TC-034 堅持: `src/util/paths.ts` は他の src/ モジュールを import しない
- TC-002 拡張: `AgentRunContext` に `projectContext?: string` を追加（optional フィールド、dynamicContext と同じパターン）
- 既存テスト: doctor check テストのリネーム・内容更新
- `bun run typecheck` / `bun run test` が全 pass
