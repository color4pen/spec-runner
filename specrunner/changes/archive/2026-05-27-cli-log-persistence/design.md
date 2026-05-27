## Context

specrunner の出力基盤は Phase 1 (出力チャネル統一) + Phase 2 (ログレベル + exit code) で整備済み。
しかし run 完了後に agent の振る舞いを追跡できる情報が残らない:

- pipeline レベルのイベント（step 遷移、verdict、token 使用量）が揮発する
- agent session の SDK message（tool_use / tool_result 等）が揮発する（debug 調査不能）
- code-fixer で session ID が null になり事後インタビューすらできなかった（実際に発生）
- verbose log は `CommandRunner.execute()` 経由のみで初期化。finish / cancel では存在しない

業界先行事例:
- Claude Code: `~/.claude/projects/{path}/{uuid}.jsonl` に session transcript を JSONL で保存
- npm: `~/.npm/_logs/` に個数ベース retention (`--logs-max` デフォルト 10)
- Docker: JSON Lines + サイズベースローテーション

stakeholders:
- **作者**: 障害調査で agent の行動を事後に確認したい（code-fixer null session ID 問題の再発防止）
- **将来の利用者**: `jq` でログを事後分析したい
- **architect**: 既存の verbose log 基盤を拡張し、新規抽象を最小限に抑える

## Goals / Non-Goals

**Goals:**

- 全 `run` / `resume` で pipeline イベントを `.specrunner/logs/<jobId>.log` に JSONL で自動保存する（ログレベル非依存）
- debug レベル (`-vv`) で agent session log を `.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` に保存する
- 個数ベース retention（デフォルト 20 job）で古いログを自動削除する
- finish / cancel でも pipeline ログを初期化する
- `job show` でログパスを表示する

**Non-Goals:**

