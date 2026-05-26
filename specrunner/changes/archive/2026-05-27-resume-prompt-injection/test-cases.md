# Test Cases: resume-prompt-injection

## TC-01: --prompt inline テキストが runResume に渡される

- **Category**: CLI Flag Parsing
- **Priority**: must
- **Source**: 要件1, T-09a/b

GIVEN: `specrunner job resume <slug>` を `--prompt "手動で foo.ts の import を修正済み"` 付きで実行する  
WHEN: handler が flag を解析する  
THEN: `resolvedPrompt` が `"手動で foo.ts の import を修正済み"` になり `runResume` の `options.prompt` に渡される

---

## TC-02: --prompt-file のファイル内容が runResume に渡される

- **Category**: CLI Flag Parsing
- **Priority**: must
- **Source**: 要件2, T-09a/b

GIVEN: 内容が `"fix content"` のファイル `./fix-notes.md` が存在し、`--prompt-file ./fix-notes.md` を指定する  
WHEN: handler が `fs.readFileSync` でファイルを読み込む  
THEN: `resolvedPrompt` がファイルの内容 `"fix content"` になり `runResume` の `options.prompt` に渡される

---

## TC-03: --prompt と --prompt-file を同時に指定するとエラーになる

- **Category**: CLI Flag Parsing / Error Handling
- **Priority**: must
- **Source**: 要件4, T-09b, 受け入れ基準

GIVEN: `--prompt "some text"` と `--prompt-file ./notes.md` の両方を指定する  
WHEN: handler が排他チェックを実行する  
THEN: stderr に `"Error: --prompt and --prompt-file are mutually exclusive."` が出力され exit code 2 で終了する

---

## TC-04: オプションなしの場合は現行動作と同一（後方互換）

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: 要件（後方互換）, D4, 受け入れ基準

GIVEN: `specrunner job resume <slug>` をオプションなしで実行する  
WHEN: handler が flag を解析する  
THEN: `resolvedPrompt` は `undefined` のまま `runResume` に渡され、既存の resume 動作と完全に同一になる

---

## TC-05: --prompt-file に存在しないパスを指定するとエラーになる

- **Category**: Error Handling
- **Priority**: must
- **Source**: T-09b, D1

GIVEN: `--prompt-file ./nonexistent.md` を指定する（ファイルは存在しない）  
WHEN: handler が `fs.readFileSync` を試みる  
THEN: stderr に `"Error: Cannot read prompt file './nonexistent.md': ..."` が出力され exit code 1 で終了する

---

## TC-06: ResumeCommand.prepare() が options.prompt を PrepareResult.resumePrompt に設定する

- **Category**: Data Flow
- **Priority**: must
- **Source**: T-07, T-10a

GIVEN: `options.prompt = "injection text"` で `ResumeCommand` を生成する  
WHEN: `prepare()` を呼び出す  
THEN: 返り値の `PrepareResult.resumePrompt` が `"injection text"` である

---

## TC-07: options.prompt が未設定の場合 PrepareResult.resumePrompt は undefined

- **Category**: Data Flow
- **Priority**: must
- **Source**: T-07, T-10a

GIVEN: `options.prompt` を指定せずに `ResumeCommand` を生成する  
WHEN: `prepare()` を呼び出す  
THEN: 返り値の `PrepareResult.resumePrompt` が `undefined` である

---

## TC-08: runner.execute() が PrepareResult.resumePrompt を deps にコピーする

- **Category**: Data Flow
- **Priority**: should
- **Source**: T-03b

GIVEN: `PrepareResult.resumePrompt = "injection text"` の状態で `execute()` を呼び出す  
WHEN: `deps = runtime.buildDeps(...)` の直後の代入が実行される  
THEN: `deps.resumePrompt` が `"injection text"` になる

---

## TC-09: StepExecutor が最初の agent ステップで resumePrompt を AgentRunContext に渡す

- **Category**: One-shot Consumption
- **Priority**: must
- **Source**: T-04, T-10b

GIVEN: `deps.resumePrompt = "injection text"` が設定された `PipelineDeps` で `runAgentStep()` を呼び出す  
WHEN: `AgentRunContext` が構築される  
THEN: `ctx.resumePrompt` が `"injection text"` になる

---

## TC-10: 最初の agent ステップ実行後 deps.resumePrompt が undefined になる（one-shot）

