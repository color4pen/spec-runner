# Test Cases: core-layer-boundary-fix

## Overview

Layer boundary violations in `src/core/` (core→cli, core→adapter, core→SDK) を解消し、
`OneShotQueryClient` port 導入・`EventBus` コンストラクタ注入・`one-shot-query` delta spec 更新を検証するシナリオ群。

---

## Category: Layer Boundary — Static Import Check

### TC-01: core が cli を import していない（must）

- **Source**: request.md AC, Task 9
- **Priority**: must

```
GIVEN src/core/ 以下のすべての TypeScript ファイルが存在する
WHEN  `grep -rn "cli/" src/core` を実行する
THEN  マッチ件数が 0 であること
```

### TC-02: core が adapter を import していない（must）

- **Source**: request.md AC, module-boundary baseline scenario, Task 9
- **Priority**: must

```
GIVEN src/core/ 以下のすべての TypeScript ファイルが存在する
WHEN  `grep -rE "from ['\"](\.\./)*adapter/" src/core/` を実行する
THEN  マッチ件数が 0 であること（baseline scenario pass）
```

### TC-03: core/request 配下が SDK を直 import していない（must）

- **Source**: request.md AC, Task 9
- **Priority**: must

```
GIVEN src/core/request/ 以下のすべての TypeScript ファイルが存在する
WHEN  `grep -rn "@anthropic-ai/claude-agent-sdk" src/core/request` を実行する
THEN  マッチ件数が 0 であること
```

### TC-04: runner.ts に cli/progress import が残っていない（must）

- **Source**: Task 7a, design D1
- **Priority**: must

```
GIVEN src/core/command/runner.ts が存在する
WHEN  ファイルの import 宣言を確認する
THEN  `from "../../cli/progress.js"` もしくは `cli/progress` を含む行が存在しないこと
```

### TC-05: reviewer.ts に adapter import が残っていない（must）

- **Source**: Task 3, design D4
- **Priority**: must

```
GIVEN src/core/request/reviewer.ts が存在する
WHEN  ファイルの import 宣言を確認する
THEN  `query-one-shot` または `adapter/claude-code` を参照する import 行が存在しないこと
```

### TC-06: manager.ts に SDK / adapter import が残っていない（must）

- **Source**: Task 4, design D4
- **Priority**: must

```
GIVEN src/core/request/manager.ts が存在する
WHEN  ファイルの import 宣言を確認する
THEN  `@anthropic-ai/claude-agent-sdk` および `adapter/claude-code` を参照する import 行がいずれも存在しないこと
```

### TC-07: generator.ts に SDK import が残っていない（must）

- **Source**: Task 5, design D4
- **Priority**: must

```
GIVEN src/core/request/generator.ts が存在する
WHEN  ファイルの import 宣言を確認する
THEN  `@anthropic-ai/claude-agent-sdk` を参照する import 行が存在しないこと
```

---

## Category: OneShotQueryClient Port — Interface Definition

### TC-08: OneShotQueryClient interface が core/port/ に存在する（must）

- **Source**: request.md AC, Task 1, design D2
- **Priority**: must

```
GIVEN src/core/port/one-shot-query-client.ts が存在する
WHEN  ファイルの型定義を確認する
THEN  `OneShotQueryClient` interface が export されており、
      `run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>` メソッドを 1 つ持つこと
```

### TC-09: OneShotQueryOptions に必要なフィールドが揃っている（must）

- **Source**: Task 1, design D2
- **Priority**: must

```
GIVEN src/core/port/one-shot-query-client.ts の OneShotQueryOptions を確認する
WHEN  interface のフィールド一覧を検証する
THEN  systemPrompt (string), prompt (string) が必須フィールドとして存在し、
      allowedTools?, maxTurns?, timeoutMs?, cwd?, stepName?, model? がオプションとして存在し、
      config (SpecRunnerConfig 等) フィールドが含まれていないこと
```

### TC-10: OneShotQueryResult に必要なフィールドが揃っている（must）

- **Source**: Task 1, design D2
- **Priority**: must

```
GIVEN src/core/port/one-shot-query-client.ts の OneShotQueryResult を確認する
WHEN  interface のフィールド一覧を検証する
THEN  text (string) が必須フィールドとして存在し、
      sessionId?, turnCount?, stopReason? がオプションとして存在すること
```

