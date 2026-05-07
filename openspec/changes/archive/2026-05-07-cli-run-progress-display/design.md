## Context

`specrunner run` の pipeline 実行中、stdout 出力は pipeline.ts 内の `stdoutWrite()` による spec-review ループの進捗表示（`[iter N/M]` 形式）に限定されている。EventBus は Design D6 で "reservation seat" として導入済みだが subscriber=0 の状態。全 domain event（`step:start`/`step:complete`/`step:error`/`verdict:parsed`/`pipeline:*`）は emit されているが消費されていない。

CLI の `run` コマンドは現在フラグを一切受け付けない。warning は `logWarn()` で常に stderr に出力される。

## Goals / Non-Goals

**Goals:**

- EventBus subscriber で step 遷移と所要時間をリアルタイム表示する
- pipeline 完了時に次のアクション（finish コマンド）を案内する
- `--verbose` フラグで warning の表示/抑制を制御する
- pipeline.ts の既存 stdout 出力はそのまま残す（breaking change なし）

**Non-Goals:**

- pipeline.ts の `stdoutWrite()` を ProgressDisplay に統合する（将来課題）
- spinner/progress bar 等のリッチ UI（TTY 検出やターミナル互換性は scope 外）
- EventBus の非同期化やバッファリング

## Decisions

### D1: ProgressDisplay を CLI 層に配置

`src/cli/progress.ts` に `ProgressDisplay` クラスを新設する。Pipeline/EventBus は core 層にあるが、表示はプレゼンテーション関心であり CLI 層に属する。

```ts
export class ProgressDisplay {
  private stepStartTimes = new Map<string, number>();

  constructor(
    private readonly events: EventBus,
    private readonly options: { verbose: boolean; slug: string },
  ) {
    this.subscribe();
  }

  private subscribe(): void {
    this.events.on("step:start", (p) => this.onStepStart(p));
    this.events.on("step:complete", (p) => this.onStepComplete(p));
    this.events.on("step:error", (p) => this.onStepError(p));
    this.events.on("verdict:parsed", (p) => this.onVerdictParsed(p));
    this.events.on("pipeline:complete", (p) => this.onPipelineComplete(p));
    this.events.on("pipeline:fail", (p) => this.onPipelineFail(p));
  }
}
```

**理由**: core 層に表示ロジックを入れると、テスト時の stdout 汚染や将来の UI 分離が困難になる。

### D2: EventBus を外部注入可能にする

`runPipeline` の signature を拡張し、optional で EventBus を受け取る:

```ts
export async function runPipeline(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Promise<JobState> {
  const bus = events ?? new EventBus();
  // ... 以降は bus を使う
}
```

**理由**: caller（`run.ts`）が ProgressDisplay を登録した EventBus を渡すことで、subscriber 登録と pipeline 実行を分離できる。既存の呼び出し元は `events` を省略すれば従来通り動作する（後方互換）。

**代替案**: PipelineDeps に EventBus を追加する方法。しかし EventBus はインフラ層の関心であり、deps（ドメイン依存）に混ぜるのは責務の曖昧化。第3引数が最小限の変更。

### D3: verbose フラグの伝播経路

```
bin/specrunner.ts (--verbose 解析)
  → runRun(requestMd, { verbose: true })
    → runRunCore(requestMd, { verbose: true })
      → setVerbose(options.verbose ?? false)  // グローバル設定
      → new ProgressDisplay(events, { verbose, slug })
```

**理由**: `logWarn` はコードベース全体から呼ばれるため、呼び出しごとに verbose を渡すのは非現実的。`stdout.ts` にモジュールレベル state を追加するのが最も局所的な変更。

### D4: 出力フォーマット

```
[propose] running...
[propose] ✓ (12s) → [spec-review] running...
[spec-review] ✓ approved (8s) → [implementer] running...
[implementer] ✓ (45s) → [verification] running...
[verification] ✗ failed (3s) → [build-fixer] running...
[build-fixer] ✓ (20s) → [verification] running...
[verification] ✓ passed (3s) → [code-review] running...
[code-review] ✓ approved (15s) → [pr-create] running...
[pr-create] ✓ (5s)

Next: bun ./bin/specrunner.ts finish <slug>
```

`step:start` → `[step] running...` を出力。
`step:complete` → 前の step 行を完了表示に更新するのではなく、新しい行として `[step] ✓ (Ns)` を出力（ターミナル制御コード不要、ログにも残る）。
`verdict:parsed` → verdict 値を表示に含める（`✓ approved`、`✗ needs-fix`）。

**理由**: ANSI escape でカーソル上書きする方式は pipe/redirect で壊れる。行追記方式はシンプルで堅牢。

### D5: pipeline.ts の既存出力との共存

pipeline.ts 内の `stdoutWrite()` はそのまま残す（要件: "pipeline.ts の直接 stdout 出力は残してよい"）。ProgressDisplay の step 遷移行と pipeline.ts の `[iter N/M]` 行は混在するが、それぞれ異なる粒度の情報を提供するため問題ない:

- ProgressDisplay: step 遷移と所要時間（全 step 対象）
- pipeline.ts: loop iteration の進捗（loop step のみ）

将来の統合は別 change で対応する。

### D6: warning 抑制の実装

`src/logger/stdout.ts` にモジュールレベル変数を追加:

```ts
let verbose = false;
export function setVerbose(v: boolean): void { verbose = v; }
export function isVerbose(): boolean { return verbose; }

export function logWarn(message: string): void {
  if (!verbose) return;
  process.stderr.write("Warning: " + maskSensitive(message) + "\n");
}
```

`setVerbose(true)` は `runRunCore` の冒頭で呼び出す。`--verbose` なしの場合は `false`（デフォルト）のまま。

## Risks / Trade-offs

- **stdout 二重出力**: ProgressDisplay と pipeline.ts の出力が混在する。短期的にはノイジーだが、情報量は増える。将来 pipeline.ts の直接出力を ProgressDisplay に移行すれば解消
- **グローバル state**: `setVerbose` はモジュールレベル変数。テスト時に副作用を残す可能性がある → afterEach で `setVerbose(false)` にリセットするユーティリティを用意
- **step:complete の timing**: EventBus は同期実行のため、step:complete の emit 時点で次の step はまだ開始していない。`→ [next-step] running...` の表示は step:start で行い、complete 行には含めない方がシンプル
