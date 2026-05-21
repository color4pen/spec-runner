# project.md を specrunner/ に移行し pipeline に注入する

## Meta

- **slug**: migrate-project-context
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`openspec/project.md` が残骸として残っているが、pipeline のどのステップからも読まれていない。対象プロジェクトの規約・制約・ドメイン情報が agent に注入されないため、プロジェクト固有の設計原則や禁止事項を無視した出力が生成されるリスクがある。

モジュールアーキテクトの分析により、注入経路は `additionalInstructions`（system prompt 側）が適切と判断された。DynamicContext（user message 側）に入れるとキャッシュが効かない。

## 目的

`openspec/project.md` を `specrunner/project.md` に移行し、propose / spec-review / implementer / code-review の4ステップに system prompt 経路で注入する。

## 要件

1. **ファイル移動**: `openspec/project.md` → `specrunner/project.md` に移動する。移動後 `openspec/` が空であれば削除する

2. **doctor check 更新**: `src/core/doctor/checks/repo/openspec-project-md.ts` のパスを `specrunner/project.md` に変更する。ファイル名・export 名も `specrunnerProjectMdCheck` にリネームする

3. **project.md 読み込みユーティリティ**: `src/util/paths.ts` に `projectMdPath()` を追加。`specrunner/project.md` の相対パスを返す

4. **project.md の事前読み込み**: project.md の読み込みは adapter ではなく StepExecutor（`src/core/step/executor.ts`）で行う。`AgentRunContext`（`src/core/port/agent-runner.ts`）に `projectContext?: string` フィールドを追加し、StepExecutor が `runAgentStep()` 内で `specrunner/project.md` を読み込んで設定する。ファイル不在時は `undefined`（注入なし）

5. **注入対象ステップの制御**: propose / spec-review / implementer / code-review の4ステップのみに注入する。fixer 系（spec-fixer, build-fixer, code-fixer）・verification・test-case-gen・pr-create には注入しない。ステップ名 allowlist で判定する

6. **claude-code adapter での注入**: `src/adapter/claude-code/agent-runner.ts` の `buildAdditionalInstructions()` を async 化し、`ctx.projectContext` が存在する場合のみ `<project-context>` タグで追加する

7. **managed-agent adapter での注入**: polling-style は `initialMessage` に `<project-context>` タグで追記。propose-style（SSE）は `requestContent` に追記する

## 受け入れ基準

- [ ] `openspec/` ディレクトリが削除されている
- [ ] `specrunner/project.md` が存在する
- [ ] doctor check が `specrunner/project.md` を参照している
- [ ] propose / spec-review / implementer / code-review の system prompt に project.md の内容が含まれる
- [ ] fixer 系・verification・test-case-gen には注入されない
- [ ] `specrunner/project.md` が存在しない場合でもエラーにならない
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- project.md の読み込みを StepExecutor に置くことで adapter 間の重複を排除する。adapter は `ctx.projectContext` を参照するだけ
- project.md の内容は現在 Stack / Architecture / Directory Structure だが、将来 Constraints / Conventions セクションの追加を想定する。注入ロジックは project.md 全文を渡す設計にする（セクション選択は YAGNI）
- enrichContext パターンとは別経路。enrichContext は step 固有の動的データ用、projectContext は全対象 step 共通の固定データ用
- fixer 系を除外する理由: findings に基づく修正タスクであり project context は冗長、注入すると scope creep のリスクがある。test-case-gen を除外する理由: 設計成果物からシナリオを導出するためプロジェクト規約は不要。verification は CliStep であり agent prompt を持たない
