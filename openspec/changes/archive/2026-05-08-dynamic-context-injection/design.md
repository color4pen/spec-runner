## Context

pipeline step の agent は現在 `request.md` の内容と branch 名だけを受け取る。リポジトリの動的状態（recent commits、diff stat、既存 spec/change 一覧）は含まれないため、agent は毎回 `git log` や `ls` を自力実行してターンを消費する。

データの流れは `CommandRunner.execute()` → `RuntimeStrategy.buildDeps()` → `PipelineDeps` → `StepExecutor.runAgentStep()` → `AgentRunContext` → adapter → `StepContext` → `step.buildMessage()` の 6 段変換。動的コンテキストはこの全経路を通過する必要がある。

## Goals / Non-Goals

**Goals:**
- `DynamicContext` 型を定義し、`collectDynamicContext()` で git log / diff stat / specs 一覧 / changes 一覧を収集する
- pipeline 実行前に 1 回だけ collect し、全 step に同一の snapshot を渡す
- propose / implementer / code-review の buildMessage が動的コンテキストを含むセクションを出力する
- git コマンド失敗時に pipeline を止めない（graceful degradation）
- `dynamicContext` が undefined の場合の後方互換性を維持する

**Non-Goals:**
- step ごとの動的再収集（将来の差分更新は別 request）
- request-create コマンドでの利用（コマンド C で実装）
- openspec CLI の specs/changes 一覧取得への置き換え（現時点は fs.readdir で十分）

## Decisions

### D1: StepContext に optional 追加

`StepContext` に `dynamicContext?: DynamicContext` を追加する。

**代替案: 専用サブタイプ `DynamicContextAwareStepDeps`**
→ AgentStep.buildMessage の統一シグネチャ `(state: JobState, deps: StepDeps)` が崩れる。`StepDeps = StepContext` の alias が分岐し、step ごとに異なる deps 型を要求するとジェネリクスが必要になり複雑度が跳ね上がる。optional 追加が現実的な妥協。

### D2: CommandRunner 後付け方式

`RuntimeStrategy.buildDeps()` のシグネチャは変更しない。`CommandRunner.execute()` で `buildDeps()` 呼び出し後に `collectDynamicContext()` を呼び、返された `PipelineDeps` に `dynamicContext` を設定する。

**代替案: buildDeps を async 化して内部で collect**
→ `RuntimeStrategy` interface + `LocalRuntime` / `ManagedRuntime` の 2 実装 + 全呼び出し元に波及する。collect はランタイム固有ではない（local/managed で同じ git コマンド）ため RuntimeStrategy の責務外。CommandRunner で後付けが最低コスト。

**代替案: buildDeps の引数に DynamicContext を追加**
→ シグネチャ変更は interface + 2 実装に波及する。collect は buildDeps の責務ではない。

### D3: 1 回 collect + snapshot セマンティクス

workspace セットアップ後、pipeline 実行前に 1 回だけ collect する。propose 時点では main..HEAD の diff がないので gitLog/diffStat は空になるが、それが正しい状態。implementer/code-review が最新 diff を必要とする場合は agent 自身が `git diff` を実行する。動的コンテキストは「初手のヒント」であり、agent の自力取得を代替するものではない。

### D4: 依存方向 — core 層から adapter 層を参照しない

`src/git/dynamic-context.ts`（core 層相当）は `src/adapter/claude-code/git-exec.ts`（adapter 層）を参照しない。`node:child_process` の `execFile` を直接使う。`git-exec.ts` は `spawn` ベースで adapter 固有の SpawnFn DI パターンを持つが、`collectDynamicContext` は単純な exec で十分。

### D5: AgentRunContext への追加と全経路転送

`PipelineDeps` → `AgentRunContext` → `StepContext` の 3 段階変換があるため、中間層にも追加が必要。

- `AgentRunContext` に `dynamicContext?: DynamicContext` を追加
- `StepExecutor.runAgentStep()` の ctx 組み立てに `dynamicContext: deps.dynamicContext` を含める
- `ClaudeCodeRunner` と `ManagedAgentRunner` が組み立てる `stepCtx: StepContext` に `ctx.dynamicContext` を含める

### D6: buildMessage での利用パターン

各 step の buildMessage 内部関数は opts オブジェクトパターンを使用しているため、`dynamicContext?: DynamicContext` を opts に追加する。undefined の場合はセクション全体を省略（`if (dynamicContext) { ... }`）。

- **propose**: specsList + changesList → 既存 spec との整合性を agent に意識させる
- **implementer**: gitLog + diffStat → propose が作った commit の内容を把握
- **code-review**: diffStat → レビュー対象の変更規模を初手で把握

## Risks / Trade-offs

- **[Risk] git コマンドが失敗する環境（CI、shallow clone）** → 各フィールドを空文字列/空配列にフォールバック。pipeline は停止しない
- **[Risk] 動的コンテキストが stale になる** → 1 回 collect のため pipeline 実行中にリポジトリが変わると stale になる。許容範囲（agent は自力で最新状態を取得できる）
- **[Trade-off] StepContext の肥大化** → optional フィールド 1 個の追加なので限定的。将来さらに増える場合は context bag パターンへの移行を検討
- **[Trade-off] PipelineDeps の mutable 書き換え** → `deps.dynamicContext = ...` は immutable パターンに反するが、buildDeps が返す deps オブジェクトは CommandRunner.execute() のローカルスコープ内でのみ変更されるため実害なし
