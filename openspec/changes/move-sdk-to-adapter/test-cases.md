# Test Cases: move-sdk-to-adapter

## TC-01 src/sdk/ ディレクトリが存在しない [must]

**GIVEN** リファクタリングが完了している  
**WHEN** ファイルシステムで `src/sdk/` ディレクトリを確認する  
**THEN** ディレクトリが存在しない（`ls src/sdk/` が "No such file or directory" を返す）

---

## TC-02 client.ts が adapter 層に移動されている [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/adapter/managed-agent/client.ts` を確認する  
**THEN** ファイルが存在し、`createAnthropicClient` 関数がエクスポートされている

---

## TC-03 environments.ts が adapter 層に移動されている [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/adapter/managed-agent/environments.ts` を確認する  
**THEN** ファイルが存在し、`createEnvironment` / `retrieveEnvironment` 関数がエクスポートされている

---

## TC-04 agents.ts が削除されている [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/sdk/agents.ts` の存在を確認する  
**THEN** ファイルが存在しない（import 元ゼロのデッドコードとして削除）

---

## TC-05 sessions.ts が削除されている [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/sdk/sessions.ts` の存在を確認する  
**THEN** ファイルが存在しない（`adapter/managed-agent/sdk/sessions.ts` に集約済みのため削除）

---

## TC-06 src/core/ 配下に @anthropic-ai/sdk の直接 import がない [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` を実行する  
**THEN** マッチが 0 件

---

## TC-07 src/ 配下に sdk/ への残留 import がない [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `grep -rE "from ['\"](\.\./)*sdk/" src/` を実行する  
**THEN** マッチが 0 件

---

## TC-08 factory.ts の managed runtime: sessionClient を注入すると ManagedRuntime を返す [must]

**GIVEN** `SessionClient` インターフェースを実装したモックオブジェクトが存在する  
**AND** `config.runtime === "managed"` の SpecRunnerConfig がある  
**WHEN** `createRuntime(config, cwd, githubClient, repo, mockSessionClient)` を呼び出す  
**THEN** `ManagedRuntime` インスタンスが返される  
**AND** factory.ts 内で `createAnthropicClient` や `createAnthropicSessionClient` は呼ばれない

---

## TC-09 factory.ts の managed runtime: sessionClient を渡さないとエラーをスローする [must]

**GIVEN** `config.runtime === "managed"` の SpecRunnerConfig がある  
**WHEN** `createRuntime(config, cwd, githubClient, repo)` を `sessionClient` なしで呼び出す  
**THEN** `Error("sessionClient is required for managed runtime")` がスローされる

---

## TC-10 factory.ts の local runtime: sessionClient なしで LocalRuntime を返す [must]

**GIVEN** `config.runtime === "local"` の SpecRunnerConfig がある  
**WHEN** `createRuntime(config, cwd, githubClient, repo)` を `sessionClient` なしで呼び出す  
**THEN** `LocalRuntime` インスタンスが返される  
**AND** エラーはスローされない

---

## TC-11 factory.ts が @anthropic-ai/sdk を import していない [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/core/runtime/factory.ts` の import 文を確認する  
**THEN** `@anthropic-ai/sdk` の import がない  
**AND** `../../sdk/client.js` の import がない  
**AND** `../../adapter/managed-agent/session-client.js` の import がない  
**AND** `import type { SessionClient } from "../port/session-client.js"` が存在する

---

## TC-12 run.ts が managed runtime 時に sessionClient を構築して createRuntime に渡す [must]

**GIVEN** `config.runtime !== "local"` の設定がある  
**WHEN** `runRunCore` が実行される  
**THEN** `createAnthropicClient` で Anthropic インスタンスを生成する  
**AND** `createAnthropicSessionClient` で SessionClient を生成する  
**AND** `createRuntime` の第5引数に sessionClient が渡される

---

## TC-13 run.ts が local runtime 時に sessionClient を構築しない [should]