- **Category**: One-shot Consumption
- **Priority**: must
- **Source**: T-04, T-10b, 要件3

GIVEN: `deps.resumePrompt = "injection text"` が設定された状態で `runAgentStep()` を呼び出す  
WHEN: `AgentRunContext` に値をコピーした直後のクリア処理が実行される  
THEN: `deps.resumePrompt` が `undefined` に設定され、次の `runAgentStep()` 呼び出し時は `ctx.resumePrompt` が `undefined` になる

---

## TC-11: CLI ステップは resumePrompt を消費しない

- **Category**: One-shot Consumption
- **Priority**: should
- **Source**: D3, T-04

GIVEN: `deps.resumePrompt = "injection text"` が設定された状態で `runCliStep()` を呼び出す  
WHEN: CLI ステップが実行される  
THEN: `deps.resumePrompt` は `undefined` にならず、後続の `runAgentStep()` で `ctx.resumePrompt` に値が渡される

---

## TC-12: ClaudeCodeRunner が resumePrompt を `<resume-context>` タグで baseMessage に挿入する（additionalInstructions なし）

- **Category**: Prompt Injection
- **Priority**: must
- **Source**: T-05, T-10c, D2

GIVEN: `ctx.resumePrompt = "fix note"` で `additionalInstructions` が未設定  
WHEN: `ClaudeCodeRunner.run()` が `fullPrompt` を構築する  
THEN: `fullPrompt` が `"{baseMessage}\n\n<resume-context>\nfix note\n</resume-context>"` の形式になる

---

## TC-13: ClaudeCodeRunner が resumePrompt と additionalInstructions を正しい順序で組み立てる

- **Category**: Prompt Injection
- **Priority**: must
- **Source**: T-05, D2

GIVEN: `ctx.resumePrompt = "fix note"` かつ `additionalInstructions = "extra"` が設定されている  
WHEN: `ClaudeCodeRunner.run()` が `fullPrompt` を構築する  
THEN: `fullPrompt` の順序が `baseMessage → <resume-context> セクション → additionalInstructions` になる

---

## TC-14: ClaudeCodeRunner が resumePrompt 未設定の場合 `<resume-context>` タグを挿入しない

- **Category**: Prompt Injection
- **Priority**: must
- **Source**: T-05, T-10c, D4

GIVEN: `ctx.resumePrompt` が `undefined`  
WHEN: `ClaudeCodeRunner.run()` が `fullPrompt` を構築する  
THEN: `fullPrompt` に `<resume-context>` タグが含まれず、既存動作と同一のプロンプトが生成される

---

## TC-15: ManagedAgentRunner が resumePrompt を `<resume-context>` タグで挿入する

- **Category**: Prompt Injection
- **Priority**: must
- **Source**: T-06, D2

GIVEN: `ctx.resumePrompt = "fix note"` が設定されている  
WHEN: `ManagedAgentRunner.run()` がメッセージを構築する  
THEN: メッセージに `<resume-context>\nfix note\n</resume-context>` セクションが含まれる

---

## TC-16: ManagedAgentRunner が resumePrompt 未設定の場合 `<resume-context>` タグを挿入しない

- **Category**: Prompt Injection
- **Priority**: must
- **Source**: T-06, D4

GIVEN: `ctx.resumePrompt` が `undefined`  
WHEN: `ManagedAgentRunner.run()` がメッセージを構築する  
THEN: メッセージに `<resume-context>` タグが含まれない

---

## TC-17: run コマンドでは resumePrompt が undefined のまま全ステップを通過する

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: D4, スコープ外

GIVEN: `specrunner job run <slug>` を実行する（resume ではない）  
WHEN: pipeline が実行される  
THEN: `deps.resumePrompt` が `undefined` のまま全ステップを通過し、adapter のプロンプトに `<resume-context>` タグが含まれない

---

## TC-18: --prompt-file に空ファイルを指定した場合空文字列が渡される

- **Category**: Edge Case
- **Priority**: could
- **Source**: T-09b

GIVEN: 空のファイル `./empty.md` を `--prompt-file ./empty.md` で指定する  
WHEN: handler が `fs.readFileSync` でファイルを読み込む  
THEN: `resolvedPrompt` が `""` （空文字列）になり、エラーにならず `runResume` に渡される
