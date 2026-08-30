# review routing の value-import cycle を解消する

## Meta

- **type**: refactoring
- **slug**: review-routing-cycle-elimination
- **base-branch**: main
- **adr**: false

## 背景

reviewer / fixer / regression-gate の収束ロジックは純粋な判断を中心としているが、現在は `core/pipeline` と `core/step` の双方に分散し、実行時の value-import cycle を形成している。

PR #1098 merge 後の main `96f4db6a` で、少なくとも次の循環を再確認した。

```text
pipeline/reviewer-chain
  → step/fixer-helpers
  → pipeline/reviewer-chain

pipeline/reviewer-chain
  → step/regression-gate
  → pipeline/findings-ledger
  → step/fixer-helpers
```

既存の architecture tests は B-1〜B-18 と DSM closure の違反を検知しているが、同一 domain 層内の value-import SCC は対象外であり、この循環は既知の構造負債として残っている。

## 目的

review routing に関する I/O を持たない判断を中立な domain pure module へ集約し、依存方向を次へ収束させる。

```text
pipeline composition → review-routing ← step factories
```

pipeline は transition の合成を、step は message / I/O / agent definition を所有する。review-routing は pipeline または step factory の実装へ value import しない。

observable behavior は一切変更しない。

## Requirements

### 1. 中立な pure boundary

次の識別子・判断を、step factoryにもtransition builderにも属さない既存domain層内のpure moduleへ配置する。

- reviewer chain / fixer chain の名前と順序
- `REGRESSION_GATE_STEP_NAME`
- active reviewer の解決
- reviewer / fixer の recency 判定
- conformance から fixer へ戻る際に必要な純粋なcontext導出
- findings ledger が必要とする、step I/Oに依存しない読み取り・変換

module名や分割数は実装時に決めてよい。ただし、新しいarchitecture layerは追加しない。

### 2. 一方向依存

- pipeline compositionはreview-routingを利用してtransitionを構築する。
- step factoryはreview-routingから決定済みのchain / contextを取得する。
- review-routingから`core/pipeline`またはstep factoryへのvalue importを禁止する。
- type-only importは許容する。

### 3. 振る舞い不変

次を変更しない。

- STANDARD / FAST pipeline のstep順序とtransition
- custom reviewerの宣言順・実行順
- code-fixerの戻り先
- active reviewerのstartedAt比較とtie-break
- regression-gateの導入条件・ledger・verdict
- conformance findingのfixer routing
- loop budget、retry、attempt、session continuation
- prompt、result file、state / journal schema

### 4. cycle検査

相対importを解決してruntime value-import graphを検査するarchitecture testを追加する。

- `import type` / type-only exportはvalue edgeとして数えない。
- `src/`のvalue-import SCCを検出できること。
- 今回対象のcycleが再導入された場合に失敗すること。
- cycle detectorの導入に既存production moduleの読み込みや副作用を必要としないこと。

### 5. transition parity

STANDARD / FAST / custom reviewerあり・なしについて、変更前後のdescriptor / transition構造が一致することをテストで固定する。行数だけではなく、source step、outcome、destination、guard有無と順序を比較する。

## Non-goals

- reviewer、fixer、regression-gateの機能変更
- parallel reviewer実行方式の変更
- pipeline descriptorの公開契約変更
- RuntimeStrategy、agent runner、CommandSpecの同時整理
- test配置の移動
- historical archive / ADRの機械的書き換え

## Acceptance Criteria

- `src/`のruntime value-import SCCが0件。
- type-only cycleは失敗条件にならない。
- STANDARD / FAST / custom reviewer pipelineのtransition parity testがgreen。
- code-fixerの戻り先、regression-gate、findings ledger、conformance fix routingの既存テストがgreen。
- build / typecheck / lint / full test / smokeがすべてgreen。
- scope外のproduction behavior変更がない。
- pipeline-managed artifact以外の未追跡・未commit fileを残さない。

## Stop Conditions

次のいずれかが必要になった場合、実装範囲を広げずdecision-neededとしてhaltする。

- reviewer / fixerの振る舞い変更
- pipeline descriptorの外部契約変更
- 既存domain層では表現できない新しいlayer判断
- cycle解消とは無関係な大規模rename・test移動・runtime変更

## 実測

このrequestはアーキテクチャ改善計画R1の最初のdogfooding実測とする。PR / attestationで次を記録する。

### 構造指標

- value-import SCC: baseline 1組 → candidate 0
- 対象module / changed file数
- additions / deletions
- transition parity結果

### pipeline指標

- wall-clock duration
- total / step別cost
- input / output / cache read / cache write tokens
- step別attempt数・追加turn数
- verification再実行数
- halt / resume / operator interventionの有無と理由
- review findingsと修正後の再発有無
