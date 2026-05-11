# Test Cases: migrate-project-context

## Metadata

- **request**: migrate-project-context
- **generated**: 2026-05-11
- **source**: request.md + design.md + tasks.md

---

## TC-001: specrunner/project.md が存在する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#1.1, request.md#受け入れ基準

**GIVEN** `openspec/project.md` が存在するリポジトリで `git mv` を実行した後  
**WHEN** ファイルシステムを確認する  
**THEN** `specrunner/project.md` が存在する

---

## TC-002: openspec/ ディレクトリが存在しない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#1.2, request.md#受け入れ基準

**GIVEN** `openspec/project.md` が唯一のファイルだった `openspec/` ディレクトリで  
**WHEN** `git mv openspec/project.md specrunner/project.md` を実行した後  
**THEN** `openspec/` ディレクトリが存在しない（git が追跡対象から外す）

---

## TC-003: specrunner/project.md 内の Directory Structure が更新されている

- **Category**: consistency
- **Priority**: must
- **Source**: tasks.md#1.3

**GIVEN** 移動後の `specrunner/project.md`  
**WHEN** Directory Structure セクションを確認する  
**THEN** `openspec/` への言及が `specrunner/` に書き換えられている

---

## TC-004: projectMdPath() が正しいパスを返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#2.1, request.md#要件3

**GIVEN** `src/util/paths.ts` に `projectMdPath()` が実装されている  
**WHEN** `projectMdPath()` を呼び出す  
**THEN** `"specrunner/project.md"` を返す

---

## TC-005: paths.ts が他の src/ モジュールを import しない（TC-034 堅持）

- **Category**: architecture
- **Priority**: must
- **Source**: tasks.md#2.2, design.md#Test Constraints

**GIVEN** `src/util/paths.ts`  
**WHEN** import 文を確認する  
**THEN** `src/` 配下の他モジュールへの import が存在しない（Node.js 標準モジュールのみ許容）

---

## TC-006: AgentRunContext に projectContext フィールドが追加されている

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#3.1, design.md#TC-002

**GIVEN** `src/core/port/agent-runner.ts` の `AgentRunContext` インターフェース  
**WHEN** 型定義を確認する  
**THEN** `projectContext?: string` が optional フィールドとして存在する

---

## TC-007: allowlist ステップ（propose）で projectContext が設定される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3–4.5, design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "propose"` で実行する  
**THEN** `ctx.projectContext` に `specrunner/project.md` の内容が設定される

---

## TC-008: allowlist ステップ（spec-review）で projectContext が設定される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "spec-review"` で実行する  
**THEN** `ctx.projectContext` に `specrunner/project.md` の内容が設定される

---

## TC-009: allowlist ステップ（implementer）で projectContext が設定される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "implementer"` で実行する  
**THEN** `ctx.projectContext` に `specrunner/project.md` の内容が設定される

---

## TC-010: allowlist ステップ（code-review）で projectContext が設定される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "code-review"` で実行する  
**THEN** `ctx.projectContext` に `specrunner/project.md` の内容が設定される

---

## TC-011: 非 allowlist ステップ（spec-fixer）では projectContext が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, request.md#要件5, design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "spec-fixer"` で実行する  
**THEN** `ctx.projectContext` が `undefined` である

---

## TC-012: 非 allowlist ステップ（build-fixer）では projectContext が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, request.md#要件5

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "build-fixer"` で実行する  
**THEN** `ctx.projectContext` が `undefined` である

---

## TC-013: 非 allowlist ステップ（code-fixer）では projectContext が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, request.md#要件5

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "code-fixer"` で実行する  
**THEN** `ctx.projectContext` が `undefined` である

---

## TC-014: 非 allowlist ステップ（test-case-gen）では projectContext が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.3, request.md#要件5

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を `step.name = "test-case-gen"` で実行する  
**THEN** `ctx.projectContext` が `undefined` である

---

## TC-015: specrunner/project.md が存在しない場合にエラーにならない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#4.4, request.md#受け入れ基準, design.md#D4

**GIVEN** `specrunner/project.md` が存在しないリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を allowlist ステップで実行する  
**THEN** 例外がスローされず、`ctx.projectContext` が `undefined` になる

---

## TC-016: claude-code adapter で projectContext が additionalInstructions に注入される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#5.1, request.md#要件6, design.md#D3

**GIVEN** `ctx.projectContext` に文字列が設定されている claude-code adapter  
**WHEN** `buildAdditionalInstructions()` を呼び出す  
**THEN** 返り値に `<project-context>` タグで囲まれた projectContext の内容が含まれる

