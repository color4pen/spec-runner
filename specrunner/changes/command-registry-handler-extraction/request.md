# refactor: CommandSpec registry から inline handler を command module へ抽出する

## Meta

- **type**: refactoring
- **slug**: command-registry-handler-extraction
- **base-branch**: main
- base: `main@483c75f715e2f6429684b5d52d711239559f4cea`
- **adr**: false
- sequence: R3a（R1 → R2a → R2b → R2c の後、R3b の前）

## 背景

R1〜R2cで、review routing の循環と巨大な runtime contract への依存を解消した。次の構造上の集中点は `src/cli/command-registry.ts` である。

現行mainの実測:

- `command-registry.ts`: 1,696行
- inline `handler: async ...`: 29件
- registry内の `process.exit(...)`: 67件
- registryが parser / help / dispatch の正本である一方、command実処理、filesystem、credential、GitHub client生成、出力・終了処理まで同じファイルに混在している
- named handlerへ分離済みの経路もあるが、多くはCommandSpecリテラル内に実装が残る

このため、CLI契約の宣言変更と実処理の変更が同じ巨大ファイルへ集中し、command単位の変更影響と所有境界が読み取りにくい。

## 目的

CommandSpecをcommand path / flags / args / guards / help / named handler referenceの正本として維持したまま、inline handler実装をcommand別またはcommand family別moduleへ抽出する。

このIssueはコードの純粋な移動と依存整理に限定する。`process.exit`やhandler返却契約の再設計はR3bで行い、ユーザー向け挙動は変更しない。

## 要件

### 1. inline handlerをnamed handlerへ置換する

`COMMANDS`ツリー内の29件のinline handlerを抽出し、registryからnamed functionとして参照する。

抽出先はCLI commandまたはcommand familyが所有するmoduleとし、巨大な単一handlerファイルへ丸ごと移さないこと。既存の `runXxx` / `executeXxx` moduleを自然に拡張できる場合は再利用してよい。

### 2. CommandSpecを唯一のCLI契約正本として維持する

次の宣言は引き続きCommandSpec treeが所有する。

- command path / subcommand hierarchy
- flags / positional args
- aliases
- `requiresRepo`
- `worktreeGuard`
- visibility
- help / summary
- handler reference

handler module側に並行するcommand registry、flag定義、help定義を作らないこと。

### 3. registryとhandlerの依存方向を一方向にする

registryはhandlerをimportして参照する。handler moduleからregistry実装へのvalue importは禁止する。

handler signatureの共有が必要なら、`CommandHandler`等の型を中立なtype-only contract moduleへ移してよい。循環をcast、dynamic import、service locatorで隠さないこと。

### 4. 実処理の意味を変えずに移動する

以下を含む処理は、順序・分岐・例外処理を維持して抽出する。

- config / credential解決
- GitHub client生成
- filesystem / worktree操作
- CommandContextの利用
- stdout / stderr / logger出力
- `SpecRunnerError`の扱い
- `process.exit`の呼び出し条件とexit code

registry内の `process.exit` は抽出により0件になるが、R3aではexit処理を集約・削減・return contract化しない。既存のexit callは意味を変えずhandler側へ移し、R3bの対象として残す。

### 5. CLI契約の同一性を固定する

変更前後で少なくとも次を構造比較またはsnapshotで固定する。

- canonical command path一覧
- alias解決
- flags / positional args
- help / usage
- `requiresRepo` / `worktreeGuard`継承
- unknown command / unknown subcommand
- stdout / stderr
- exit code
- repo内外およびworktree内外のguard挙動

テストの期待値を新実装に合わせて意味変更しないこと。

### 6. 再集中を防ぐratchetを追加する

少なくとも以下を機械検出する。

- CommandSpec tree内のinline handlerが0件
- `command-registry.ts`内の業務I/O実装または `process.exit` の再導入
- handler moduleからcommand-registryへのvalue-import cycle
- CommandSpec以外の並行CLI契約正本

検出方法はAST等の構造検査を優先し、コメントや文字列で誤検知する単純grepだけに依存しないこと。

## 振る舞い不変条件

- command名、subcommand、aliasを変えない
- flag名、default、必須性、組み合わせ検証を変えない
- help / usageの内容と表示条件を変えない
- parser / resolve / dispatch順序を変えない
- repo / worktree guardの実行条件と順序を変えない
- config、credential、GitHub host解決の条件を変えない
- stdout / stderr、log level、exit codeを変えない
- detach、resume、reopen、archive、issue起点commandの実行意味を変えない
- public exportを破壊しない

## 非対象

- handlerをexit codeまたはtyped command resultへ変更すること（R3b）
- `process.exit`をdispatch境界へ集約すること（R3b）
- CommandSpec、parser、help、dispatchの再設計
- command名・flag・help・出力・exit codeの変更
- runtime capabilityの再設計（R2は完了済み）
- provider/session lifecycleの再設計（R4）
- 新しいDI framework、service locator、command busの導入
- unrelatedなCLI dead code削除やformat変更

## 受け入れ条件

- [ ] `command-registry.ts`のinline handlerが29件から0件になる
- [ ] registryはCLI metadataとnamed handler referenceを中心とする宣言ファイルになる
- [ ] registry内のfilesystem / credential / GitHub client生成等のcommand実処理が0件になる
- [ ] registry内の `process.exit` が67件から0件になる
- [ ] R3a全体ではexit callの条件・順序・exit codeを変更せず、handler側に保持する
- [ ] handler moduleからregistryへのvalue-import cycleが0件
- [ ] CommandSpecがparser / help / dispatchの唯一の正本であり続ける
- [ ] CLI command / flag / alias / help / guardの構造比較が変更前後で一致する
- [ ] stdout / stderr / exit codeの既存契約テストがgreen
- [ ] inline handlerとregistryへの実処理再導入を防ぐarchitecture ratchetがある
- [ ] SpecRunner上の既存verificationがgreen
- [ ] ユーザー向けobservable behaviorに差分がない

## PR本文に載せる実測値

before / afterを同一コマンド・同一集計方法で記載する。

- `command-registry.ts`行数
- inline handler数
- named handler reference数
- registry内 `process.exit` 件数
- repository全体の `process.exit` 件数（R3aで意図せず削減していないこと）
- registryのfilesystem / credential / GitHub client関連value import数
- 抽出したhandler module数とcommand family対応表
- value-import SCC数
- CLI contract snapshot / structural comparisonの対象command数

数値が取れない場合は推測で埋めず、取得不能理由を書くこと。

## 停止条件

以下が必要になった場合は、スコープを広げず停止して報告する。

- CLIのユーザー向け挙動、出力、exit codeの変更
- handler return contractまたはdispatch error boundaryの変更
- CommandSpecを正本から外す設計
- public APIの破壊
- R2またはR4の責務再設計
- 新しいarchitecture layerやADRが必要な境界変更
