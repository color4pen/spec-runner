# CLI 出力チャネル統合 + マスキング全適用

## Meta

- **type**: spec-change
- **slug**: cli-output-channel-unification
- **base-branch**: main
- **adr**: true
- **close-issues**: 418

## 背景

spec-runner の CLI 出力に以下の構造的問題がある:

1. **直接 write の散在**: プロダクションコード 39 ファイル / 214 箇所で `process.stdout.write` / `process.stderr.write` を直接呼び出しており、logger (`logger/stdout.ts`) を経由しない
2. **二重出力経路**: `progress.ts` (EventBus subscriber) と `pipeline.ts` (直接 `stdoutWrite`) が独立に stdout に書く
3. **マスキングの穴**: `maskSensitive` は logger 関数群を通る出力にのみ適用。`stdoutWrite` (L181) は `maskSensitive` を通さない。直接 `process.stderr.write` する箇所もマスキングされない
4. **stdout/stderr 混在**: `logInfo` / `logStep` / `logSuccess` が stdout に進捗を書くため、パイプに流すと結果と進捗が混ざる

## 要件

### 1. 全出力パスを logger 経由に統一

`process.stdout.write` / `process.stderr.write` の直接呼び出しを廃止し、logger の関数群 (`logInfo`, `logError`, `stderrWrite` 等) を経由させる。これにより `maskSensitive` が全出力に自動適用される。

対象: `src/` 配下のプロダクションコード（テストファイルは対象外）。

### 2. stdout/stderr の用途分離

POSIX 規約に従い出力先を整理する:

- **stdout**: プログラムの結果のみ（PR URL、job ID、`job ls` のテーブル出力等、パイプで次のコマンドに渡すデータ）
- **stderr**: 診断メッセージ（進捗表示、step verdict、warning、error、heartbeat）

`logInfo` / `logStep` / `logSuccess` の出力先を stdout → stderr に変更する。

### 3. stdoutWrite のマスキング適用

`logger/stdout.ts` の `stdoutWrite` 関数に `maskSensitive` を適用する。現状は素通し。

### 4. pipeline.ts の直接出力を EventBus event 化

`pipeline.ts` 内の `stdoutWrite` 呼び出し（`[iter N/M]`、`Pipeline finished:` 等）を新 DomainEvent に変換し、`progress.ts` で一元処理する。出力経路を一本化する。新 DomainEvent の追加に伴い `src/core/event/types.ts` の DomainEvent union type と EventPayloadMap の拡張が必要。

### 5. progress.ts の TTY 検出を stderr に追随

`progress.ts` の TTY 検出が `process.stdout.isTTY` を参照している（L78, L168）。進捗表示を stderr に移行する際、TTY 判定を `process.stderr.isTTY` に変更する。これを怠ると stderr がリダイレクトされた時に heartbeat の `\r` 上書きが誤動作する。

## スコープ外

- **ログレベル体系の導入** — Phase 2 (#419) で対応
- **exit code の標準化** — Phase 2 (#419) で対応
- **ログの永続化 / retention** — Phase 3 (#420) で対応
- **構造化出力 (JSON Lines)** — Phase 4 (#421) で対応
- **テストファイル内の `process.stderr.write` mock** — テスト内部の話なので対象外
- **EventBus の sync/async 変更** — 本 Phase では現行の同期 emit を維持

## 受け入れ基準

- [ ] `src/` 配下のプロダクションコードに `process.stdout.write` / `process.stderr.write` の直接呼び出しが存在しない（`src/logger/stdout.ts` 内の最終出力点と `src/cli/progress.ts` 内の ProgressDisplay を除く）
- [ ] `stdoutWrite` が `maskSensitive` を適用している
- [ ] stdout に出力されるのはプログラムの結果（PR URL、job ID、テーブル出力等）のみ
- [ ] 進捗表示・warning・error は stderr に出力される
- [ ] `pipeline.ts` の直接 stdoutWrite が廃止され、EventBus event 経由で progress.ts が処理している
- [ ] 新 DomainEvent が `src/core/event/types.ts` に定義されている
- [ ] `progress.ts` の TTY 検出が `process.stderr.isTTY` を参照している
- [ ] 既存のマスクパターン (`sk-ant-` / `gho_` / `ghp_` / `ghr_`) が全出力パスに適用されている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **全出力パスの logger 経由化**: 直接 write を禁止することで maskSensitive の全適用を構造的に担保する。マスキングを「別 step で追加」するのではなく、出力チャネル統合の副産物として自然に達成する
- **stdout → stderr への移行**: POSIX 規約準拠。破壊的変更になるが、現状 stdout をパイプで consume しているユースケースがないため影響は限定的
- **EventBus event 化**: pipeline.ts と progress.ts の二重経路を解消。出力先変更が 1 箇所で完結する構造にする
- **scope を Phase 1 に限定**: ログレベル・永続化・構造化は後続 Phase に委ねる。本 Phase は「全出力が logger を通る」ことだけを達成する
