# Spec: CommandHandler exit code 返却契約と process.exit の dispatch 境界集約

## Requirements

### Requirement: CommandHandler は exit code を返す単一契約である

`CommandHandler` 型 SHALL be `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<number>`。`CommandSpec.handler` に登録されるすべての handler MUST return an explicit numeric exit code on every terminating path、正常終了では明示的に `0`（または `EXIT_CODE.SUCCESS`）を返し、下位 primitive が exit code を返す場合はその値をそのまま返す。`Promise<void>` を返す handler、返却値を省略する handler、旧契約を吸収する adapter / shim / 並行 result contract は存在してはならない。

#### Scenario: 正常終了する command が 0 を返す

**Given** `specrunner job archive <slug>` が dispatch され、下位 primitive `runArchive` が `0` を返す
**When** handler が完了する
**Then** handler の返却値は `0` であり、handler 自身は process を終了させない

#### Scenario: 下位 primitive の non-zero exit code がそのまま透過する

**Given** `specrunner job archive <slug>` が dispatch され、下位 primitive `runArchive` が `7` を返す
**When** handler が完了する
**Then** handler の返却値は `7` であり、`0` や `1` への丸め込みは行われない

#### Scenario: handler 内の usage error が exit code として返る

**Given** `specrunner job archive` が `<slug>` と `--from-issue` のどちらも伴わずに dispatch される
**When** handler が排他チェックを評価する
**Then** stderr に現行と同一の usage error message と `ARCHIVE_USAGE` が出力され、handler は `EXIT_CODE.ARG_ERROR`（2）を返し、下位 primitive は呼ばれない

#### Scenario: すべての登録 handler が number 返却契約に適合する

**Given** `CommandSpec` tree に登録された 30 件の handler
**When** 各 handler の実装 module の戻り型注釈を静的に検査する
**Then** 30 件すべてが `Promise<number>` を宣言しており、`Promise<void>` を宣言する handler は 0 件である

### Requirement: process termination は CLI entrypoint が単独で所有する

Production `src/cli/**/*.ts`（テストを除く）は `process.exit` を呼び出しては MUST NOT である。process termination SHALL be owned by the dispatch boundary in `bin/specrunner.ts`, which receives the handler's returned exit code and terminates the process with it。`src/cli` 外の process lifecycle（signal handler 等）は本変更の対象外であり変更されない。

#### Scenario: src/cli に process.exit 呼び出しが存在しない

**Given** production の `src/cli/**/*.ts`（`__tests__` を除く）
**When** AST 走査で `process.exit` の call expression を数える
**Then** 件数は 0 である（コメント内の文字列は call expression として数えない）

#### Scenario: dispatch 境界が handler の返却値で process を終了する

**Given** dispatch された command の handler が exit code `7` を返す
**When** `bin/specrunner.ts` の dispatch が完了する
**Then** `process.exit` が `7` で 1 回だけ呼ばれる

#### Scenario: 正常終了時に余分な stderr 出力が発生しない

**Given** dispatch された command の handler が `0` を返す
**When** `bin/specrunner.ts` の dispatch が完了する
**Then** `process.exit` が `0` で呼ばれ、dispatch 境界は `Fatal:` を含むいかなる追加行も stderr に書き込まない

#### Scenario: process.exit の所有先が再分散していない

**Given** production の `src/**` と `bin/**`（テストを除く）
**When** `process.exit` の call expression を含むファイル集合を AST で列挙する
**Then** 集合は `bin/specrunner.ts` と、本変更の対象外である signal handler 2 ファイル（`src/core/runtime/local.ts`、`src/core/runtime/managed.ts`）のみからなる

### Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される

`FlagParseError` / `SpecRunnerError` / 予期しない error の共通変換 SHALL be performed only by the dispatch error boundary in `bin/specrunner.ts`。handler 内で同一の表示と exit だけを行っていた catch は削除され、error は上位へ伝播する。境界が出力する stderr は `maskSensitive` seam を経由し、secret を含まないメッセージについては現行と同一の文言・改行・出力先・順序で出力される。

#### Scenario: FlagParseError が境界で変換される

**Given** `specrunner run --issue abc my-slug` のように flag 値が型不正である
**When** dispatch が flag を parse する
**Then** stderr に現行と同一の error message と、command の detail help（無い場合は top-level USAGE）が出力され、process は exit code 2 で終了する

#### Scenario: SpecRunnerError が境界で変換される

**Given** dispatch された handler が `exitCode` 2 の `SpecRunnerError` を throw する
**When** dispatch error boundary が error を受け取る
**Then** stderr に `Error: <message>` と `Hint: <hint>` が現行と同一の順序・改行で出力され、process は当該 error の `exitCode` で終了する

#### Scenario: 予期しない error が境界で変換される

**Given** dispatch された handler が `SpecRunnerError` でも `FlagParseError` でもない error を throw する
**When** dispatch error boundary が error を受け取る
**Then** stderr に `Fatal: <message>` が出力され、process は exit code 1 で終了する

#### Scenario: 境界の stderr 出力が secret をマスクする

