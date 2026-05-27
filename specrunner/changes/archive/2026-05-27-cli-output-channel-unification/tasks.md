# Tasks: CLI 出力チャネル統合 + マスキング全適用

## Task 1: logger/stdout.ts の拡張と出力先変更

**ファイル**: `src/logger/stdout.ts`

1. `logInfo` の出力先を `process.stdout.write` → `process.stderr.write` に変更
2. `logStep` の出力先を `process.stdout.write` → `process.stderr.write` に変更
3. `logSuccess` の出力先を `process.stdout.write` → `process.stderr.write` に変更
4. `stdoutWrite` に `maskSensitive` を適用: `process.stdout.write(message)` → `process.stdout.write(maskSensitive(message))`
5. 新関数 `logResult(message: string): void` を追加。実装: `process.stdout.write(maskSensitive(message) + "\n")`。stdout に結果データを書く正規経路。

**検証**: 既存テストが `logInfo` 等の出力先変更を反映しているか確認。壊れたテストを修正。

## Task 2: DomainEvent の拡張

**ファイル**: `src/core/event/types.ts`

DomainEvent union type に以下を追加:
- `"pipeline:iteration:start"`
- `"pipeline:iteration:verdict"`
- `"pipeline:iteration:exhausted"`
- `"pipeline:summary"`
- `"pipeline:cli-step"`

EventPayloadMap に以下を追加:
```typescript
"pipeline:iteration:start": { step: string; iteration: number; maxIterations: number };
"pipeline:iteration:verdict": { step: string; iteration: number; verdict: string; action: "done" | "halt" | "fixer" };
"pipeline:iteration:exhausted": { step: string; iteration: number; maxIterations: number };
"pipeline:summary": { step: string; iterations: number; finalVerdict: string };
"pipeline:cli-step": { step: string; verdict?: string };
```

## Task 3: pipeline.ts の stdoutWrite を EventBus emit に変換

**ファイル**: `src/core/pipeline/pipeline.ts`

1. `import { stdoutWrite }` を削除
2. 以下の `stdoutWrite` 呼び出しを対応する `this.events.emit()` に置き換え:

| 行（概算） | 現在 | 変換先 |
|---|---|---|
| L167 | `stdoutWrite(\`[iter ${loopIter}/${this.maxIterations}] starting ${currentStep}\n\`)` | `this.events.emit("pipeline:iteration:start", { step: currentStep, iteration: loopIter, maxIterations: this.maxIterations })` |
| L189 | `stdoutWrite(\`[step] ${currentStep}\n\`)` | `this.events.emit("pipeline:cli-step", { step: currentStep })` |
| L229 | `stdoutWrite(\`[step] ${currentStep}: ${stepVerdict}\n\`)` | `this.events.emit("pipeline:cli-step", { step: currentStep, verdict: stepVerdict })` |
| L265 | `stdoutWrite(\`[iter ${loopIter}] ... approved → done\n\`)` | `this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: "approved", action: "done" })` |
| L267 | `stdoutWrite(\`[iter ${loopIter}] ... escalation → halt\n\`)` | `this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: outcome, action: "halt" })` |
| L322 | `stdoutWrite(\`[iter ...] retries exhausted ...\n\`)` | `this.events.emit("pipeline:iteration:exhausted", { step: nextStep, iteration: nextLoopIter, maxIterations: this.maxIterations })` |
| L341 | `stdoutWrite(\`[iter ...] retries exhausted ...\n\`)` | `this.events.emit("pipeline:iteration:exhausted", { step: exhaustedLoopName, iteration: this.maxIterations, maxIterations: this.maxIterations })` |
| L350 | `stdoutWrite(\`[iter ${loopIter}] ... needs-fix → spawning fixer\n\`)` | `this.events.emit("pipeline:iteration:verdict", { step: currentStep, iteration: loopIter, verdict: "needs-fix", action: "fixer" })` |
| L377-379 | `printPipelineFinished` 内の `stdoutWrite` | `this.events.emit("pipeline:summary", { step: STEP_NAMES.SPEC_REVIEW, iterations: specReviewResults.length, finalVerdict })` |

