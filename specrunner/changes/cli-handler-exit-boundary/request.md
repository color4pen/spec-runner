# refactor: CommandHandlerをexit code返却契約へ変更しprocess.exitをdispatch境界へ集約する

## Meta

- **type**: refactoring
- **slug**: cli-handler-exit-boundary
- **base-branch**: main
- base: `main@de88d1b5cf74bc43a258e9629347da2356a308c3`
- **adr**: false
- sequence: R3b（R3a: #1108 / PR #1109 の後、R4a の前）

## 背景

R3a（#1108 / #1109）で、`CommandSpec` tree内のinline handlerをnamed handlerへ抽出した。現在は次の状態である。

- `CommandSpec`がcommand path / flags / args / help / guards / handler referenceの正本
- handler: 30件、所有module: 21件
- `CommandHandler`: `(parsed, ctx?) => Promise<void>`
- production `src/cli`内の `process.exit(...)`: **74件 / 24ファイル**
- `bin/specrunner.ts`内の `process.exit(...)`: **15件**
- 一部handlerが `SpecRunnerError` / unknown errorの表示とexit code変換まで所有しており、entrypointのerror boundaryと責務が重複している

R3aでは挙動を変えないためexit処理をそのままhandler側へ移した。本Issueはその後半として、command処理とprocess terminationを分離する。

## 目的

全CLI handlerを「終了コードを返す処理」に変更し、`process.exit`と共通error-to-exit変換をCLI entrypointへ集約する。

ユーザー向けobservable behaviorは変更しない。command名、flag、help、stdout / stderr、exit code、validation順序、guard順序、業務処理の実行条件を維持する。

## 要件

### 1. CommandHandlerをexit code返却契約へ変更する

`CommandHandler`を、成功・失敗を数値exit codeとして明示的に返す契約へ変更する。

```ts
export type CommandHandler = (
  parsed: ParsedArgs,
  ctx?: CommandContext,
) => Promise<number>;
```

- 全30 handlerを同じrequestで移行する
- 正常終了は明示的に `0` を返す
- 下位primitiveがexit codeを返す場合は、その値をそのまま返す
- 移行用の `Promise<void>`、optional result、旧handler adapterを残さない
- exit code以外の情報を運ばないため、新しいresult object / command bus / DI frameworkを導入しない

### 2. process.exitをCLI dispatch境界へ集約する

- production `src/cli`内の `process.exit(...)` を **74件から0件**にする
- handler内の早期終了は `return EXIT_CODE.*` または既存primitiveのexit code返却で表現する
- `bin/specrunner.ts`がhandlerの返却値を受け取り、process terminationを所有する
- help / version / unknown command / parse failure / repo guard / worktree guard等、既にentrypointが所有している終了処理は同じ境界内に維持してよい
- `src/cli`外のprocess lifecycleは本Issueで変更しない

### 3. error-to-exit変換をentrypointへ集約する

少なくとも次の共通変換は `bin/specrunner.ts` のdispatch error boundaryを正本とする。

- `FlagParseError` → 現行message / usage / exit 2
- `SpecRunnerError` → 現行 `Error:` / `Hint:` / `err.exitCode`
- 予期しないerror → 現行 `Fatal:` / exit 1

handler内のcatchが単に同じ表示とexitを行うだけなら削除して上位へ伝播させる。一方、fallback、retry、error code別分岐、domain上の意味変換を行うcatchは維持し、機械的に削除しない。

### 4. observable behaviorを完全に維持する

次を変更しない。

- stdout / stderrの文言、改行、出力先、出力順序
- exit code
- validationと排他チェックの順序
- help / usageの表示条件
- parser → worktree guard → context / repo guard → handlerの既存順序
- config / credential / GitHub host解決
- detach、issue起点、resume、reopen、archiveの実行意味
- `CommandSpec` treeおよびpublic CLI interface

### 5. CLI契約と終了契約をbase/candidateで固定する

R3aのbase fixtureによるCommandSpec構造比較を維持する。加えて、少なくとも次の終了形をbaseとcandidateの同一条件で比較する。

- 正常終了（0）
- 下位primitiveのnon-zero exit code透過
- handler内usage / semantic validation error
- `FlagParseError`
- `SpecRunnerError`
- 予期しないerror
- help / version / no args
- unknown command / unknown subcommand
- repo外 / worktree内guard
- `--from-issue`、`--detach`等の早期終了経路

テスト期待値を新実装へ合わせて変更しない。既存テストのprocess.exit mockを単にreturn expectationへ置換するだけでなく、stdout / stderr / exit codeの外部契約が同一であることを示す。

### 6. 再分散を防ぐratchetを追加する

少なくとも以下を機械検出する。

- production `src/cli/**/*.ts` の `process.exit` callが0件
- 全 `CommandSpec.handler` がnumberを返す単一契約に適合する
- `process.exit`の所有先がCLI entrypoint境界から再分散していない
- CommandSpecがCLI契約の唯一の正本であり続ける

コメント文字列ではなくcall expressionを検出できるAST検査を優先する。

## 非対象

- command名・flag・help・usage・出力・exit codeの変更
- parser / resolver / guard順序の再設計
- 下位primitiveやcore use caseの返却型再設計
- stdout / stderrをbuffered output objectへ変更すること
- `CommandResult`への将来情報追加を見越した抽象化
- `process.exitCode`への全面移行
- R4のprovider / session lifecycle分割
- unrelatedなCLI cleanup、dead code削除、format変更

## 受け入れ条件

- [ ] `CommandHandler`が `Promise<number>` の単一契約になる
- [ ] 全30 handlerが明示的なexit codeを返す
- [ ] production `src/cli`内の `process.exit(...)` が74件から0件になる
- [ ] process terminationが `bin/specrunner.ts` に集約される
- [ ] 共通の `FlagParseError` / `SpecRunnerError` / unknown error変換がdispatch error boundaryに一本化される
- [ ] domain上意味のあるcatch / fallbackは維持される
- [ ] CommandSpec構造がR3aのbase fixtureと一致する
- [ ] stdout / stderr / exit code / validation順序 / guard順序がbaseと一致する
- [ ] migration shim、旧handler adapter、並行result contractが残らない
- [ ] process.exit再導入を防ぐarchitecture ratchetがある
- [ ] SpecRunner上のverificationがgreen
- [ ] ユーザー向けobservable behaviorに差分がない

## PR本文に載せる実測値

before / afterを同一のAST集計または同一コマンドで記載する。

- `CommandHandler` return type
- 移行済みhandler数 / 全handler数
- production `src/cli`内のprocess.exit call数と対象ファイル数
- `bin/specrunner.ts`内のprocess.exit call数
- handler内で共通error-to-exit変換だけを行うcatch数
- migration shim / adapter数
- CLI終了契約のbase/candidate比較ケース数
- value-import SCC数

数値が取得できない場合は推測で埋めず、取得不能理由を書く。

## 停止条件

以下が必要になった場合はスコープを広げず停止して報告する。

- stdout / stderr / exit codeの変更
- parser / resolver / guard順序の変更
- 下位primitiveまたはcore domain resultの再設計
- command出力を新しいresult objectへ載せ替える必要
- public CLI interfaceの破壊
- R4のprovider lifecycle責務への変更
- 新しいarchitecture layerまたはADRが必要な境界判断
