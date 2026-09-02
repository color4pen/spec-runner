# refactor: RuntimeStrategy の whole-port 依存と移行 shim を撤去する

## Meta

- **type**: refactoring
- **slug**: runtime-strategy-convergence
- **base-branch**: main
- base: `main@76490a0429eb8dec0cee6ed135d28ae28b724d08`
- **adr**: false
- sequence: R2c（R1 → R2a → R2b の後、R3 の前）

## 背景

R1〜R2bで production consumer の mutation/read 依存は capability 単位まで縮小できた。一方、Command層とcomposition rootには、まだ `RuntimeStrategy & PipelineDepsBuilder` という全体依存が残っている。

現行mainの残存状況:

- `RuntimeStrategy`: 783行・24メソッド
- `RuntimeStrategy & PipelineDepsBuilder` を要求するproduction箇所: 5系統
  - `CommandRunner`
  - `PipelineRunCommand`
  - `ResumeCommand`
  - `BootstrapResult`
  - runtime factory
- テストfake都合でoptionalのままになっているメソッド: 10
- optional穴を実装クラス側だけで閉じる `RealRuntimeStrategy`: 1
- `Pick` を受けるcapability導出shim: 2
- `as unknown as RuntimeStrategy`: 2（`tests/pipeline-sole-committer-e2e.test.ts`）

その結果、productionでも以下のfail-open/compatibility処理が残っている。

- `assertProviderReadiness` の存在確認
- `assertNoDuplicateLiveJob?.(...)`
- `reloadJobState` の存在確認
- requiredな `ChangedFilesCapability.canDeriveChangedFiles` に対するoptional chaining
- 「RuntimeStrategy-typed test fakes may omit it」という理由のoptional定義

これは実行時の任意性ではなく、巨大fakeを作りやすくするためにproduction契約を弱めた状態である。

## 目的

Command実行に必要な契約をconsumer-ownedなrequired capabilityとして明示し、内部production codeから `RuntimeStrategy` 全体依存をなくす。

Local/Managed runtimeは引き続きcomposition rootで各契約を構成するfacadeとして維持する。クラスの物理分割やprovider/session lifecycleの再設計は行わない。

## 要件

### 1. Command lifecycle契約を明示する

`CommandRunner` が実際に使う責務を、用途別のrequired contractとして定義する。

少なくとも以下を区別できること。

- provider readiness
- duplicate live-job guard / job bootstrap
- workspace setup / cleanup registration / teardown
- job state persist / reload
- pipeline dependency build

命名やファイル分割は実装判断とするが、`Pick` で切り出さないこと。

### 2. Command層のwhole-port依存を撤去する

次の型から `RuntimeStrategy & PipelineDepsBuilder` を除去し、明示的なcontract compositionを受け取るようにする。

- `CommandRunner`
- `PipelineRunCommand`
- `ResumeCommand`

オーケストレーターが複数capabilityを合成して受け取ること自体は許容する。ただし、未使用メソッドまで露出する巨大portに戻さないこと。

### 3. composition rootの型を更新する

- runtime factoryの戻り値
- `BootstrapResult.runtime`

を新しい明示的composition型へ更新する。

`LocalRuntime` / `ManagedRuntime` は構造的に必要なcontractを満たしてよい。runtime kindによる分岐をconsumerへ持ち込まないこと。

### 4. fake都合のoptionalを撤去する

production経路で実際に必要な以下の処理はrequired契約にする。

- provider readiness
- duplicate live-job guard
- job state reload
- changed-files derivation可否

存在確認・optional chainingによるskipをなくし、fake側をtyped builder/helperで構成する。

その他のoptionalメソッドも利用箇所と実行時意味を確認し、「test fakeが省略できるため」だけのoptionalは撤去する。

### 5. 移行shimを収束させる

- `RealRuntimeStrategy` のoptional-hole補完を撤去する
- `deriveCommitInspectionCapability`
- `deriveRevisionContentCapability`

のような `Pick` ベースの導出shimを撤去し、composition rootで明示的なcapability objectまたはtyped adapterを注入する。

`runtime-capability-gate.ts` に残るoptional chainingと旧契約の説明も更新する。

### 6. 残存double castをゼロにする

`tests/pipeline-sole-committer-e2e.test.ts` の2件の `as unknown as RuntimeStrategy` を、必要capabilityだけを満たすtyped fake/builderへ置換する。

### 7. 公開互換性を扱う

内部production consumerは `RuntimeStrategy` を参照しないこと。

`RuntimeStrategy` が外部公開型として互換維持を必要とする場合のみ、deprecatedなboundary-only compatibility typeとして残してよい。その場合も内部で使用せず、PR本文に根拠と削除候補releaseを記載する。

公開API破壊が必要と判明した場合は、このIssue内で黙って削除せず停止して報告する。

## 振る舞い不変条件

構造変更の前後で、少なくとも以下の順序・条件を維持する。

- provider readinessは副作用を伴うprepare処理より前に実行される
- duplicate live-job guardはjob bootstrapより前に実行される
- workspace setup、state persist/reload、deps build、cleanup registration、teardownの順序を変えない
- 既存worktreeを使うresume時のreload条件を変えない
- setup失敗時のstate記録とcleanup handleの扱いを変えない
- teardownの実行回数・例外時挙動を変えない
- Local/Managed間の既存差異を変えない
- CLIのユーザー向け振る舞い・出力・終了コードを変えない

## 非対象

- `LocalRuntime` / `ManagedRuntime` クラスの物理分割
- provider SDK・session lifecycleの再設計
- CommandSpecの整理、handler抽出（R3）
- agent adapter/lifecycle整理（R4）
- archive/reopen/Actionsの仕様変更
- read-only capabilityの意味変更
- 新しいDI frameworkやservice locatorの導入

## 受け入れ条件

- [ ] productionに `RuntimeStrategy & PipelineDepsBuilder` が0件
- [ ] `CommandRunner` とsubclassがfull `RuntimeStrategy` に依存しない
- [ ] productionのrequired lifecycle処理にoptional call/存在確認がない
- [ ] `RealRuntimeStrategy` が0件
- [ ] `Pick` ベースの導出shimが0件
- [ ] `as unknown as RuntimeStrategy` が0件
- [ ] test fakeはtyped builder/helperで必要contractを満たす
- [ ] Local/Managed双方についてcommand lifecycleのcontract testがある
- [ ] full-port依存とfake都合optionalの再導入を防ぐarchitecture ratchetがある
- [ ] SpecRunner上の既存verificationがgreen
- [ ] ユーザー向け挙動・出力・終了コードに差分がない

## PR本文に載せる実測値

before / afterを同一コマンド・同一集計方法で記載する。

- `runtime-strategy.ts` 行数
- `RuntimeStrategy` メソッド数
- productionのfull-interface import/reference数
- `RuntimeStrategy & PipelineDepsBuilder` 件数
- fake都合optionalメソッド数
- `RealRuntimeStrategy` 件数
- `Pick` 導出shim件数
- `as unknown as RuntimeStrategy` 件数
- capabilityごとのproduction consumer数 / test fake数

数値が取れない場合は推測で埋めず、取得不能理由を書くこと。

## 停止条件

以下が必要になった場合は、スコープを広げず停止して報告する。

- 実行順序やユーザー向け挙動の変更
- 公開APIの破壊
- provider選択・runtime factory semanticsの変更
- Managed固有の永続化/cleanup semanticsの変更
- R3またはR4の責務再設計
- 新規ADRが必要な境界変更