### TC-11: core/port/index.ts から OneShotQueryClient が re-export されている（should）

- **Source**: Task 1
- **Priority**: should

```
GIVEN src/core/port/index.ts が存在する
WHEN  ファイルの export 宣言を確認する
THEN  `OneShotQueryClient`, `OneShotQueryOptions`, `OneShotQueryResult` が
      `one-shot-query-client.ts` から re-export されていること
```

---

## Category: Adapter Implementation — ClaudeCodeOneShotQueryClient

### TC-12: ClaudeCodeOneShotQueryClient が OneShotQueryClient を implements している（must）

- **Source**: Task 2, design D3
- **Priority**: must

```
GIVEN src/adapter/claude-code/one-shot-query-client.ts が存在する
WHEN  クラス定義を確認する
THEN  `ClaudeCodeOneShotQueryClient` が `implements OneShotQueryClient` と宣言されており、
      `run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>` を実装していること
```

### TC-13: ClaudeCodeOneShotQueryClient が SpecRunnerConfig をコンストラクタで受け取る（must）

- **Source**: Task 2, design D3
- **Priority**: must

```
GIVEN ClaudeCodeOneShotQueryClient のコンストラクタを確認する
WHEN  引数の型を検証する
THEN  constructor が `config: SpecRunnerConfig` を受け取り、private field として保持すること
```

### TC-14: ClaudeCodeOneShotQueryClient.run() が queryOneShot に委譲する（must）

- **Source**: Task 2, design D3
- **Priority**: must

```
GIVEN ClaudeCodeOneShotQueryClient が生成されている
WHEN  run(opts) を呼び出す
THEN  内部で既存の queryOneShot(opts, config) が呼び出され、その結果が OneShotQueryResult として返ること
```

### TC-15: queryOneShot 関数がそのまま adapter 内に存在する（should）

- **Source**: Task 2, design D3
- **Priority**: should

```
GIVEN src/adapter/claude-code/query-one-shot.ts (or .js) が存在する
WHEN  ファイルの export を確認する
THEN  `queryOneShot` 関数が変更されずに存在し続けていること（実装ロジックは不変）
```

---

## Category: Core Request — Port Dependency

### TC-16: runReview が OneShotQueryClient を必須引数に取る（must）

- **Source**: Task 3, design D4
- **Priority**: must

```
GIVEN src/core/request/reviewer.ts の runReview 関数シグネチャを確認する
WHEN  引数リストを検証する
THEN  シグネチャが `runReview(content, cwd, client: OneShotQueryClient)` となっており、
      config 引数・queryFn optional 引数が除去されていること
```

### TC-17: runReview が client.run() を呼び出す（must）

- **Source**: Task 3, design D4
- **Priority**: must

```
GIVEN OneShotQueryClient の mock が用意されている
WHEN  runReview(content, cwd, mockClient) を呼び出す
THEN  mockClient.run() が 1 回呼び出され、返り値の text が review 結果として使われること
```

### TC-18: manager.review() が OneShotQueryClient を必須引数に取る（must）

- **Source**: Task 4, design D4
- **Priority**: must

```
GIVEN src/core/request/manager.ts の review() メソッドシグネチャを確認する
WHEN  引数リストを検証する
THEN  シグネチャが `review(slugOrPath, cwd, client: OneShotQueryClient)` となっており、
      config / queryFn optional 引数および `queryFn ?? query` default が除去されていること
```

### TC-19: manager.create() が OneShotQueryClient を必須引数に取る（must）

- **Source**: Task 4, design D4
- **Priority**: must

```
GIVEN src/core/request/manager.ts の create() メソッドシグネチャを確認する
WHEN  引数リストを検証する
THEN  シグネチャが `create(text, cwd, client: OneShotQueryClient)` となっており、
      default fallback が除去されていること
```

### TC-20: generator.generate() が OneShotQueryClient を必須引数に取る（must）

- **Source**: Task 5, design D4
- **Priority**: must

```
GIVEN src/core/request/generator.ts の generate() 関数シグネチャを確認する
WHEN  引数リストを検証する
THEN  シグネチャが `generate(text, cwd, client: OneShotQueryClient)` となっており、
      config 引数・SDK query default が除去されていること
```

### TC-21: generator が client.run() を呼び出し stream 処理を行わない（must）

- **Source**: Task 5, design D4
- **Priority**: must

