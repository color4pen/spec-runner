# Test Cases: per-step-rule-followup

## TC-01: Path Utility — stepRulesDirRel

**Category**: Unit / Path Utility  
**Priority**: must  
**Source**: T-01, Design D1

### TC-01-1

GIVEN a step name `"design"`  
WHEN `stepRulesDirRel("design")` is called  
THEN the return value is `"specrunner/rules/design"`

### TC-01-2

GIVEN an arbitrary agent step name (e.g. `"implementer"`, `"spec-review"`)  
WHEN `stepRulesDirRel(stepName)` is called  
THEN the return value is `"specrunner/rules/${stepName}"`

---

## TC-02: Rules Resolve — ファイル列挙・順序合成

**Category**: Unit / rules-resolve  
**Priority**: must  
**Source**: T-02, Acceptance 「worktree 環境で rules ファイルが解決可能であることを確認する test がある」

### TC-02-1: 昇順ソート

GIVEN `specrunner/rules/design/` に `01-a.md`、`02-c.md`、`10-b.md` の 3 ファイルがある  
WHEN `resolveStepRules("design", cwd, fsAdapter)` を呼ぶ  
THEN 返り値は `["<01-a の中身>", "<02-c の中身>", "<10-b の中身>"]` の順

### TC-02-2: ディレクトリ不存在

GIVEN `specrunner/rules/design/` ディレクトリが存在しない (ENOENT)  
WHEN `resolveStepRules("design", cwd, fsAdapter)` を呼ぶ  
THEN 返り値は空配列 `[]`

### TC-02-3: .md 以外は無視

GIVEN `specrunner/rules/design/` に `01-style.md`、`notes.txt`、`config.json` がある  
WHEN `resolveStepRules("design", cwd, fsAdapter)` を呼ぶ  
THEN 返り値には `01-style.md` の中身のみ含まれ、`.txt` / `.json` は除外される

### TC-02-4: 数字 prefix なしファイルは末尾

GIVEN `specrunner/rules/design/` に `01-style.md` と `no-prefix.md` がある  
WHEN `resolveStepRules("design", cwd, fsAdapter)` を呼ぶ  
THEN `01-style.md` が先、`no-prefix.md` が末尾

### TC-02-5: 混在順序

GIVEN `specrunner/rules/design/` に `01-a.md`、`10-b.md`、`02-c.md` がある  
WHEN `resolveStepRules("design", cwd, fsAdapter)` を呼ぶ  
THEN 順序は `[a の中身, c の中身, b の中身]` (数字昇順: 01, 02, 10)

### TC-02-6: worktree パスでの解決 (T-11)

GIVEN `cwd` が `.git/specrunner-worktrees/<name>` 配下のパス  
AND mock fsAdapter が `path.join(worktreeCwd, "specrunner/rules/design/01-style.md")` を返せる状態  
WHEN `resolveStepRules("design", worktreeCwd, fsAdapter)` を呼ぶ  
THEN ファイルが正しく解決され、中身が返る (空配列にならない)

---

## TC-03: Rules Follow-up Prompts — wrap 文言付き prompt 変換

**Category**: Unit / rules-followup-prompts  
**Priority**: must  
**Source**: T-03, Requirement 5, Acceptance「各 follow turn に 3 要素 wrap 文言が含まれ、それ以外の wrap が含まれない」

### TC-03-1: 3 要素 wrap が含まれる

GIVEN rule content が `"変数名はキャメルケースにすること"` の 1 要素配列  
WHEN `buildRulesFollowUpPrompts(["変数名はキャメルケースにすること"])` を呼ぶ  
THEN 出力の 1 要素に `修正範囲`、`stop 条件`、`意図解釈` の 3 文字列がすべて含まれる

### TC-03-2: 3 要素以外の wrap が含まれない

GIVEN rule content が任意の文字列の 1 要素配列  
WHEN `buildRulesFollowUpPrompts([content])` を呼ぶ  
THEN 出力プロンプトの wrap 部分に `修正範囲`、`stop 条件`、`意図解釈` 以外の箇条書き (`- ` で始まる行) が存在しない

### TC-03-3: 空配列入力 → 空配列出力

GIVEN `ruleContents` が `[]`  
WHEN `buildRulesFollowUpPrompts([])` を呼ぶ  
THEN 返り値は `[]`

