# refactor: Claude / Codex provider lifecycleのparity contractを固定する

## Meta

- **type**: refactoring
- **slug**: provider-lifecycle-parity-contract
- **base-branch**: main
- base: `main@c65bf4558d1a606a3e8177245ef441dd6d04f17e`
- **adr**: false
- sequence: R4a（R3b: #1111 / PR #1112 / archive PR #1113 の後、R4b の前）

## 背景

R1〜R3bで、review routingの循環、巨大な`RuntimeStrategy`依存、CommandSpec registryへの実処理集中、CLI handler内のprocess terminationを段階的に解消した。

次の構造上の集中点はlocal provider adapterのsession lifecycleである。現行mainの実測は次のとおり。

- `src/adapter/claude-code/agent-runner.ts`: **1,678行**
- `ClaudeCodeRunner.run()`: **line 495〜1,678、約1,184行**
- `src/adapter/codex/agent-runner.ts`: **888行**
- `CodexAgentRunner.run()`: **line 343〜888、約546行**
- 両者は同じ`AgentRunner.run(context): Promise<AgentRunResult>`を実装する
- lifecycleに関するテストはprovider別・機能追加別に存在するが、「同じ意味のシナリオでどこが共通し、どこが意図的に異なるか」を示す単一のcontract tableはない

この状態で直ちに`run()`をphase分割すると、既存のprovider差を誤って均したり、逆に偶然の実装差を新しい構造へ固定したりする危険がある。R4aではproduction実装を動かさず、現行挙動をcharacterizationしてR4b/R4cの比較基準を先に作る。

## 目的

Claude / Codexのagent session lifecycleを、同じsemantic scenarioから検証するprovider parity contractとして固定する。

ここでいうparityは「全フィールド・全処理を同一化すること」ではない。共通契約、provider固有の能力、意図的な非対応を明示し、後続refactoringがその境界を無自覚に変えない状態にする。

## 要件

### 1. lifecycle contract matrixを定義する

安定したcase IDを持つcontract tableを作り、少なくとも次を扱う。

- main work turnの正常完了
- completion report / `report_result`の初回成功
- report未取得時のsettle / follow-up retryとbudget枯渇
- post-work prompt
- output verification / output repair
- transient errorのretry成功、budget枯渇、non-transient errorの非retry
- inactivity timeout / abort
- context exhaustionと、providerが対応する場合のfresh-session rollover
- `modelUsage`、`contextMetrics`、`invocationMetrics`、`sessionRollovers`等のmetrics
- `completionReason`とtyped error code / hint
- `resultContent`、`toolResult`、`followUpAttempts`、`transientRetryAttempts`、`addedTurns`の整合

case ID一覧は期待値側に固定し、実装table自身から導出して「ケースを削除してもgreen」になる構造にしない。

### 2. 同じ意味の入力をprovider別fixtureへ変換して検証する

contract caseはprovider-neutralなsemantic scenarioを表し、Claude SDK eventとCodex SDK eventへの変換はprovider別fixture / harnessが担当する。

- 実SDK・外部APIは呼ばない
- 既存のdependency injectionとmock event streamを利用する
- raw SDK event shapeの一致は要求しない
- wall-clock、ログの偶然の順序、private helper名等の不安定な実装詳細を共通契約にしない
- `AgentRunResult`、retry / follow-up回数、emitされた安定event、error semantics等のobservable contractを比較する

### 3. provider差を分類して固定する

各case / fieldを少なくとも次へ分類する。

- **shared**: 両providerで同じ意味・同じ結果を要求する
- **provider-specific**: SDK能力または既存仕様により、値・取得方法が意図的に異なる
- **unsupported / absent**: providerが情報を提供せず、`undefined` / `null`であること自体が契約

現行`AgentRunResult`に記載されている差を維持する。例:

- `completionReportDiagnostics`: Codex固有
- `addedTurns` / `contextMetrics` / `invocationMetrics` / `touchedFiles` / `sessionRollovers`: 現状Claude側のみが提供するものを含む
- unavailableなmetricsを`modelUsage`等から推測生成しない

理由を説明できない差が見つかった場合、このIssue内で片方へ寄せず停止して報告する。

### 4. retry / turn accountingの既存意味を固定する

