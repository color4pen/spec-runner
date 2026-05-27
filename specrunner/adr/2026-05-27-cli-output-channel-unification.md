# ADR: CLI 出力チャネル統合 + マスキング全適用 (Phase 1)

- **date**: 2026-05-27
- **slug**: cli-output-channel-unification
- **status**: accepted

## Context

spec-runner CLI の出力には以下の構造的問題が積み重なっていた:

1. **直接 write の散在**: プロダクションコード 39 ファイル / 214 箇所で `process.stdout.write` / `process.stderr.write` を直接呼び出しており、`logger/stdout.ts` を経由しない
2. **二重出力経路**: `progress.ts`（EventBus subscriber）と `pipeline.ts`（直接 `stdoutWrite`）が独立して stdout に書く
3. **マスキングの穴**: `maskSensitive` は logger 関数群を通る出力にのみ適用。`stdoutWrite`（L181）は `maskSensitive` を素通し。直接 `process.stderr.write` する箇所もマスキングされない
4. **stdout/stderr 混在**: `logInfo` / `logStep` / `logSuccess` が stdout に進捗を書くため、パイプに流すと結果と進捗が混ざる

これらは個別のバグではなく「出力チャネルに設計規律がない」という構造的問題であり、マスキング追加・テスト・将来の構造化出力（Phase 4）すべての基盤になる。

4フェーズ CLI 出力進化計画の Phase 1 として位置づける:
- **Phase 1（本 ADR）**: 全出力 logger 経由化 + stdout/stderr 分離（issue #418）
- **Phase 2**: ログレベル体系 + exit code 標準化（issue #419）
- **Phase 3**: ログ永続化 / retention（issue #420）
- **Phase 4**: 構造化出力（JSON Lines）（issue #421）

## Decisions

### D1: 全出力パスを logger 関数経由に統一

`process.stdout.write` / `process.stderr.write` の直接呼び出しを廃止し、`logger/stdout.ts` の関数群（`logInfo`, `logError`, `stderrWrite`, `logResult`, `stdoutWrite` 等）を経由させる。

対象は `src/` 配下のプロダクションコード（テストファイルは対象外）。

**理由**: マスキング（`maskSensitive`）を「別 step で追加する処理」ではなく、出力チャネル通過の構造的副産物として自動適用する。全出力が必ず logger を通るため、将来のマスキングパターン追加・ログレベル導入・構造化出力の追加が 1 箇所の変更で全出力に反映される。

**結果**: 以下 2 箇所のみ直接 `process.stdout.write` / `process.stderr.write` を許可する最終出力点とする:
- `src/logger/stdout.ts` 内（logger 自体の最終出力点）
- `src/cli/progress.ts` 内（プレゼンテーション層末端。受け取る payload はトークン等を含まず、upstream で maskSensitive 適用済みのため二重適用を避ける）

### D2: stdout/stderr の用途を POSIX 規約に従い分離

出力先を以下のセマンティクスで明確に区別する:

| 出力先 | 用途 |
|--------|------|
| **stdout** | プログラムの結果のみ（PR URL、job ID、`job ls` テーブル等、パイプで次コマンドに渡すデータ） |
| **stderr** | 診断メッセージ（進捗表示、step verdict、warning、error、heartbeat） |

`logInfo` / `logStep` / `logSuccess` の出力先を `process.stdout.write` → `process.stderr.write` に変更する。

**理由**: POSIX 規約準拠。これらは進捗表示（診断メッセージ）であり、stdout にあるのが誤りだった。stdout をパイプで consume するユースケースが現時点では存在しないため影響は限定的だが、将来 `specrunner run | jq` 等のパイプ利用時に意図通り動作するための基盤となる。

### D3: `stdoutWrite` に `maskSensitive` を適用

`logger/stdout.ts` の `stdoutWrite` 実装を `process.stdout.write(message)` → `process.stdout.write(maskSensitive(message))` に変更する。

**理由**: `stdoutWrite` は「構造化結果を stdout に書く」唯一の正規経路。マスキングが抜けていたのはバグ。D1 の統一と合わせ、全出力パスで `maskSensitive` が自動適用されることを構造的に保証する。