### TC-03-4: 複数ファイル — 出力長が入力と一致

GIVEN `ruleContents` が 3 要素の配列  
WHEN `buildRulesFollowUpPrompts(ruleContents)` を呼ぶ  
THEN 返り値の長さは 3

### TC-03-5: rule content が `<rule>` タグ内に含まれる

GIVEN rule content が `"import は絶対パス禁止"` の 1 要素配列  
WHEN `buildRulesFollowUpPrompts([content])` を呼ぶ  
THEN 出力プロンプトに `<rule>` / `</rule>` タグと rule content が含まれる

---

## TC-04: Port 契約変更 — followUpPrompts

**Category**: Unit / Type Contract  
**Priority**: must  
**Source**: T-04, Requirement 6, Acceptance「design step の既存 followUpPrompt が移行後も followUpPrompts の一要素として機能する」

### TC-04-1: followUpPrompts フィールドが存在する

GIVEN `AgentRunContext` の型定義  
WHEN `followUpPrompts?: string[]` でオブジェクトを構築する  
THEN TypeScript の型チェックが通る

### TC-04-2: followUpPrompt (単数) が削除されている

GIVEN `AgentRunContext` の型定義  
WHEN `followUpPrompt: "..."` (単数) でオブジェクトを構築しようとする  
THEN TypeScript コンパイルエラーが発生する

### TC-04-3: 空配列と undefined は follow turn なしとして同義

GIVEN `ctx.followUpPrompts` が `[]`  
WHEN adapter の follow-up 判定を行う  
THEN follow turn は走らない

---

## TC-05: Follow-up Helper — shouldRunFollowUp の N 段判定

**Category**: Unit / adapter shared  
**Priority**: must  
**Source**: T-05

### TC-05-1: non-empty + success → true

GIVEN `ctx.followUpPrompts = ["a", "b"]` かつ baseCompletionReason = `"success"`  
WHEN `shouldRunFollowUp(ctx, "success")` を呼ぶ  
THEN `true` を返す

### TC-05-2: 空配列 + success → false

GIVEN `ctx.followUpPrompts = []` かつ baseCompletionReason = `"success"`  
WHEN `shouldRunFollowUp(ctx, "success")` を呼ぶ  
THEN `false` を返す

### TC-05-3: undefined + success → false

GIVEN `ctx.followUpPrompts = undefined` かつ baseCompletionReason = `"success"`  
WHEN `shouldRunFollowUp(ctx, "success")` を呼ぶ  
THEN `false` を返す

### TC-05-4: non-empty + error → false

GIVEN `ctx.followUpPrompts = ["a"]` かつ baseCompletionReason = `"error"`  
WHEN `shouldRunFollowUp(ctx, "error")` を呼ぶ  
THEN `false` を返す

---

## TC-06: Executor — rules 解決 + followUpPrompts 構築

**Category**: Unit / executor  
**Priority**: must  
**Source**: T-06, Acceptance「specrunner/rules/<step>/<NN>.md を配置すると、対象 step の作業 turn 後にファイルが順に follow turn として投げられる」

### TC-06-1: rules ファイルあり → ctx.followUpPrompts に rules prompt が含まれる

GIVEN step `"design"` の `specrunner/rules/design/` に 2 つの rules ファイルがある  
AND step に既存の `followUpPrompt` はない  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts` は wrap 付き 2 要素の配列

### TC-06-2: rules なし + 既存 followUpPrompt あり

GIVEN `specrunner/rules/<step>/` にファイルが存在しない  
AND step の `getFollowUpPrompt` が `"existing-prompt"` を返す  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts` は `["existing-prompt"]`

### TC-06-3: rules なし + 既存 followUpPrompt なし

GIVEN `specrunner/rules/<step>/` にファイルが存在しない  
AND step に `followUpPrompt` も `getFollowUpPrompt` もない  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts` は `undefined` または `[]`

### TC-06-4: 既存 followUpPrompt + rules → 既存が先頭、rules が後続

GIVEN step の `getFollowUpPrompt` が `"existing"` を返す  
AND `specrunner/rules/<step>/` に `01-rule.md` がある  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts[0]` は `"existing"` であり、`ctx.followUpPrompts[1]` に rules の wrap 付き内容が入る