```
GIVEN OneShotQueryClient mock が { run: vi.fn().mockResolvedValue({ text: "<generated-slug>..." }) } で用意されている
WHEN  generate(text, cwd, mockClient) を呼び出す
THEN  mockClient.run() が呼び出され、for-await stream loop が存在せず、
      SDKMessage / SDKResultMessage 等の SDK 固有型を参照するコードが残っていないこと
```

### TC-22: generator がエラー時に GENERATE_SESSION_FAILED を返す（should）

- **Source**: Task 5
- **Priority**: should

```
GIVEN OneShotQueryClient mock の run() が Error を throw するよう設定されている
WHEN  generate(text, cwd, mockClient) を呼び出す
THEN  GENERATE_SESSION_FAILED エラーコードの Err が返ること
```

---

## Category: CommandRunner — EventBus Constructor Injection

### TC-23: CommandRunner コンストラクタが EventBus を受け取る（must）

- **Source**: Task 7a, design D1
- **Priority**: must

```
GIVEN src/core/command/runner.ts の CommandRunner を確認する
WHEN  コンストラクタシグネチャを検証する
THEN  `constructor(runtime: RuntimeStrategy, events: EventBus)` となっており、
      events が private field として保持されていること
```

### TC-24: CommandRunner.execute() 内で EventBus / ProgressDisplay を new していない（must）

- **Source**: Task 7a, design D1
- **Priority**: must

```
GIVEN src/core/command/runner.ts の execute() メソッドを確認する
WHEN  コード本体を検証する
THEN  `new EventBus()` および `new ProgressDisplay(...)` の呼び出しが存在せず、
      `this.events` が使われていること
```

### TC-25: PipelineRunCommand が EventBus を super に渡す（must）

- **Source**: Task 7b, design D1
- **Priority**: must

```
GIVEN src/core/command/pipeline-run.ts の PipelineRunCommand を確認する
WHEN  コンストラクタ定義を検証する
THEN  constructor が `(runtime, events, absolutePath, preflightResult, options)` を受け取り、
      `super(runtime, events)` を呼んでいること
```

### TC-26: ResumeCommand が EventBus を super に渡す（must）

- **Source**: Task 7c, design D1
- **Priority**: must

```
GIVEN src/core/command/resume.ts の ResumeCommand を確認する
WHEN  コンストラクタ定義を検証する
THEN  constructor が `(runtime, events, slug, options)` を受け取り、
      `super(runtime, events)` を呼んでいること
```

---

## Category: CLI Layer — EventBus + ProgressDisplay Wire-up

### TC-27: wireProgressDisplay が cli/progress.ts に存在する（must）

- **Source**: Task 7d, design D6
- **Priority**: must

```
GIVEN src/cli/progress.ts を確認する
WHEN  export 一覧を検証する
THEN  `wireProgressDisplay(events: EventBus, opts: { verbose: boolean; slug: string }): ProgressDisplay`
      が export されていること
```

### TC-28: cli/run.ts が EventBus を生成して PipelineRunCommand に注入する（must）

- **Source**: Task 7d, design D1
- **Priority**: must

```
GIVEN src/cli/run.ts の実装を確認する
WHEN  PipelineRunCommand の生成コードを検証する
THEN  `const events = new EventBus()` が PipelineRunCommand 生成前に呼ばれ、
      `wireProgressDisplay(events, { verbose, slug })` が呼ばれ、
      `new PipelineRunCommand(runtime, events, ...)` に events が渡されていること
```

### TC-29: cli/resume.ts が EventBus を生成して ResumeCommand に注入する（must）

- **Source**: Task 7d, design D1
- **Priority**: must

```
GIVEN src/cli/resume.ts の実装を確認する
WHEN  ResumeCommand の生成コードを検証する
THEN  `const events = new EventBus()` が ResumeCommand 生成前に呼ばれ、
      `wireProgressDisplay(events, { verbose, slug })` が呼ばれ、
      `new ResumeCommand(runtime, events, slug, options)` に events が渡されていること
```

---

## Category: Composition Point — executeReview / executeCreate

### TC-30: executeReview が client 引数を受け取る（must）

- **Source**: Task 6a, design D4
- **Priority**: must

```
GIVEN executeReview の関数シグネチャを確認する
WHEN  引数リストを検証する
THEN  `executeReview(filePath, opts, client: OneShotQueryClient)` となっており、
      内部で adapter import が行われず、client が runReview に渡されること
```