---

## TC-017: claude-code adapter で projectContext が undefined の場合は何も追記されない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#5.1, design.md#D3, D4

**GIVEN** `ctx.projectContext` が `undefined` の claude-code adapter  
**WHEN** `buildAdditionalInstructions()` を呼び出す  
**THEN** `<project-context>` タグが additionalInstructions に含まれない

---

## TC-018: managed-agent polling 経路で projectContext が initialMessage に注入される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#6.2, request.md#要件7, design.md#D3

**GIVEN** `ctx.projectContext` に文字列が設定されている managed-agent adapter（polling-style）  
**WHEN** `runPollingStyle()` 内で `initialMessage` を構築する  
**THEN** `initialMessage` の末尾に `<project-context>` タグで囲まれた projectContext の内容が追記される

---

## TC-019: managed-agent polling 経路で projectContext が undefined の場合は initialMessage が変化しない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#6.2, design.md#D3, D4

**GIVEN** `ctx.projectContext` が `undefined` の managed-agent adapter（polling-style）  
**WHEN** `runPollingStyle()` 内で `initialMessage` を構築する  
**THEN** `initialMessage` に `<project-context>` タグが含まれない

---

## TC-020: managed-agent SSE 経路で projectContext が requestContent に注入される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#6.1, request.md#要件7, design.md#D3

**GIVEN** `ctx.projectContext` に文字列が設定されている managed-agent adapter（propose/SSE-style）  
**WHEN** `runProposeStyle()` 内で `streamEvents()` を呼び出す  
**THEN** `streamEvents()` に渡される `requestContent` の末尾に `<project-context>` タグで囲まれた projectContext の内容が含まれる

---

## TC-021: managed-agent SSE 経路で projectContext が undefined の場合は requestContent が変化しない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#6.1, design.md#D3, D4

**GIVEN** `ctx.projectContext` が `undefined` の managed-agent adapter（propose/SSE-style）  
**WHEN** `runProposeStyle()` 内で `streamEvents()` を呼び出す  
**THEN** `streamEvents()` に渡される `requestContent` に `<project-context>` タグが含まれない

---

## TC-022: <project-context> タグのフォーマットが正しい

- **Category**: correctness
- **Priority**: should
- **Source**: design.md#D3

**GIVEN** `ctx.projectContext = "content"` の任意の adapter  
**WHEN** 注入後の文字列を確認する  
**THEN** フォーマットが `\n\n<project-context>\n${content}\n</project-context>` に準拠している

---

## TC-023: doctor check が specrunner/project.md を参照する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#7.2, request.md#要件2, 受け入れ基準

**GIVEN** リネーム後の `specrunner-project-md.ts`  
**WHEN** check 関数がチェック対象パスを確認する  
**THEN** `path.join(ctx.cwd, "specrunner", "project.md")` を参照している

---

## TC-024: doctor check が specrunner/project.md 存在時に pass する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#8.2

**GIVEN** `specrunner/project.md` が存在するプロジェクトで  
**WHEN** `specrunnerProjectMdCheck` を実行する  
**THEN** check result が pass であり、`"specrunner/project.md exists"` メッセージを含む

---

## TC-025: doctor check が specrunner/project.md 不在時に warn する（required: false）

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#7.2, design.md#D4

**GIVEN** `specrunner/project.md` が存在しないプロジェクトで  
**WHEN** `specrunnerProjectMdCheck` を実行する  
**THEN** check result が warn（required: false のため fail にならない）であり、`specrunner/project.md` を示すメッセージを含む

---

## TC-026: checks/index.ts が新しいシンボル名で import している

- **Category**: consistency
- **Priority**: must
- **Source**: tasks.md#7.3

**GIVEN** `src/core/doctor/checks/index.ts`  
**WHEN** import 宣言と allChecks 配列を確認する  
**THEN** `specrunnerProjectMdCheck` を `"./repo/specrunner-project-md.js"` から import し、allChecks 配列に含まれている

---

## TC-027: 旧シンボル openspecProjectMdCheck が存在しない

- **Category**: consistency
- **Priority**: should
- **Source**: tasks.md#7.1–7.3, design.md#D5

**GIVEN** プロジェクト全体のソースコード  
**WHEN** `openspecProjectMdCheck` を grep する  
**THEN** 結果が空（参照が残存していない）

---

## TC-028: 旧ファイル openspec-project-md.ts が存在しない

- **Category**: consistency
- **Priority**: should
- **Source**: tasks.md#7.1