### TC-06-5: CLI step は rules を無視する

GIVEN step 名が `"verification"` または `"pr-create"` または `"delta-spec-validation"`  
AND 対応する rules ディレクトリにファイルがある  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts` に rules prompt は含まれない  
**Priority**: should  
**Source**: Requirement 1, Design D1

---

## TC-07: Claude Code Adapter — N 段 follow-up loop

**Category**: Unit / claude-code adapter  
**Priority**: must  
**Source**: T-07, Acceptance「3 adapter で N 段 follow-up が動作する」

### TC-07-1: followUpPrompts 2 要素 → queryFn 3 回呼ばれる

GIVEN `ctx.followUpPrompts = ["prompt-a", "prompt-b"]`  
AND base の作業 turn が success で sessionId が取得できる  
WHEN adapter の `run()` を実行する  
THEN queryFn が合計 3 回呼ばれる (work turn 1 回 + follow turn 2 回)

### TC-07-2: followUpPrompts 空 → queryFn 1 回のみ

GIVEN `ctx.followUpPrompts = []`  
WHEN adapter の `run()` を実行する  
THEN queryFn が 1 回のみ呼ばれる

### TC-07-3: follow turn は resume オプションで同一 session に投げる

GIVEN `ctx.followUpPrompts = ["prompt-a"]`  
AND base turn で `sessionId = "sess-123"` が取得される  
WHEN adapter が follow turn を投げる  
THEN queryFn に `{ resume: "sess-123" }` を含む options が渡される

### TC-07-4: usage は全 turn 分累積される

GIVEN `ctx.followUpPrompts = ["a", "b"]`  
WHEN 3 turn 分の run が完了する  
THEN result の usage は 3 turn のトークン数の合算  
**Priority**: should  
**Source**: Design D6

---

## TC-08: Codex Adapter — N 段 follow-up loop + Thread.id 型修正

**Category**: Unit / codex adapter  
**Priority**: must  
**Source**: T-08, Requirement 7, Acceptance「CodexThread.id 型が string | null に修正される」

### TC-08-1: Thread.id が null → sessionId が undefined

GIVEN `activeThread.id` が `null`  
WHEN adapter が AgentRunResult を構築する  
THEN `result.sessionId` は `undefined`

### TC-08-2: followUpPrompts 2 要素 → thread.run 3 回呼ばれる

GIVEN `ctx.followUpPrompts = ["a", "b"]`  
AND base turn が success  
WHEN adapter の `run()` を実行する  
THEN `activeThread.run` が合計 3 回呼ばれる (work + 2 follow)

### TC-08-3: usage は全 turn 分累積される

GIVEN `ctx.followUpPrompts = ["a", "b"]`  
WHEN 3 turn 完了後  
THEN result の usage は 3 turn 分の合算  
**Priority**: should  
**Source**: T-08

### TC-08-4: Thread.id が string → sessionId が string

GIVEN `activeThread.id` が `"thread-xyz"`  
WHEN adapter が AgentRunResult を構築する  
THEN `result.sessionId` は `"thread-xyz"`  
**Priority**: should  
**Source**: T-08 8a

---

## TC-09: Managed Agent Adapter — N 段 follow-up + graceful degradation

**Category**: Unit / managed-agent adapter  
**Priority**: must  
**Source**: T-09, Requirement 8, Acceptance「managed-agent は skip 時 graceful degradation」

### TC-09-1: followUpPrompts 2 要素 → executeFollowUpTurn 2 回呼ばれる

GIVEN `ctx.followUpPrompts = ["a", "b"]`  
AND base turn が success  
WHEN adapter の `run()` を実行する  
THEN `executeFollowUpTurn` が 2 回追加で呼ばれる

### TC-09-2: 1 つ目の follow turn が失敗 → 2 つ目は引き続き実行される

GIVEN `ctx.followUpPrompts = ["a", "b"]`  
AND 1 つ目の follow turn (`"a"`) の `executeFollowUpTurn` が例外を throw する  
WHEN adapter の `run()` を実行する  
THEN 2 つ目の follow turn (`"b"`) の `executeFollowUpTurn` が呼ばれる  
AND 全体の run() は例外を throw しない

### TC-09-3: followUpPrompts 空 → 追加の sendUserMessage なし

GIVEN `ctx.followUpPrompts = []`  
WHEN adapter の `run()` を実行する  
THEN work turn の sendUserMessage のみ実行され、follow turn は呼ばれない

### TC-09-4: follow turn 失敗時に warning が出力される

GIVEN `ctx.followUpPrompts = ["a"]`  
AND follow turn が失敗する  
WHEN adapter の `run()` を実行する  
THEN warning ログが出力される (silently skip ではなく記録)  
**Priority**: should  
**Source**: Design D6

---

## TC-10: AbortController — 全 follow turn を覆う

**Category**: Unit / adapter  
**Priority**: must  
**Source**: Acceptance「AbortController が全 follow turn を覆う」, Design D8

### TC-10-1: abort 発火で残り follow turn が中断される

GIVEN `ctx.followUpPrompts = ["a", "b", "c"]`  
AND 1 つ目の follow turn 実行中に AbortController が abort される  
WHEN adapter の `run()` を実行する  
THEN 残りの follow turn は実行されない  
**Priority**: must  
**Source**: Design D8

### TC-10-2: timeout は全 follow turn に適用される

GIVEN timeout が 5000ms に設定されている  
AND `ctx.followUpPrompts = ["a", "b"]`  
WHEN 全 follow turn の合計実行時間が timeout を超える  
THEN AbortController 経由で処理が中断される  
**Priority**: should  
**Source**: Design D8

---

## TC-11: project.md inline 注入の維持

**Category**: Integration / backward compat  
**Priority**: must  
**Source**: Requirement 10, Design D9, Acceptance「design step の既存 followUpPrompt が移行後も followUpPrompts の一要素として機能する」

### TC-11-1: project.md は initial turn に inline 注入される

GIVEN `project.md` が存在し `needsProjectContext = true` の step である  
WHEN executor が step を実行する  
THEN project.md の内容が initial turn のプロンプトに inline 注入される  
AND follow-up turn には降格されない

### TC-11-2: 既存の design step followUpPrompt が followUpPrompts[0] として機能する

GIVEN design step の `getFollowUpPrompt` が `"design-followup"` を返す  
AND `specrunner/rules/design/` にファイルがない  
WHEN executor が `runAgentStep` を実行する  
THEN `ctx.followUpPrompts` は `["design-followup"]`

---

## TC-12: RULES_MD_CONTENT — 既存同梱規律は変更されない

**Category**: Integration / backward compat  
**Priority**: must  
**Source**: Requirement 4, Design D3

### TC-12-1: copyRulesToChangeFolder は変更されない

GIVEN 既存の `RULES_MD_CONTENT` と `copyRulesToChangeFolder` ロジック  
WHEN spec-runner が step を実行する  
THEN change folder への rules コピーが引き続き行われる

### TC-12-2: system prompt の Read 指示は残る

GIVEN agent step の system prompt  
WHEN step が実行される  
THEN change folder の rules ファイルを Read する指示が system prompt に含まれる  
**Priority**: should  
**Source**: Requirement 4

---

## TC-13: ADR の存在確認

**Category**: Documentation  
**Priority**: must  
**Source**: Requirement 9, Acceptance「ADR D2 refine の新 ADR が追加される」

### TC-13-1: 新 ADR ファイルが追加されている

GIVEN `specrunner/adr/` ディレクトリ  
WHEN ファイルを確認する  
THEN `2026-05-*-per-step-rule-followup*.md` または類似名の ADR ファイルが存在する

### TC-13-2: ADR に 3 要素 wrap 制約が記録されている

GIVEN 新 ADR ファイル  
WHEN 内容を確認する  
THEN wrap 文言の 3 要素制約が明記されており、拡張には新 ADR が必要な旨が記載されている  
**Priority**: should  
**Source**: Design D5, D10

---

## TC-14: typecheck + test が green

**Category**: CI  
**Priority**: must  
**Source**: Acceptance「bun run typecheck && bun run test が green」

### TC-14-1: 型チェックが通る

GIVEN 全変更が適用された状態  
WHEN `bun run typecheck` を実行する  
THEN 型エラーが 0 件

### TC-14-2: テストが通る

GIVEN 全変更が適用された状態  
WHEN `bun run test` を実行する  
THEN すべてのテストが pass する
