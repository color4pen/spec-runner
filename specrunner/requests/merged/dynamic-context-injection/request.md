# pipeline step にリポジトリの動的コンテキストを注入する

## Meta

- **type**: new-feature
- **slug**: dynamic-context-injection

## 背景

現在 agent が受け取る情報は request.md の内容と branch 名だけで、リポジトリの動的な状態（最近の commit、変更差分、既存 spec 一覧）は含まれない。agent は毎回 git log や ls を自力で実行する必要があり、ターン消費と情報漏れの原因になっている。

CLI がリポジトリ情報を事前に収集し、各 step の buildMessage に注入することで、agent は初手から正確なコンテキストを持って作業できる。

この基盤は request-create（対話コマンド C）の前提でもある。request-create は RuntimeStrategy.query() 経由で agent にリポジトリ情報を渡す必要があるが、収集ロジックがなければ何も渡せない。

## 要件

### 1. DynamicContext 型の定義

1. `src/git/dynamic-context.ts` に `DynamicContext` インターフェースを定義する

```typescript
interface DynamicContext {
  gitLog: string;      // main..HEAD の直近 commit（最大 20 件）
  diffStat: string;    // main..HEAD の diff --stat 出力
  specsList: string[];  // openspec/specs/ 配下の .md ファイル一覧
  changesList: string[]; // openspec/changes/ 配下のディレクトリ一覧
}
```

2. 同ファイルに `collectDynamicContext(cwd: string, branch: string): Promise<DynamicContext>` を実装する。git コマンドの実行には `node:child_process` の `execFile` を使う（`src/adapter/claude-code/git-exec.ts` は adapter 層のため core/git からの参照は依存方向違反）。コマンド失敗時は該当フィールドを空文字列 / 空配列にする（pipeline を止めない）

### 2. StepContext への追加

3. `StepContext`（`src/core/types.ts:17`）に `dynamicContext?: DynamicContext` を追加する。optional にすることで既存テストとの互換性を維持する

### 3. buildDeps での注入

4. `RuntimeStrategy.buildDeps()` のシグネチャは変更しない。代わりに `CommandRunner.execute()` で `collectDynamicContext()` を呼び、返された `PipelineDeps` に `dynamicContext` を設定する（runner.ts L105 付近）

```typescript
// Step 3: buildDeps
const deps: PipelineDeps = this.runtime.buildDeps(config, repo, request, slug, workspace);
deps.dynamicContext = await collectDynamicContext(workspace.cwd, jobState.branch ?? "main");
```

collect は workspace セットアップ後・pipeline 実行前の 1 回だけ。step ごとの再収集はしない（propose 時点では diff がないので空になるが、それが正しい状態）

### 4. AgentRunContext と AgentRunner での転送

PipelineDeps → AgentRunContext → StepContext の 3 段階変換があるため、中間層にも追加が必要。

5. `AgentRunContext`（`src/core/port/agent-runner.ts:25`）に `dynamicContext?: DynamicContext` を追加する

6. `StepExecutor.runAgentStep()`（`src/core/step/executor.ts:108-120`）の ctx 組み立てに `dynamicContext: deps.dynamicContext` を含める

7. `ClaudeCodeRunner`（`src/adapter/claude-code/agent-runner.ts:85-97`）と `ManagedAgentRunner`（`src/adapter/managed-agent/agent-runner.ts:261-273`）が組み立てる `stepCtx: StepContext` に `ctx.dynamicContext` を含める

### 5. buildMessage での利用（propose / implementer / code-review）

各 buildMessage 内部関数のシグネチャは現行パターン（opts オブジェクトに個別フィールドを渡す）に合わせ、`dynamicContext?: DynamicContext` を opts に追加する。

8. propose の `buildInitialMessage()`（`src/prompts/propose-system.ts`）に動的コンテキストセクションを追加する。specsList と changesList を渡して、既存 spec との整合性を agent に意識させる

9. implementer の `buildImplementerInitialMessage()`（`src/prompts/implementer-system.ts`）に gitLog と diffStat を追加する。propose が作った commit の内容を implementer が把握できる

10. code-review の `buildCodeReviewInitialMessage()`（`src/prompts/code-review-system.ts`）に diffStat を追加する。レビュー対象の変更規模を初手で把握できる

11. 各 buildMessage で `deps.dynamicContext` が undefined の場合はセクションを省略する（後方互換）

### 6. テスト

12. `collectDynamicContext()` のユニットテスト: git コマンドの出力をパースして正しい型を返すこと
13. `collectDynamicContext()` で git コマンドが失敗した場合にフォールバック値を返すこと
14. 各 buildMessage が dynamicContext あり/なしで正しく動作すること
15. `CommandRunner.execute()` で deps.dynamicContext が設定されることの統合テスト

## architect 評価済みの設計判断

- **StepContext に optional 追加**: StepContext は「Step が実際にアクセスするフィールドの最小セット」だが、専用サブタイプ（DynamicContextAwareStepDeps）を作ると AgentStep.buildMessage の統一シグネチャが崩れる。optional 追加が現実的な妥協
- **CommandRunner 後付け方式**: buildDeps を async 化すると interface + 2 実装 + 全呼び出し元に波及する。collect はランタイム固有ではない（local/managed で同じ git コマンド）ため RuntimeStrategy の責務外。CommandRunner で後付けが最低コスト
- **1 回 collect**: propose 時点で gitLog/diffStat は空だが正しい状態。implementer/code-review が最新 diff を必要とする場合は agent 自身が git diff を実行する。動的コンテキストは「初手のヒント」であり、agent の自力取得を代替するものではない
- **依存方向**: `src/git/dynamic-context.ts`（core 層）から `src/adapter/claude-code/git-exec.ts`（adapter 層）を参照しない。`node:child_process` の execFile を直接使う

## スコープ外

- step ごとの動的再収集（将来の差分更新は別 request）
- request-create コマンドでの利用（C で実装）
- openspec CLI の specs/changes 一覧取得への置き換え（現時点は fs.readdir で十分）

## 受け入れ基準

- [ ] `DynamicContext` 型が定義され、`collectDynamicContext()` が実装されている
- [ ] `StepContext` に `dynamicContext?: DynamicContext` が追加されている
- [ ] `CommandRunner.execute()` で collect → deps 注入のフローが動作する
- [ ] `AgentRunContext` に `dynamicContext` が追加され、StepExecutor → AgentRunner → buildMessage の全経路で転送される
- [ ] propose / implementer / code-review の buildMessage が動的コンテキストを含める
- [ ] dynamicContext が undefined の場合、既存の動作が変わらない
- [ ] git コマンド失敗時に pipeline が止まらない
- [ ] `bun run typecheck && bun run test` が green