**GIVEN** `src/core/doctor/checks/repo/` ディレクトリ  
**WHEN** ファイル一覧を確認する  
**THEN** `openspec-project-md.ts` が存在せず、`specrunner-project-md.ts` が存在する

---

## TC-029: doctor check テストファイルがリネームされている

- **Category**: testing
- **Priority**: must
- **Source**: tasks.md#8.1–8.2

**GIVEN** `tests/core/doctor/checks/repo/` ディレクトリ  
**WHEN** ファイル一覧を確認する  
**THEN** `openspec-project-md.test.ts` が存在せず、`specrunner-project-md.test.ts` が存在する

---

## TC-030: doctor check テストが specrunner/project.md のパスを検証している

- **Category**: testing
- **Priority**: must
- **Source**: tasks.md#8.2

**GIVEN** `tests/core/doctor/checks/repo/specrunner-project-md.test.ts`  
**WHEN** テスト内容を確認する  
**THEN** テストが `specrunner/project.md` のパスを参照し、`specrunnerProjectMdCheck` を import している

---

## TC-031: bun run typecheck が全 pass する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md#9.1, request.md#受け入れ基準

**GIVEN** 全変更が適用されたコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件でコマンドが成功する

---

## TC-032: bun run test が全 pass する

- **Category**: testing
- **Priority**: must
- **Source**: tasks.md#9.2, request.md#受け入れ基準

**GIVEN** 全変更が適用されたコードベース  
**WHEN** `bun run test` を実行する  
**THEN** テスト失敗が 0 件でコマンドが成功する

---

## TC-033: StepExecutor の projectContext 読み込みは cwd を基準にする

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md#4.4, design.md#D1

**GIVEN** `deps.cwd` が設定された StepExecutor で  
**WHEN** allowlist ステップの `runAgentStep()` を実行する  
**THEN** `path.join(deps.cwd ?? process.cwd(), "specrunner/project.md")` を読み込む（固定パスではなく cwd 相対）

---

## TC-034: 非 allowlist ステップではファイル I/O が発生しない

- **Category**: performance
- **Priority**: should
- **Source**: design.md#D2

**GIVEN** `specrunner/project.md` が存在するリポジトリで  
**WHEN** `StepExecutor.runAgentStep()` を allowlist 外のステップ（例: `spec-fixer`）で実行する  
**THEN** `specrunner/project.md` への `readFile` が呼ばれない

---

## TC-035: enrichContext と projectContext は独立した経路である

- **Category**: architecture
- **Priority**: should
- **Source**: design.md#D1, request.md#補足

**GIVEN** allowlist ステップの AgentRunContext  
**WHEN** `ctx` のフィールドを確認する  
**THEN** `projectContext` と `dynamicContext`（enrichContext）が別フィールドとして共存しており、一方の存在が他方に影響しない

---

## TC-036: projectContext の内容がセクション選択されず全文で渡される

- **Category**: correctness
- **Priority**: should
- **Source**: request.md#補足（YAGNI）

**GIVEN** `specrunner/project.md` に複数セクション（Stack / Architecture / Directory Structure）が存在する  
**WHEN** StepExecutor が projectContext を読み込む  
**THEN** `ctx.projectContext` に project.md の全文が設定される（セクションフィルタリングが行われない）

---

## TC-037: project.md が ENOENT 以外のエラーを投げた場合の挙動

- **Category**: correctness
- **Priority**: could
- **Source**: design.md#D4（ENOENT ハンドリング）

**GIVEN** `specrunner/project.md` への `readFile` が ENOENT 以外のエラー（例: 権限エラー）をスローする状況で  
**WHEN** `StepExecutor.runAgentStep()` を allowlist ステップで実行する  
**THEN** エラーが catch され、`projectContext` が `undefined` になる（パイプラインが中断しない）

---

## TC-038: managed-agent の initialMessage が let 宣言で再代入可能

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md#6.2

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` の `runPollingStyle()`  
**WHEN** `initialMessage` の宣言を確認する  
**THEN** `let` で宣言されており、projectContext 追記のための再代入が可能

---

## Summary

| Priority | Count |
|----------|-------|
| must     | 23    |
| should   | 11    |
| could    | 1     |
| **Total**| **35** |

| Category        | Count |
|-----------------|-------|
| correctness     | 24    |
| consistency     | 3     |
| architecture    | 2     |
| performance     | 1     |
| testing         | 3     |
| maintainability | 0     |

> **Note**: TC-031/TC-032（typecheck/test pass）は acceptance gate として must 扱い。TC-007〜TC-021 のシナリオは StepExecutor/adapter のユニットテストで検証する。TC-001〜TC-003 は git 操作結果の静的検証で確認する。