**GIVEN** `config.runtime === "local"` の設定がある  
**WHEN** `runRunCore` が実行される  
**THEN** `createAnthropicClient` は呼ばれない  
**AND** `createRuntime` の第5引数は `undefined`

---

## TC-14 bootstrap.ts が managed runtime 時に sessionClient を構築して createRuntime に渡す [must]

**GIVEN** `config.runtime !== "local"` の設定がある  
**WHEN** `bootstrap(cwd, repo)` が実行される  
**THEN** `createAnthropicClient` と `createAnthropicSessionClient` でクライアントを生成する  
**AND** `createRuntime` の第5引数に sessionClient が渡される

---

## TC-15 bootstrap.ts が local runtime 時に sessionClient を構築しない [should]

**GIVEN** `config.runtime === "local"` の設定がある  
**WHEN** `bootstrap(cwd, repo)` が実行される  
**THEN** `createAnthropicClient` は呼ばれない  
**AND** `createRuntime` の第5引数は `undefined`

---

## TC-16 cli/init.ts の import パスが adapter 層を参照している [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/cli/init.ts` の import 文を確認する  
**THEN** `createAnthropicClient` の import 元が `../adapter/managed-agent/client.js`  
**AND** `createEnvironment` / `retrieveEnvironment` の import 元が `../adapter/managed-agent/environments.js`  
**AND** `../sdk/client.js` / `../sdk/environments.js` の import が存在しない

---

## TC-17 cli/rm.ts の import パスが adapter 層を参照している [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/cli/rm.ts` の import 文を確認する  
**THEN** `createAnthropicClient` の import 元が `../adapter/managed-agent/client.js`  
**AND** `../sdk/client.js` の import が存在しない

---

## TC-18 tests/completion.test.ts の import パスが adapter/managed-agent/sdk を参照している [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `tests/completion.test.ts` の import 文を確認する  
**THEN** sessions 関連の import 元が `../src/adapter/managed-agent/sdk/sessions.js`  
**AND** `../src/sdk/sessions.js` の import が存在しない

---

## TC-19 bun run typecheck が green [must]

**GIVEN** リファクタリングが完了し、全ソースファイルの import パスが更新されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-20 bun run test が green [must]

**GIVEN** リファクタリングが完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する（既存テストのリグレッションなし）

---

## TC-21 factory.ts のコメントが DI 設計を反映している [should]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/core/runtime/factory.ts` のコメントを確認する  
**THEN** `config.runtime branching` の責務が cli 層（composition root）と共有される旨が記載されている  
**AND** "ALL config.runtime branching is confined to this function" という旧コメントが削除または更新されている

---

## TC-22 adapter/managed-agent/client.ts が Anthropic beta header を含む [should]

**GIVEN** `src/adapter/managed-agent/client.ts` が存在する  
**WHEN** ファイルの内容を確認する  
**THEN** managed-agents beta header（`defaultHeaders` に `anthropic-beta: managed-agents-2025-05-16` 相当）が設定されている  
**AND** 移動前の `src/sdk/client.ts` と機能的に同等である

---

## TC-23 run.ts / bootstrap.ts が adapter 層を import している [should]

**GIVEN** リファクタリングが完了している  
**WHEN** `src/cli/run.ts` と `src/cli/bootstrap.ts` の import 文を確認する  
**THEN** `createAnthropicClient` の import 元が `../adapter/managed-agent/client.js`  
**AND** `createAnthropicSessionClient` の import 元が `../adapter/managed-agent/session-client.js`

---

## TC-24 sdk/ への import が残留していないことをプロジェクト全体で確認 [could]

**GIVEN** リファクタリングが完了している  
**WHEN** `grep -rE "from ['\"](\.\./)*sdk/" .` をプロジェクトルートで実行する  
**THEN** マッチが 0 件（テストファイルを含む全ファイルで旧パスへの参照がない）
