# RuntimeStrategy の read-only consumer を consumer-owned capability へ分割する

## Meta

- **type**: refactoring
- **slug**: runtime-read-capability-split
- **base-branch**: main
- **adr**: false

## 背景

R1 では review routing の value-import cycle を解消した。次の構造上の問題は、`RuntimeStrategy` が workspace、agent、job state、artifact commit、revision/worktree inspection まで抱える広い facade になっている点である。

現状、read-only な leaf consumer の多くは実際には 1〜2 メソッドしか使わない一方、`RuntimeStrategy` 全体を依存型として受け取っている。そのため、次の問題が生じている。

- consumer が不要な runtime 能力まで認識する
- test fake が全体 interface に引きずられる
- `as unknown as RuntimeStrategy` のような forced cast が残る
- read-only inspection と mutation/lifecycle の責務境界が型で表現されない
- runtime facade の変更影響が leaf module まで波及しやすい

依存関係更新をすべて取り込んだ現在の `main`（`a377b832`）を基準に進める。

## 目的

read-only な runtime 情報だけを使う consumer が、巨大な `RuntimeStrategy` 全体ではなく、自身が必要とする最小の capability に依存する構造へ変更する。

`LocalRuntimeStrategy` / `ManagedRuntimeStrategy` は引き続き composition root 向け facade として各 capability を提供する。今回、mutation/lifecycle 系まで分割し切ることは目的にしない。

## Requirements

### 1. consumer-owned capability を導入する

read-only consumer ごと、または意味のある最小単位ごとに capability interface を定義する。

対象候補は以下。

- changed-file derivation
  - `canDeriveChangedFiles`
  - `listChangedFiles`
- commit inspection
  - `captureHeadSha`
  - `listCommitChangedFiles`
  - `readFileAtCommit`
- revision content inspection
  - `readRevisionContent`
- worktree inspection
  - `listWorktreeChanges`
  - `snapshotMainCheckoutGuard`

最終的な interface の個数・名称・配置は consumer の責務境界から決めること。上記をすべて含む単一の `ReadonlyRuntimeStrategy` を新設して mega-interface を名前だけ変える形にはしない。

現在 production consumer が見当たらない `lastCommitTouchingPath` は、使用箇所を作るためだけに capability へ移さない。削除判断は R2c または別途根拠を示せる変更で行う。

### 2. leaf consumer の依存を最小化する

少なくとも以下の read-only leaf consumer を確認し、それぞれが必要とする最小 capability だけを受け取るようにする。

- `scope-check`
- `runtime-capability-gate`
- `no-op-detect`
- `prior-round-context`
- `custom-reviewer-round-context`
- `post-fix-context`
- `finding-recency`
- `achieved-assurance`

すでに `Pick` や局所 interface を使っている箇所は、重複する匿名契約を増やさず、明示的な consumer-owned capability として整理する。

executor や parallel review round など、read-only と mutation/lifecycle の双方を扱う orchestration 層については、無理に facade 依存を除去しない。必要なら小さい capability の合成で表現するが、R2b の責務を先取りしないこと。

### 3. runtime 実装との接続を維持する

- `LocalRuntimeStrategy` と `ManagedRuntimeStrategy` は、導入した capability を満たす
- composition root / factory では既存の `RuntimeStrategy` facade を維持してよい
- production method をテスト都合で optional にしない
- provider/SDK 固有の分岐や依存バージョンを変更しない

### 4. 現在の観測可能な振る舞いを維持する

特に以下を変えない。

- `canDeriveChangedFiles === false` の short-circuit
- optional capability が存在しない場合の現在の fallback
- `unavailable` を含む discriminated union の意味
- managed runtime の fail-closed/fallback 挙動
- finding recency が判定不能へ degrade する条件
- prior/post-fix context が `null` へ degrade する条件
- archive assurance の fail-closed 挙動
- changed-file / worktree / revision inspection の結果と順序

削除済みの bite-evidence / isolated test execution capability は再導入しない。

### 5. アーキテクチャ文書を追従させる

`architecture/components.md` など関連文書を更新し、次を明示する。

- `RuntimeStrategy` は composition root 向け facade
- read-only leaf consumer は consumer-owned capability に依存する
- concrete runtime は必要な capability を実装する
- RuntimeStrategy の責務説明に残る、削除済みの「commit 時テスト実行」等の記述を現状に合わせる

既存レイヤーの責務を変えるのではなく依存境界を明確化する変更なので ADR は不要とする。新レイヤーや外部公開契約が必要になった場合は Stop Condition とする。

## Non-goals

- mutation/lifecycle capability の全面分割（R2b）
- `RuntimeStrategy` facade の廃止（R2c）
- runtime factory / provider selection の再設計
- Local/Managed runtime の動作変更
- SDK 更新、依存関係更新
- unused method の一括削除
- テスト実行・bite-evidence 機構の再導入
- 機能追加や CLI/UI の変更

## Acceptance Criteria

- [ ] 対象となる read-only leaf consumer が `RuntimeStrategy` 全体を import/parameter type として要求しない
- [ ] capability は consumer-owned な最小契約として定義され、単一の新 mega-interface に集約されていない
- [ ] `LocalRuntimeStrategy` / `ManagedRuntimeStrategy` が必要な capability を満たす
- [ ] 対象 consumer の test fake は必要な capability だけで構築できる
- [ ] 対象箇所の forced cast を除去し、新たな `as unknown as RuntimeStrategy` を追加していない
- [ ] optional/fallback/fail-closed semantics が既存テストで維持される
- [ ] read-only capability ごとの Local/Managed contract test、または同等の executable proof がある
- [ ] 選定した leaf consumer が full `RuntimeStrategy` へ戻らない architecture/compile-time test がある
- [ ] architecture 文書が実装後の責務と依存方向に一致する
- [ ] build / typecheck / lint / full test / smoke が green
- [ ] 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

## 実測

PR 本文に、少なくとも以下の before/after を記録する。

基準: `main@a377b832`

- `src/core/runtime/runtime-strategy.ts`: 793 lines
- base `RuntimeStrategy`: 28 methods
- 同ファイル内の `unknown` token: 21
- production の `RuntimeStrategy` import: 19（raw count。PR では集計条件も記載）
- `as unknown as RuntimeStrategy`: 6 occurrences
- full-interface consumer 数
- capability ごとの consumer 数
- 対象 test fake の forced cast 数

このリクエストで全 facade 依存をゼロにすることは要求しないが、read-only leaf consumer の full-interface 依存数は単調減少すること。

## Stop Conditions

以下が必要になった時点で実装を止め、issue に観測事実と選択肢を報告する。

- read-only 分割だけでは既存の観測可能な振る舞いを維持できない
- Local/Managed runtime の意味や fallback policy の変更が必要
- mutation/lifecycle 分割を同時に行わないと成立しない
- 新しい architecture layer または外部公開/plugin contract が必要
- provider/SDK integration の変更が必要
- `lastCommitTouchingPath` など unused method の削除に、外部利用有無の判断が必要