### D4: 新 logger 関数 `logResult` の追加

stdout に結果データを書く専用関数 `logResult(message: string): void` を追加する。実装は `process.stdout.write(maskSensitive(message) + "\n")`。

**理由**: stdout への出力を `logResult` / `stdoutWrite` に限定することで「stdout に書く = 結果データ」というセマンティクスを型・命名レベルで表現する。直接 `process.stdout.write` を使う誘惑を減らし、D2 の用途分離規約をコードベースに浸透させる。

### D5: `pipeline.ts` の直接出力を DomainEvent 経由に一本化

`pipeline.ts` 内の `stdoutWrite` 呼び出しを以下の新 DomainEvent に変換し、`progress.ts` が subscribe して stderr に出力する:

| 廃止された直接出力 | 新 DomainEvent | Payload |
|---|---|---|
| `[iter N/M] starting <step>` | `"pipeline:iteration:start"` | `{ step: string; iteration: number; maxIterations: number }` |
| `[iter N] <step> verdict: ... → done/halt` | `"pipeline:iteration:verdict"` | `{ step: string; iteration: number; verdict: string; action: "done" \| "halt" \| "fixer" }` |
| `[iter N/M] retries exhausted ...` | `"pipeline:iteration:exhausted"` | `{ step: string; iteration: number; maxIterations: number }` |
| `Pipeline finished: ...` | `"pipeline:summary"` | `{ step: string; iterations: number; finalVerdict: string }` |
| `[step] <name>` / `[step] <name>: <verdict>` | `"pipeline:cli-step"` | `{ step: string; verdict?: string }` |

**理由**: `pipeline.ts` は出力先を知るべきでない。イテレーション進捗は診断メッセージであり、`progress.ts` がプレゼンテーションを一元管理する。この一本化により、将来出力先・フォーマット・フィルタリングを変更する際に `progress.ts` の 1 箇所だけ変更すれば済む。

### D6: `progress.ts` の TTY 検出を `process.stderr.isTTY` に変更

`progress.ts` の TTY 判定を `process.stdout.isTTY` → `process.stderr.isTTY` に、列幅取得を `process.stdout.columns` → `process.stderr.columns` に変更する。

**理由**: 進捗表示の出力先が stderr に移行するため、TTY 検出も stderr を参照しなければ `\r` 上書きが誤動作する。`stderr 2>/dev/null` でリダイレクトされた際に heartbeat の `\r` 上書きが壊れるリグレッションを防ぐ。

### D7: 直接 write の置き換えルール

39 ファイル / ~200 箇所の直接 write を以下のルールで置き換える:

| パターン | 置き換え先 |
|---|---|
| `process.stderr.write("Error: ...")` | `logError(...)` |
| `process.stderr.write("Warning: ...")` | `stderrWrite(...)` |
| `process.stderr.write("Hint: ...")` | `stderrWrite(...)` |
| `process.stderr.write(...)` (その他診断) | `stderrWrite(...)` |
| `process.stdout.write(...)` (結果データ) | `logResult(...)` または `stdoutWrite(...)` |
| `process.stdout.write(...)` (進捗表示) | `stderrWrite(...)` または `logInfo(...)` |

特殊ケース:
- `finish/orchestrator.ts` / `finish/resolve-target.ts` の `stdoutWrite` コールバックパターンはデフォルト値を logger 関数に変更
- `core/step/verification.ts` のローカル `stderrWrite` 関数は logger の `stderrWrite` import に置換
- `progress.ts` の `process.stdout.write` は `process.stderr.write` に変更（D2 の帰結）

## Alternatives Considered

### Alternative 1: マスキングを出力直前に都度追加する

各 `process.stdout.write` / `process.stderr.write` 呼び出しを `maskSensitive` でラップする。logger 経由化は行わない。

- **Pros**: 影響範囲が小さく、リファクタリングリスクが低い
- **Cons**: 214 箇所すべての変更が必要。将来パターン追加時に漏れが発生しやすい。出力経路の多重化問題（D5）が残存する
- **Why not**: マスキングを「処理」として追加するのではなく「チャネルを通過するだけで適用される」構造にすることが本変更の核心。対症療法では根本解決にならない

