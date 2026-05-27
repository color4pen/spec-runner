# CLI ログ永続化: pipeline log 2層モデル + 個数ベース retention + EventBus subscriber パターン

**Date**: 2026-05-27
**Status**: accepted

## Context

Phase 1 (#418) で出力チャネル統一、Phase 2 (#419) でログレベル + exit code を整備した。残る課題は「run 終了後に agent が何をしたかの詳細が消える」こと。

具体的な問題:
- pipeline イベント（step 遷移・verdict・token 使用量）が揮発する
- code-fixer の session ID が null で事後インタビューができなかった（実際に発生）
- verbose log は `CommandRunner.execute()` 経由のみ。finish / cancel には存在しない
- agent session の SDK message（tool_use / tool_result 等）が揮発する

業界調査:
- Claude Code: `~/.claude/projects/{path}/{uuid}.jsonl` に session transcript を JSONL 保存（中央値 234 KB、最大 118 MB）
- npm: `~/.npm/_logs/` に個数ベース retention（`--logs-max` デフォルト 10）
- Docker: JSON Lines + サイズベースローテーション + gzip 圧縮

## Decision

### D1: 2層ログモデル — pipeline ログはレベル非依存、agent ログは debug opt-in

pipeline レベルのログ（step 遷移・verdict・token 使用量等）は **ログレベルに関わらず常時** `.specrunner/logs/<jobId>.log` に JSONL で書き込む。

verbose レベル以上では、既存の `logVerbose()` エントリも **同一ファイル** に独立 append する（2 層モデル）。

agent session log（SDK message の全体）は debug レベル (`-vv`) のみ有効化し、`.specrunner/logs/<jobId>/<step>-<attempt>.jsonl` に保存する。

**理由**: agent ログは 1 step 数 MB になりうる（tool_result にソースコードが入る）。default で全件保存するとディスクを圧迫する。pipeline ログは軽量（数十 KB 程度）なので常時保存で問題ない。

### D2: EventBus subscriber パターン — PipelineLogger を ProgressDisplay と対称に設計

`PipelineLogger` は `ProgressDisplay` と同じパターンで EventBus を subscribe し、JSONL をファイルに書く。両者は同一 EventBus を独立 subscribe する（fan-out）。

```typescript
class PipelineLogger {
  subscribe(events: EventBus): void { /* register handlers for all pipeline events */ }
  close(): void { /* close fd */ }
}
```

**理由**: 既存の `logVerbose()` は module-level state（fd, path）でファイルに書く設計。pipeline ログは「ログレベル非依存で常時書き込む」ため、verbose 有効化条件から独立した別チャネルが必要。EventBus subscriber パターンは `ProgressDisplay` で実績があり、同一のイベント型を再利用できる。

モジュールレベル関数（`logPipelineEvent` / `closePipelineLog`）を追加し、EventBus を使わない deterministic コマンド（finish / cancel）からも単純なエントリを記録できるようにした。

### D3: JSONL フォーマット — 行単位ストリーミングで大ファイルも扱えるよう

各エントリを `{ ts: ISO8601, type: string, ...payload }` の 1 行 JSON で書く。

**理由**: 行単位なので大きなファイルもメモリに載せずに処理できる。Claude Code と同じ方式。事後に `jq` で検索・フィルタ可能。

### D4: 個数ベース retention — npm 方式

`.specrunner/logs/` の job ログを個数で管理する。デフォルト 20 job、`config.json` の `logs.maxJobs` で変更可能（1-1000）。

超過時は mtime で古い順に `<jobId>.log` と `<jobId>/` ディレクトリの両方を削除する。

**理由**: サイズベース retention は agent ログのファイルサイズばらつきが大きく（KB 〜 MB）閾値が決めにくい。個数ベースは startup 時の 1 回スキャンで済む。npm の `--logs-max` 方式が業界実績あり。

### D5: ファイル構造の分離 — pipeline ログと agent ログを分離

- `<jobId>.log` — pipeline イベントの JSONL（常時書き込み）
- `<jobId>/` — agent session ログのディレクトリ（debug レベルのみ）
  - `<stepName>-<attempt>.jsonl` — step 単位の SDK message JSONL

**理由**: Bazel のデータ種別分割と同じ考え方。pipeline ログは軽量で常時参照、agent ログは重くて event-driven な調査用。分離することで `ls .specrunner/logs/*.log` で job 一覧を取得でき、agent ログは `<jobId>/` 配下でステップ別に整理される。

### D6: セキュリティ — 0600 / 0700 パーミッション

ファイルを `openSync(path, "a", 0o600)` で開き、ディレクトリを `mkdirSync(dir, { recursive: true, mode: 0o700 })` で作成する。

**理由**: agent session log は tool_result 経由でソースコードやシークレットを含む可能性がある。所有者以外がアクセスできないようにする。

## Alternatives Considered

### A1: pipeline ログを verbose レベルのみ有効化

**Pros**: 不要なディスク I/O を削減できる。ユーザーが意図的に有効化するため、ログファイルが溜まらない。

**Cons**: 事前に `-v` フラグを指定していない限り、問題発生後の事後調査が不可能。再現できない障害（code-fixer の null session ID 等）を追跡できない。

**却下理由**: pipeline ログは数十 KB と軽量なので常時保存のコストは許容範囲。事後調査の可能性を失うコストの方が大きい。

### A2: agent session log を verbose レベルで有効化

**Pros**: `-v` フラグさえつければ agent ログが残るため、verbose 実行時の調査ハードルが下がる。

**Cons**: agent session log は 1 step で数 MB になりうる（tool_result にソースコードが入る）。verbose は日常的な開発フローで使われるレベルであり、通常運用でディスクを圧迫する。

**却下理由**: verbose は日常的に使うレベル。agent ログは意図的な調査時にのみ必要なため、debug (`-vv`) を opt-in の境界とした。

### A3: サイズベース retention

**Pros**: 実際のディスク使用量に基づいた上限管理ができる。特定の大きなログが残り続けることを防げる。

**Cons**: agent ログのサイズばらつきが大きい（数 KB ～ 数十 MB）ため、適切な閾値が決めにくい。閾値が小さすぎると有効な job 数が不安定になる。

**却下理由**: 個数ベースは予測可能で npm の実績がある。startup 時の 1 回スキャンで済む。サイズベースは閾値調整が継続的な運用負担になる。

### A4: pipeline ログを stdout に JSON Lines で出力

**Pros**: 外部ツール（`grep` / `jq` 等）でリアルタイム処理できる。ファイルを別途参照する必要がない。

**Cons**: stdout はシェルパイプラインで使われることが多く、pipeline ログと混在させると利用者に混乱を与える。CI/CD スクリプトが壊れる可能性がある。

**却下理由**: 構造化 stdout は Phase 4 (#421) の専用 issue で対応予定。今回はファイル保存に絞り、stdout を汚染しない。

### A5: PipelineLogger をシングルトン（module state 完全移行）

**Pros**: モジュールレベル関数で API が統一され、呼び出し側がインスタンスを保持しなくてよい。

**Cons**: `ProgressDisplay` との対称性が崩れる。テストでインスタンスを独立に制御しにくくなる。EventBus をモジュールレベルで持つと初期化順序の依存が生じる。

**却下理由**: クラスベース + コンストラクタインジェクションの方が `ProgressDisplay` との対称性・テスタビリティ・EventBus の疎結合において優れている。モジュールレベル関数は EventBus を持たない finish / cancel 用の補助 API に限定した。

### A6: `logVerbose()` を拡張してログレベル非依存モードを追加

**Pros**: 既存の verbose log 実装を再利用でき、新規クラスが不要。

**Cons**: `logVerbose()` は module-level state（fd, path）でファイルに書く設計。2 つの fd（verbose 用 / pipeline 用）を持たせると状態管理が複雑化する。テストで独立に制御しにくい。

**却下理由**: pipeline ログは「ログレベル非依存で常時書き込む」という別の責務を持つ。既存の verbose log 実装を汚染するより、独立したクラスを新設する方がシンプル。

### A7: `pipeline.ts` から直接ファイルに書き込む

**Pros**: 依存関係がシンプル。EventBus を介さず直接書けるため実装が短い。

**Cons**: core 層にファイル I/O が入り、テスタビリティが低下する。EventBus の存在意義（関心の分離・fan-out）が薄れる。

**却下理由**: core 層は I/O フリーに保つ設計方針。EventBus subscriber パターンに `ProgressDisplay` の実績があり、同一のイベント型を再利用できる。

## Consequences

**プラス**:
- run が終わったあとに `jq` で pipeline ログを検索し、step 遷移・verdict・token 使用量を追跡できる
- debug レベルで agent session log が残るため、code-fixer の null session ID 問題など事後インタビューが可能になる
- finish / cancel でも pipeline ログが記録されるため、operation 全体のトレーサビリティが向上する
- 個数ベース retention により、長期運用でもディスク使用量が管理下に置かれる

**マイナス**:
- pipeline ログが常時書き込まれるため、`.specrunner/logs/` に今後 job ごとにファイルが蓄積される（retention が対処）
- debug レベルの agent session log は step あたり数 MB になる可能性があり、`logs.maxJobs` の調整が必要な場合がある
- `PipelineLogger` が EventBus ハンドラを多数登録するため、EventBus の handler 数が増える（現状問題なし）