## Task 4: progress.ts の拡張 (新 event の subscribe + stderr 出力)

**ファイル**: `src/cli/progress.ts`

1. 全 `process.stdout.write` → `process.stderr.write` に変更
2. `process.stdout.isTTY` → `process.stderr.isTTY` に変更（コンストラクタ L78）
3. `process.stdout.columns` → `process.stderr.columns` に変更（renderHeartbeat 内）
4. `ProgressDisplayOptions.isTTY` の doc comment を `process.stderr.isTTY` に更新
5. 新 event の subscribe ハンドラを `subscribe()` メソッドに追加:

```typescript
this.events.on("pipeline:iteration:start", (p) => this.onIterationStart(p));
this.events.on("pipeline:iteration:verdict", (p) => this.onIterationVerdict(p));
this.events.on("pipeline:iteration:exhausted", (p) => this.onIterationExhausted(p));
this.events.on("pipeline:summary", (p) => this.onPipelineSummary(p));
this.events.on("pipeline:cli-step", (p) => this.onCliStep(p));
```

6. 各ハンドラの実装（出力フォーマットは pipeline.ts の旧出力と bit-for-bit 一致させる）:

- `onIterationStart`: `[iter N/M] starting <step>\n` を stderr に出力
- `onIterationVerdict`: verdict/action に応じて `[iter N] <step> verdict: <v> → <action>\n` を stderr に出力
- `onIterationExhausted`: `[iter N/M] retries exhausted on <step>, escalating\n` を stderr に出力
- `onPipelineSummary`: `Pipeline finished: <step> iterations=N, final verdict=V\n` を stderr に出力
- `onCliStep`: `[step] <name>\n` または `[step] <name>: <verdict>\n` を stderr に出力

## Task 5: 直接 write の置き換え — cli/ 層

以下のファイルの `process.stdout.write` / `process.stderr.write` を logger 関数に置き換える。

| ファイル | 方針 |
|---|---|
| `src/cli/run.ts` | `process.stderr.write("Error: ...")` → `logError(...)` 等 |
| `src/cli/resume.ts` | 同上 |
| `src/cli/finish.ts` | `process.stderr.write` → `logError` / `stderrWrite`。L140 の `stdoutWrite` コールバックは結果データなので `logResult` に変更 |
| `src/cli/ps.ts` | 結果データ（テーブル出力）→ `logResult` / `stdoutWrite` |
| `src/cli/cancel.ts` | stderr → `logError` / `stderrWrite`。結果メッセージ → `logResult` |
| `src/cli/doctor.ts` | L153 の結果出力 → `stdoutWrite` (JSON/human-readable 結果) |
| `src/cli/job-show.ts` | 結果データ → `logResult`。stderr → `logError` |
| `src/cli/managed.ts` | 結果データ → `logResult`。stderr → `logError` / `stderrWrite` |
| `src/cli/command-registry.ts` | stderr → `logError` / `stderrWrite`。usage stdout → `stdoutWrite` |

## Task 6: 直接 write の置き換え — core/ 層