### Alternative 2: stdout/stderr の用途分離をしない（stderr 移行を別 Phase に延期）

`logInfo`/`logStep`/`logSuccess` を stdout のまま維持し、全出力 logger 経由化のみを行う。

- **Pros**: 破壊的変更を避けられる。移行コストが小さい
- **Cons**: Phase 4（構造化出力）で stdout をパイプ利用する際に、進捗と結果が混在した状態から再度 break the API をする必要が生じる。今変えるのが最も安全なタイミング
- **Why not**: 現時点で stdout をパイプ consume しているユースケースがなく、今変えると後の Phase で二重に破壊的変更が起きない。POSIX 規約準拠は Phase 1 に組み込むのが設計的に正しい

### Alternative 3: EventBus event 化をせず pipeline.ts の出力先を stderr に直接変更

`pipeline.ts` の `stdoutWrite` を `stderrWrite` に置き換えるだけにとどめ、EventBus event 化は行わない。

- **Pros**: 変更箇所が少ない。DomainEvent 型定義の追加が不要
- **Cons**: pipeline.ts が出力先（stderr）を直接知ることになり、将来のフォーマット変更・フィルタリング追加の際に pipeline.ts の変更が必要になる。「core は表示を知らない」原則に反する
- **Why not**: pipeline.ts と progress.ts の責務分離を徹底するため。出力経路の一本化は長期保守性の観点から必須

### Alternative 4: `progress.ts` も logger 経由にする

`progress.ts` の `process.stderr.write` を `stderrWrite` 等の logger 関数に変更する。

- **Pros**: 例外なく「全出力が logger を通る」が成立する
- **Cons**: progress.ts は EventBus subscriber のプレゼンテーション末端。受け取る payload はトークン等を含まず、upstream で maskSensitive 適用済み。logger 経由にすると二重マスキングが起き、かつ循環的な依存関係を疑わせる構造になる
- **Why not**: progress.ts は `logger/stdout.ts` と同様の「最終出力点」として位置づける。受け入れ基準に明示的に例外として記載する

## Consequences

### Positive

- `maskSensitive` が全出力パスに構造的に適用され、トークン漏洩のリスクがアーキテクチャ上なくなる
- stdout はプログラムの結果のみとなり、POSIX 規約準拠。`specrunner run | jq` 等のパイプ利用が Phase 4 以降で正しく機能する基盤が整う
- `pipeline.ts` の出力責務が消え、`progress.ts` が全プレゼンテーションを一元管理する。将来のフォーマット変更が 1 箇所で完結する
- 新 DomainEvent（`pipeline:iteration:start` 等 5 種）が型安全に定義され、EventBus の型安全性が向上する
- `logResult` の追加により「stdout に書く = 結果データ」のセマンティクスが命名で表現される

### Negative / 既知の負債

- `logInfo` / `logStep` / `logSuccess` / `logResult` / `stdoutWrite` の単体テスト（TC-01〜06/TC-49）が未追加のまま（review F2）。実装は正しいがリグレッション防止テストが不在。次の Phase 1 メンテナンス変更で対処予定
- `pipeline.ts` の JSDoc コメント（L42–43）に `stdout progress output` という stale 記述が残存（trivial、review F3）
- `progress.test.ts` の describe 文字列（L88）が `→ stdout 出力` のまま（trivial、review F4）

## 関連 ADR

- [2026-05-23-foreground-progress-display](./2026-05-23-foreground-progress-display.md) — `DomainEvent` union への `step:progress` 追加・heartbeat timer の ProgressDisplay 配置。本 ADR で pipeline 系 DomainEvent 5 種を追加し、TTY 検出を `process.stderr.isTTY` に変更
- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` / `ctx.emit` の初期定義。本 ADR の EventBus 経由出力パターンの前提
- [2026-04-27-cli-core-pipeline](./2026-04-27-cli-core-pipeline.md) — CLI/core/pipeline レイヤー分離原則。本 ADR の「pipeline は表示を知らない」設計の根拠