### TC-31: executeCreate が client 引数を受け取る（must）

- **Source**: Task 6b, design D4
- **Priority**: must

```
GIVEN executeCreate の関数シグネチャを確認する
WHEN  引数リストを検証する
THEN  `executeCreate(text, opts, client: OneShotQueryClient)` となっており、
      内部で adapter import が行われず、client が manager.create に渡されること
```

### TC-32: cli 側の呼び出し元が ClaudeCodeOneShotQueryClient を生成して注入する（must）

- **Source**: Task 6c, design D4
- **Priority**: must

```
GIVEN executeReview / executeCreate を呼び出す cli 側のファイルを確認する
WHEN  呼び出しコードを検証する
THEN  `loadConfig()` で設定を取得し `new ClaudeCodeOneShotQueryClient(config)` を生成して
      executeReview / executeCreate に渡していること
      （loadConfig の重複呼び出しが core 関数内に残っていないこと）
```

### TC-33: default fallback が存在しない（must）

- **Source**: Task 4, 5, 6, design D4
- **Priority**: must

```
GIVEN reviewer.ts / manager.ts / generator.ts / executeReview / executeCreate を確認する
WHEN  `queryFn ?? query` / `queryFn: typeof query = query` / `?? (query` パターンを検索する
THEN  マッチが 0 件であること（暗黙の SDK fallback がすべて除去されている）
```

---

## Category: Regression Test — Architecture Guard

### TC-34: regression test ファイルが存在する（must）

- **Source**: request.md AC, Task 9
- **Priority**: must

```
GIVEN tests/unit/architecture/ (または相当パス) を確認する
WHEN  module boundary を検証するテストファイルの存在を確認する
THEN  architecture boundary を検証するテストファイルが 1 つ以上存在すること
```

### TC-35: regression test が cli 逆参照を検証する（must）

- **Source**: Task 9, request.md AC
- **Priority**: must

```
GIVEN architecture regression test が存在する
WHEN  テストスイートを実行する
THEN  `grep -rn "cli/" src/core` が 0 件であることを asserting するテストケースが pass すること
```

### TC-36: regression test が adapter 逆参照を検証する（must）

- **Source**: Task 9, request.md AC (baseline scenario)
- **Priority**: must

```
GIVEN architecture regression test が存在する
WHEN  テストスイートを実行する
THEN  `grep -rE "from ['\"](\.\./)*adapter/" src/core/` が 0 件であることを asserting するテストケースが pass すること
```

### TC-37: regression test が SDK 直 import を検証する（must）

- **Source**: Task 9, request.md AC
- **Priority**: must

```
GIVEN architecture regression test が存在する
WHEN  テストスイートを実行する
THEN  `grep -rn "@anthropic-ai/claude-agent-sdk" src/core/request` が 0 件であることを asserting するテストケースが pass すること
```

---

## Category: Test Seam Migration

### TC-38: reviewer.test.ts が OneShotQueryClient mock を使う（must）

- **Source**: Task 8a, design D5
- **Priority**: must

```
GIVEN src/core/request/reviewer.test.ts (または相当パス) を確認する
WHEN  モックの定義と runReview 呼び出しを検証する
THEN  `mockQueryFn` (AsyncGenerator) ではなく `{ run: vi.fn().mockResolvedValue({...}) }` 形式の
      OneShotQueryClient mock が使われており、
      `runReview(content, cwd, mockClient)` の形で呼ばれていること
```

### TC-39: generator.test.ts が OneShotQueryClient mock を使う（must）

- **Source**: Task 8b, design D5
- **Priority**: must

```
GIVEN src/core/request/generator.test.ts (または相当パス) を確認する
WHEN  モックの定義と generate 呼び出しを検証する
THEN  AsyncGenerator mock が除去され、OneShotQueryClient mock が使われており、
      `generate(text, cwd, mockClient)` の形で呼ばれていること
```

### TC-40: runner.test.ts が EventBus 引数ありで CommandRunner を生成する（must）

- **Source**: Task 8c, design D1
- **Priority**: must

```
GIVEN runner.test.ts を確認する
WHEN  CommandRunner / PipelineRunCommand / ResumeCommand のテスト instantiation を検証する
THEN  constructor 呼び出しに EventBus インスタンスが渡されており、
      ProgressDisplay の mock が不要になった箇所が整理されていること
```

### TC-41: manager のテストが新シグネチャに対応している（should）

- **Source**: Task 8d
- **Priority**: should

```
GIVEN manager.ts のテストファイルを確認する
WHEN  create() / review() の呼び出しを検証する
THEN  OneShotQueryClient mock が渡されており、旧シグネチャ（config, queryFn?）が残っていないこと
```

---

## Category: Delta Spec — one-shot-query

### TC-42: delta spec ファイルが存在する（must）

- **Source**: Task 10, request.md AC
- **Priority**: must

```
GIVEN specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md を確認する
WHEN  ファイルの存在を検証する
THEN  ファイルが存在すること
```

### TC-43: delta spec が reviewer の OneShotQueryClient port 依存を記述している（must）

- **Source**: Task 10, request.md AC
- **Priority**: must

```
GIVEN delta spec を確認する
WHEN  Requirement / Scenario の記述を検証する
THEN  「reviewer は OneShotQueryClient port に依存する」旨の Requirement が存在し、
      「runReview が OneShotQueryClient を引数に受け取る」旨の Scenario が存在すること
      （旧「queryOneShot を import している」Scenario が除去されていること）
```

### TC-44: delta spec が queryOneShot 関数の Requirement を保持している（must）

- **Source**: Task 10, request.md 要件5
- **Priority**: must

```
GIVEN delta spec を確認する
WHEN  Requirement 一覧を検証する
THEN  「queryOneShot 関数が one-shot query の共通実行基盤を提供する」旨の Requirement が残っており、
      adapter 側に実装が存続することが示されていること
```

### TC-45: delta spec が module-boundary と矛盾しない（must）

- **Source**: request.md 要件5, 背景
- **Priority**: must

```
GIVEN delta spec と module-boundary baseline spec を並べて確認する
WHEN  双方の Requirement を照合する
THEN  one-shot-query spec が「reviewer は adapter を直 import する」旨を義務付ける記述を含まず、
      module-boundary の「core MUST NOT import from adapter」と矛盾しないこと
```

---

## Category: Behavioral Regression

### TC-46: run 経路で進捗表示が従来どおり動作する（must）

- **Source**: request.md 要件3, AC
- **Priority**: must

```
GIVEN pipeline run 経路（cli/run.ts → PipelineRunCommand）が設定されている
WHEN  request を実行（run）する
THEN  ProgressDisplay が表示され、pipeline のステップ進捗が従来どおりコンソールに出力されること
      （EventBus 注入前後で出力内容が変わらないこと）
```

### TC-47: resume 経路で進捗表示が従来どおり動作する（must）

- **Source**: request.md 要件3, AC (resume 経路の明示)
- **Priority**: must

```
GIVEN pipeline resume 経路（cli/resume.ts → ResumeCommand）が設定されている
WHEN  中断した request を resume する
THEN  ProgressDisplay が表示され、resume 後のステップ進捗が従来どおりコンソールに出力されること
      （resume 経路が run 経路と同等に配線されていること）
```

### TC-48: request review の出力が従来どおりである（must）

- **Source**: request.md 要件3, AC
- **Priority**: must

```
GIVEN ClaudeCodeOneShotQueryClient が composition point で注入されている
WHEN  `request review <file>` を実行する
THEN  review 結果テキストが従来と同じ形式で出力され、挙動に regression がないこと
```

### TC-49: request generate の出力が従来どおりである（must）

- **Source**: request.md 要件3, AC
- **Priority**: must

```
GIVEN ClaudeCodeOneShotQueryClient が composition point で注入されている
WHEN  `request generate <text>` を実行する
THEN  生成された request.md が従来と同じ内容・形式で出力され、挙動に regression がないこと
```

---

## Category: Build / Type Check

### TC-50: typecheck が pass する（must）

- **Source**: request.md AC, Task 11
- **Priority**: must

```
GIVEN すべての実装変更が完了している
WHEN  `bun run typecheck` を実行する
THEN  TypeScript の型エラーが 0 件で終了すること
```

### TC-51: test suite が green になる（must）

- **Source**: request.md AC, Task 11
- **Priority**: must

```
GIVEN すべての実装・テスト修正が完了している
WHEN  `bun run test` を実行する
THEN  全テストケースが pass し、failed / error が 0 件であること
```