| ファイル | 方針 |
|---|---|
| `src/core/command/runner.ts` | `outputSpecReviewVerdict` の stdout 出力は診断情報なので `stderrWrite` に変更。`outputPipelineThrowError` の stderr → `logError` / `stderrWrite` |
| `src/core/command/resume.ts` | stderr → `logError` / `stderrWrite` |
| `src/core/command/request.ts` | `process.stdout.write(content)` は結果データ → `stdoutWrite`。stderr → `logError` |
| `src/core/command/request-review.ts` | 結果出力 → `stdoutWrite`。stderr → `logError` |
| `src/core/command/request-create.ts` | `process.stdout.write(\`${slug}\n\`)` → `logResult`。stderr → `logError` |
| `src/core/command/request-new.ts` | stderr → `stderrWrite` |
| `src/core/command/request-list.ts` | 結果データ → `stdoutWrite` / `logResult` |
| `src/core/command/rules-new.ts` | 結果パス → `logResult`。stderr → `logError` / `stderrWrite` |
| `src/core/command/usage-summary.ts` | 結果データ → `logResult` / `stdoutWrite` |
| `src/core/command/usage-show.ts` | 結果データ → `logResult` / `stdoutWrite`。stderr → `stderrWrite` |
| `src/core/cancel/runner.ts` | `process.stdout.write(prompt)` → `stdoutWrite`。結果 → `logResult` |
| `src/core/step/verification.ts` | ローカル `stderrWrite` 関数を削除し、logger の `stderrWrite` を import |
| `src/core/lifecycle/diagnostic.ts` | `process.stderr.write(line)` → `stderrWrite` (import from logger)。注: mask 対象データを含まない diagnostic だが、統一性のため logger 経由にする |
| `src/core/lifecycle/exit-guard.ts` | `process.stderr.write` → `stderrWrite` |
| `src/core/worktree/manager.ts` | `process.stderr.write` → `stderrWrite` |
| `src/core/finish/orchestrator.ts` | L76 の `stdoutWrite` デフォルト引数を logger の `logResult` に変更。L288,378,386,398,402,419,423 の `process.stderr.write` → `stderrWrite` |
| `src/core/finish/resolve-target.ts` | L45 の `stdoutWrite` デフォルト引数を logger の `logResult` に変更 |
| `src/core/finish/preflight.ts` | L62 の `warnFn` デフォルト引数を logger の `stderrWrite` に変更 |
| `src/core/finish/branch-checkout.ts` | L89 の `warnFn` デフォルト引数を logger の `stderrWrite` に変更 |
| `src/core/finish/pr-status.ts` | `process.stdout.write` → `logResult` / `stderrWrite` (内容に応じて判断) |

## Task 7: 直接 write の置き換え — adapter/ 層・その他

| ファイル | 方針 |
|---|---|
| `src/adapter/github/github-client.ts` | L416 の retry メッセージ → `stderrWrite` (診断) |
| `src/adapter/claude-code/agent-runner.ts` | L234 の stderr → `stderrWrite` |
| `src/adapter/codex/agent-runner.ts` | L145,161,222 の stderr → `stderrWrite` |
| `src/core/runtime/local.ts` | L200,255 の stderr → `stderrWrite` |
| `src/core/runtime/managed.ts` | L118,145 の stderr → `stderrWrite` |
| `src/auth/github-device.ts` | L139,142,145 の stdout → 対話的プロンプト表示なので `stderrWrite` (結果データではなく認証フロー指示) |
| `src/config/schema.ts` | L318 の stderr → `stderrWrite` |
| `src/util/copy-artifacts.ts` | L29 の stderr → `stderrWrite` |

## Task 8: テスト修正

1. `logInfo` / `logStep` / `logSuccess` の出力先が stderr に変わったことに伴うテスト修正
2. `progress.ts` のテストで `process.stdout.write` → `process.stderr.write` の mock 対象変更
3. `pipeline.ts` のテストで `stdoutWrite` 呼び出しの検証を削除し、EventBus event emit の検証に変更
4. `diagnostic.ts` のテストで import 変更に伴う mock 修正
5. `bun run typecheck && bun run test` が green になるまで修正

## Task 9: delta spec の確認

以下の delta spec ファイルが既に作成済み。実装完了後に内容が実装と乖離していないか確認する:

- `specrunner/changes/cli-output-channel-unification/specs/cli-commands/spec.md`
- `specrunner/changes/cli-output-channel-unification/specs/pipeline-orchestrator/spec.md`

## 実行順序

Task 1 → Task 2 → Task 3 + Task 4 (並行可) → Task 5 + Task 6 + Task 7 (並行可) → Task 8 → Task 9