- 構造化 stdout (JSON Lines) — Phase 4 (#421) で対応
- ログの圧縮 (gzip) — 将来的に検討
- ログのリモート送信 — ローカル保存のみ
- ログの検索 / フィルタ CLI — `jq` で直接 JSONL を処理

## Decisions

### D1. PipelineLogger: EventBus subscriber として pipeline ログを書き込む

**Decision**: `src/logger/pipeline-logger.ts` に `PipelineLogger` クラスを新設する。
`ProgressDisplay` と同じパターンで EventBus を subscribe し、ログファイルに JSONL で書き込む。

```ts
class PipelineLogger {
  constructor(logFilePath: string);
  subscribe(events: EventBus): void;
  close(): void;
}
```

`ProgressDisplay` が stderr 出力に責任を持つのと同じ構造で、`PipelineLogger` はファイル出力に責任を持つ。
両者は同じ EventBus を独立に subscribe する（fan-out）。

**Rationale**: 既存の `logVerbose()` は module-level state（fd, path）でファイルに書く設計。
pipeline ログは「ログレベル非依存で常時書き込む」ため、verbose の有効化条件から独立した別チャネルが必要。
EventBus subscriber パターンは `ProgressDisplay` で実績があり、同一のイベント型を再利用できる。

**Alternatives considered**:
- **A. `logVerbose` を拡張してログレベル非依存モードを追加**: module-level state に 2 つの fd（verbose 用 / pipeline 用）を持たせると状態管理が複雑化する。テストで独立に制御しにくい
- **B. pipeline.ts から直接書き込む**: core 層にファイル I/O が入り、テスタビリティが低下。EventBus の存在意義が薄れる

### D2. 2 層ログモデル: pipeline-event + verbose

**Decision**: pipeline ログファイル (`<jobId>.log`) は以下の 2 層で構成する:

1. **pipeline-event 層** (ログレベル非依存): `PipelineLogger` が EventBus から受信するイベントを書き込む
2. **verbose 層** (verbose 以上): 既存の `logVerbose()` が書き込むエントリも同一ファイルに追記する

verbose 層は既存の `initVerboseLog()` が同じ `<jobId>.log` パスを使うことで実現する。
`initVerboseLog()` の呼び出し条件（`isLevelEnabled("verbose")`）は変更しない。

**Rationale**: pipeline-event と verbose エントリを同一 JSONL ファイルに時系列で混在させることで、
事後調査時に `jq` で type フィルタするだけで使い分けられる。ファイルを分割すると
時系列の突合が必要になり分析が面倒。

### D3. Agent session log は `<jobId>/<step>-<attempt>.jsonl` に分離

**Decision**: agent step 実行中の SDK message を `<jobId>/<step>-<attempt>.jsonl` に保存する。
debug レベル (`-vv` / `SPECRUNNER_LOG_LEVEL=debug`) でのみ有効化。

保存先を pipeline ログ (`<jobId>.log`) と分離する理由:
- agent ログは 1 step で数 MB になりうる（Claude Code の統計: 中央値 234 KB、最大 118 MB）
- pipeline ログは数十 KB で軽量
- retention 時に `<jobId>.log` と `<jobId>/` ディレクトリを一括削除する構造

**書き込み責務**: `ClaudeCodeRunner` (adapter) が SDK の `AsyncGenerator<SDKMessage>` を iterate する際、
各 message を session log ファイルに書き込む。adapter 層に閉じ込めることで core に SDK 型が漏れない。

`AgentRunContext` に `sessionLogPath?: string` を追加し、`StepExecutor` が debug レベル時にパスを設定する。
adapter は `sessionLogPath` が設定されている場合のみ書き込む。

### D4. 個数ベース retention

**Decision**: run 開始時に `.specrunner/logs/` を走査し、`logs.maxJobs`（デフォルト 20）を超過する
古い job ログを削除する。

削除対象の特定方法:
1. `.specrunner/logs/` 直下の `*.log` ファイルを列挙
2. ファイルの mtime で降順ソート
3. `maxJobs` 超過分のファイル名から jobId を抽出
4. `<jobId>.log` と `<jobId>/` ディレクトリの両方を削除

**Rationale**: npm の `--logs-max` と同じアプローチ。起動時の 1 回走査で済む。
サイズベースは agent ログのばらつきが大きく（234 KB ～ 118 MB）閾値が決めにくい。

retention は `src/logger/log-retention.ts` に独立モジュールとして実装する。
`CommandRunner.execute()` の pipeline 実行前に呼び出す。

### D5. pipeline ログの初期化ポイント拡張

**Decision**: 現在 `CommandRunner.execute()` のみで verbose log を初期化しているのを拡張する。

| コマンド | pipeline ログ | 初期化タイミング |
|----------|-------------|--------------|
| `run`    | Yes         | `CommandRunner.execute()` 内（既存パス拡張）|
| `resume` | Yes         | `CommandRunner.execute()` 内（既存パス拡張）|
| `finish` | Yes         | `runFinish()` 内、slug → jobId 解決後 |
| `cancel` | Yes         | `runCancel()` 内、jobId 解決後 |
| `doctor` | No          | job に紐づかない環境診断のため対象外 |

`PipelineLogger` は EventBus に依存するため、finish / cancel では簡易版
（`initPipelineLog(repoRoot, jobId)` + `logPipelineEvent()` 関数）を使う。
finish / cancel は EventBus を使わない deterministic コマンドのため、
直接 `logPipelineEvent()` を呼んで主要イベント（開始、完了、エラー）を記録する。

### D6. config schema 拡張: `logs.maxJobs`

**Decision**: `SpecRunnerConfig` に `logs?: LogsConfig` を追加する。

```ts
interface LogsConfig {
  /** Maximum number of job logs to retain. Default: 20. Range: 1-1000. */
  maxJobs?: number;
}
```

既存の config validation パターンに従い、`validateConfig()` で範囲チェックを行う。

### D7. `job show` にログパスを追加

**Decision**: `printJobState()` の出力に `Log:` 行を追加する。

```
Job ID:  <uuid>
Status:  running
Branch:  feat/my-feature
Step:    implementer
Created: 2026-05-27T...
Updated: 2026-05-27T...
Log:     .specrunner/logs/<jobId>.log
```

ログファイルが存在しない場合は `Log:     (none)` を表示する。
パスは repoRoot からの相対パスで表示する（portability）。

## Affected Specs

### MODIFIED: verbose-execution-log

既存の verbose log パスを pipeline ログと共用する設計変更:
- pipeline ログは `initPipelineLog()` でログレベル非依存に初期化する（新規）
- verbose ログ (`logVerbose()`) は従来通り verbose 以上でのみ有効化
- 両者は同一ファイル (`<jobId>.log`) に書き込む

### MODIFIED: cli-commands

- `job show` 出力に `Log:` フィールドを追加
- finish / cancel でも pipeline ログを初期化

### MODIFIED: cli-config-store

- `logs.maxJobs` フィールドを config schema に追加

### NEW: cli-log-persistence

pipeline ログの自動保存、agent session log、retention の仕様を定義する新規 spec。
