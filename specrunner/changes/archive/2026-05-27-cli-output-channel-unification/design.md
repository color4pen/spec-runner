# Design: CLI 出力チャネル統合 + マスキング全適用

## 変更の要約

CLI の全出力パスを `logger/stdout.ts` 経由に統一し、`maskSensitive` の全出力適用を構造的に担保する。同時に POSIX 規約に従い stdout/stderr の用途を分離し、pipeline.ts の直接出力を EventBus event 経由に一本化する。

## 設計判断

### D1: logger 関数群の出力先変更 (stdout → stderr)

`logInfo` / `logStep` / `logSuccess` の出力先を `process.stdout.write` → `process.stderr.write` に変更する。

**理由**: POSIX 規約では stdout はプログラムの結果、stderr は診断メッセージ。現状これらは進捗表示に使われており、stderr が正しい。

**影響範囲**: logger/stdout.ts 内の 3 関数のみ。呼び出し元は変更不要（関数 signature は同一）。

### D2: stdoutWrite に maskSensitive を適用

`stdoutWrite` の実装を `process.stdout.write(message)` → `process.stdout.write(maskSensitive(message))` に変更する。

**理由**: stdoutWrite は「構造化結果を stdout に書く」ための唯一の正規経路。マスキングが抜けていたのはバグ。

### D3: 新 logger 関数 `logResult` の追加

stdout に結果データを書く専用関数 `logResult(message: string): void` を追加する。実装は `process.stdout.write(maskSensitive(message) + "\n")` 。

**理由**: stdout への出力を `logResult` / `stdoutWrite` に限定することで、「stdout に書く = 結果データ」というセマンティクスを型レベルで表現する。直接 `process.stdout.write` を使う誘惑を減らす。

### D4: pipeline.ts の直接出力を EventBus event に変換

pipeline.ts 内の `stdoutWrite` 呼び出しを以下の新 DomainEvent に変換する:

| 現在の出力 | 新 DomainEvent | Payload |
|---|---|---|
| `[iter N/M] starting <step>` | `"pipeline:iteration:start"` | `{ step: string; iteration: number; maxIterations: number }` |
| `[iter N] <step> verdict: ... → done/halt` | `"pipeline:iteration:verdict"` | `{ step: string; iteration: number; verdict: string; action: "done" \| "halt" \| "fixer" }` |
| `[iter N/M] retries exhausted ...` | `"pipeline:iteration:exhausted"` | `{ step: string; iteration: number; maxIterations: number }` |
| `Pipeline finished: ...` | `"pipeline:summary"` | `{ step: string; iterations: number; finalVerdict: string }` |
| `[step] <name>` / `[step] <name>: <verdict>` | `"pipeline:cli-step"` | `{ step: string; verdict?: string }` |

progress.ts がこれらの event を subscribe し、stderr に出力する（進捗は診断メッセージなので stderr が正しい）。

**理由**: 出力経路の一本化。pipeline.ts は出力先を知らない。progress.ts が全出力の presentation を担う。

### D5: progress.ts の TTY 検出を stderr に変更

`process.stdout.isTTY` → `process.stderr.isTTY` に変更。`process.stdout.columns` → `process.stderr.columns` に変更。

**理由**: 進捗表示の出力先が stderr に移行するため、TTY 検出も stderr を参照しなければ `\r` 上書きが誤動作する。

### D6: 直接 write の logger 関数置き換え戦略

39 ファイル / ~200 箇所の直接 write を以下のルールで置き換える:

| パターン | 置き換え先 |
|---|---|
| `process.stderr.write("Error: ...")` | `logError(...)` |
| `process.stderr.write("Warning: ...")` | `stderrWrite(...)` （logWarn は verbose-gated なので不適切） |
| `process.stderr.write("Hint: ...")` | `stderrWrite(...)` |
| `process.stderr.write(...)` (その他診断) | `stderrWrite(...)` |
| `process.stdout.write(...)` (結果データ) | `logResult(...)` or `stdoutWrite(...)` |
| `process.stdout.write(...)` (進捗表示) | `stderrWrite(...)` or `logInfo(...)` |

特殊ケース:
- `finish/orchestrator.ts` / `finish/resolve-target.ts` は `stdoutWrite` コールバックパターンを使用。コールバックのデフォルト値を logger 関数に変更する。
- `core/step/verification.ts` のローカル `stderrWrite` 関数は logger の `stderrWrite` import に置き換える。
- `core/lifecycle/diagnostic.ts` の `process.stderr.write` は logger 経由にする。ただし diagnostic は mask 対象データを含まないため、パフォーマンスを考慮し `stderrWrite` で wrap する。
- `progress.ts` の `process.stdout.write` は `process.stderr.write` に変更（D1 の帰結）。progress.ts は logger 経由ではなく直接 `process.stderr.write` を使う（progress.ts 自体がプレゼンテーション層の最終出力点であり、maskSensitive は upstream で適用済みのため二重適用を避ける）。

### D7: progress.ts 内の出力は process.stderr.write を直接使う

progress.ts は EventBus subscriber（プレゼンテーション層の末端）であり、受け取る payload は pipeline/step 層で既に構成されたデータ。maskSensitive が必要なデータ（トークン等）は payload に含まれない。progress.ts から更に logger を経由すると循環的な依存になるため、`process.stderr.write` を直接使う。

これは `logger/stdout.ts` 内の最終出力点と同じ位置づけ。受け入れ基準の「`logger/stdout.ts` 内の最終出力点を除く」に progress.ts も最終出力点として例外に含める。

## 変更しないもの

- DomainEvent 型の union/discriminated-union 構造（string literal 型を維持）
- EventBus の同期 emit 方式
- ログレベル体系（Phase 2）
- テストファイル内の `process.stderr.write` mock
- `maskSensitive` のパターン自体（既存 4 パターンを維持）

## Delta spec 対象

- `cli-commands`: `logInfo`/`logStep`/`logSuccess` が stderr に出力するよう変更。stdout は結果データのみの規約を追加。
- `pipeline-orchestrator`: pipeline.ts の直接 stdoutWrite を廃止し、新 DomainEvent 経由で progress.ts が処理する規約を追加。