**Given** dispatch された handler が、token 形状の文字列（例: `sk-ant-` で始まる値）を message に含む error を throw する
**When** dispatch error boundary が error を出力する
**Then** stderr に出力される message では当該 token の本体が伏せられ、prefix のみが残る

### Requirement: domain 上意味のある catch と fallback は維持される

fallback / retry / error code 別分岐 / domain 固有メッセージへの変換を行う catch は MUST be preserved。共通変換と表示が一致しない catch を機械的に削除しては MUST NOT である。

#### Scenario: doctor は SpecRunnerError も Fatal として扱う既存挙動を維持する

**Given** `specrunner doctor` の下位処理が `SpecRunnerError` を throw する
**When** handler が error を受け取る
**Then** stderr に `Fatal: <message>` が出力され、handler は `EXIT_CODE.GENERAL_ERROR`（1）を返す（`Error:` / `Hint:` 2 行形式や `err.exitCode` には変換されない）

#### Scenario: doctor repair は独自 error 表示を維持する

**Given** `specrunner doctor repair <slug>` の下位処理が error を throw する
**When** handler が error を受け取る
**Then** stderr に現行と同一の `Error: <message>` 形式で出力され、handler は `EXIT_CODE.GENERAL_ERROR`（1）を返す

#### Scenario: job ls は GitHub token 不在時の fallback を維持する

**Given** GitHub token を解決できない環境で `specrunner job ls` が実行される
**When** handler が GitHub client の構築を試みて失敗する
**Then** error は上位へ伝播せず、GitHub client なしで job 一覧処理が続行され、その exit code が返る

#### Scenario: job start は config / token / origin 解決の domain メッセージを維持する

**Given** `specrunner job start <slug> --issue <n>` で config の読み込みが失敗する
**When** handler が failure を受け取る
**Then** stderr に現行と同一の `Failed to load config: <message>` が出力され、handler は `EXIT_CODE.GENERAL_ERROR`（1）を返す

### Requirement: CLI 契約と終了契約が base と candidate で同一である

`CommandSpec` 構造 SHALL continue to match the R3a base fixture。加えて、CLI の終了契約（exit code / stdout / stderr）を base と candidate の同一条件で比較する fixture ベースの test が存在し、少なくとも次の終了形を覆う: 正常終了 (0)、下位 primitive の non-zero 透過、handler 内 usage / semantic validation error、`FlagParseError`、`SpecRunnerError`、予期しない error、help / version / 引数なし、unknown command / unknown subcommand、repo 外 guard / worktree 内 guard、`--from-issue` / `--detach` 等の早期終了経路。base fixture は production 変更前の実装から採取され、candidate 実装に合わせて再生成されては MUST NOT である。

#### Scenario: CommandSpec 構造が base fixture と一致する

**Given** 現在の `COMMANDS` tree
**When** 正規化して `cli-contract.base.json` と比較する
**Then** 全項目（path / summary / flags / args / help / guards / visibility / aliasOf / handler の有無 / children）が一致する

#### Scenario: 終了契約が base fixture と全件一致する

**Given** 終了契約の case table に定義されたすべてのケース
**When** candidate 実装で各ケースを実行し、最初の `process.exit` 呼び出し時点の exit code・stdout・stderr を採取する
**Then** すべてのケースで base fixture の記録と一致する

#### Scenario: ケースの欠落が検出される

**Given** 終了契約 test が期待する case ID 一覧
**When** fixture に記録された case ID 集合と突き合わせる
**Then** 両者は完全一致し、いずれかのケースが欠落または追加されていれば test は失敗する

#### Scenario: guard の実行順序が維持される

**Given** worktree 内から、flag が不正な worktreeGuard 付き command が実行される
**When** dispatch が進行する
**Then** flag parse より先に worktree guard が発火し、worktree guard の error message と exit code 2 が観測される

### Requirement: 再分散を防ぐ architecture ratchet が存在する

`src/cli` への `process.exit` 再導入と handler 契約の逸脱 SHALL be detected mechanically by AST-based checks。検査はコメント文字列ではなく call expression / 型注釈ノードを対象とし、各検査には「違反を実際に検出できること」を示す regression guard を伴う MUST。

#### Scenario: src/cli への process.exit 再導入が検出される

**Given** ratchet の `process.exit` 検出関数
**When** `process.exit(1)` の call expression を含む合成ソースを与える
**Then** 検出関数は 1 件の違反を報告する

#### Scenario: コメント内の process.exit は違反として報告されない

**Given** ratchet の `process.exit` 検出関数
**When** `process.exit()` という記述を JSDoc コメント内にのみ含む合成ソースを与える
**Then** 検出関数は 0 件を報告する

#### Scenario: handler の契約逸脱が検出される

**Given** ratchet の handler 戻り型検査
**When** `CommandSpec` から参照される handler の 1 つが `Promise<void>` を宣言している状態を与える
**Then** 検査は当該 handler を違反として報告する

#### Scenario: entrypoint に command 名分岐が再出現していない

**Given** `bin/specrunner.ts` の AST
**When** `SwitchStatement` の有無と `spec.handler` 呼び出し箇所数を検査する
**Then** `SwitchStatement` は存在せず、`spec.handler` の呼び出しは 1 箇所のみである