少なくとも次をproviderごとに検証する。

- main invocation回数
- transient retry回数と上限
- report follow-up回数と上限
- post-work / output-repair turn数
- `followUpAttempts`と`addedTurns`の既存関係
- retry時にsessionを継続するかfresh sessionへ移るか
- timeout / abort時に追加retryしない条件
- completion reasonとerror code

期待値を新しく理想化せず、現行挙動から採取して固定する。

### 5. coverage ratchetを置く

少なくとも以下を機械検出する。

- 必須case IDが固定一覧と一致する
- case IDが重複していない
- shared caseにClaude / Codex双方の期待値とfixtureがある
- provider-specific / unsupported caseには理由が明記されている
- provider追加時に暗黙skipされない

### 6. 既存テストを根拠として再利用する

既存のClaude / Codex個別テストを削除してcontract tableへ大量移植することを目的にしない。既存テストは詳細なSDK adapter regressionとして維持し、R4aでは後続のphase分割に必要な最小のcross-provider contractを追加する。

production codeを共有moduleへ移動しない。test helperの共有は可とするが、provider SDK型をshared production moduleへ漏らさない。

## 振る舞い不変条件

- prompt本文とfollow-up promptを変更しない
- retry種別、retry可能判定、budget、backoffを変更しない
- timeout / abort / rollover条件を変更しない
- report settle、post-work、output repairの順序と回数を変更しない
- `AgentRunResult`のfield、値、undefined / null semanticsを変更しない
- completion reason、error code、hintを変更しない
- usage / context / invocation metricsの算出・集約方法を変更しない
- progress event、stdout / stderr、verbose logのユーザー向け意味を変更しない
- provider選択・config解決・credential解決を変更しない

## 非対象

- Claude / Codexの`run()` phase分割（R4b / R4c）
- shared production lifecycle、base class、state machineの導入
- provider間の挙動差を解消・統一すること
- `AgentRunner` / `AgentRunResult` public contractの再設計
- retry、timeout、rollover、output repair policyの変更
- SDK version更新
- ManagedAgentRunner / DispatchingAgentRunnerの再設計
- R6のテスト配置整理
- unrelatedなadapter cleanup、dead code削除、format変更

## 受け入れ条件

- [ ] stable case IDを持つprovider lifecycle contract tableがある
- [ ] main work、report settle/retry、post-work/output repair、transient retry、timeout、context exhaustion、metrics、completion/errorをカバーする
- [ ] shared caseはClaude / Codex双方で実行される
- [ ] provider-specific / unsupported差が理由付きで明示され、期待値として固定される
- [ ] 必須ID、重複、provider coverage、暗黙skipを検出するratchetがある
- [ ] 実SDK・外部APIへ接続しないdeterministic testである
- [ ] 既存provider別テストを不要に削除・弱化しない
- [ ] Claude / Codex adapterのproduction behaviorに変更がない
- [ ] `AgentRunner` / `AgentRunResult` contractに変更がない
- [ ] provider SDK型がshared production moduleへ漏れない
- [ ] SpecRunner上のverificationがgreen
- [ ] R4b/R4cで同じcontract suiteを回帰基準として利用できる

## PR本文に載せる実測値

before / afterを同一基準で記載する。

- contract case総数
- shared / provider-specific / unsupportedの内訳
- Claude / Codexそれぞれの実行case数
- lifecycle領域別のcase数
- 追加・変更・削除したprovider test数
- production `agent-runner.ts`の変更行数（原則0）
- Claude / Codex `agent-runner.ts`総行数と`run()`行範囲
- contract作成で発見した未説明差分の件数
- value-import SCC数

数値が取得できない場合は推測で埋めず、取得不能理由を書く。

## 停止条件

以下が必要になった場合はスコープを広げず停止して報告する。

- parity testを成立させるためのproduction behavior変更
- どちらのprovider挙動を正とするかというproduct / policy判断
- retry budget、prompt、turn accounting、timeout、rollover意味の変更
- `AgentRunner` / `AgentRunResult` public contract変更
- production shared lifecycle抽象の導入
- provider固有SDK制約を隠すための偽の共通化
- flakyな実時間依存を避けるためにproduction構造変更が必要
- 新しいarchitecture layerまたはADRが必要な境界判断
