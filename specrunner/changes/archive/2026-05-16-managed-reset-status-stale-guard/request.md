# managed reset / status を runtime != managed の状態に対して defensive 化する

## Meta

- **type**: spec-change
- **slug**: managed-reset-status-stale-guard
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #240

## 背景

PR #238 で導入した `specrunner managed` 親コマンドの `reset` と `status` は、現在の config が `runtime: "managed"` でない状態 (local or 未設定) でも以下の挙動になる:

### `runManagedReset`
- `config.runtime !== "managed"` でも `environment.id` があれば SDK の delete API を呼ぼうとする
- agents が stale な状態でも `agents: {}` にリセットする
- ユーザーが意図せず local mode で reset を実行しても警告が出ない

### `runManagedStatus`
- `runtime !== "managed"` のとき `"Runtime: local (managed setup not required)"` とだけ返す
- 残留している `agents` / `environment.id` を持つ stale config が見えない

dogfooding 単独運用では実害ほぼ無いが、defensive coding として有用。

関連 issue: #240

## 目的

`managed reset` / `managed status` が `runtime != managed` の状態でも安全に振る舞うよう defensive guard を追加する。stale な managed 関連設定の存在を可視化し、誤操作を防ぐ。

## 設計判断

1. **挙動の対称性**: `status` は read-only なので「警告 + stale 表示」、`reset` は destructive なので「警告 + 明示確認 or `--force`」に分岐
2. **stale 判定の基準**: `runtime !== "managed"` かつ以下のどれかが該当する場合に「stale managed config」とみなす:
   - `config.environment?.id` が truthy
   - `config.agents` が非空 object
3. **`--force` を導入**: `reset` の対話確認は CI 等で邪魔になるため bypass する `--force` flag を追加。明示確認は標準入力で `y/n` を取る
4. **既存 happy path への影響を出さない**: `runtime === "managed"` の通常運用での挙動は完全に維持

## 要件

### 1. `managed status` の拡張

`runtime !== "managed"` の場合の出力に以下を追加する:

- 1 行目: `Runtime: local (managed setup not required)` (既存)
- 2 行目以降: stale managed config を検出した場合に列挙
  - 例: `Stale managed config detected:`
  - `  - agents.design: agent-xxx`
  - `  - environment.id: env-xxx`
- stale なし → 既存通り 1 行で完結

### 2. `managed reset` の guard

`config.runtime !== "managed"` の場合:

- 標準エラーに警告を出力する (例: `Warning: runtime is "<value>", not "managed". This will reset stale managed fields only.`)
- `--force` flag が無い場合は標準入力で確認を取る (`Proceed? [y/N]`)
- 確認に `y` 以外が返ったら中断 (exit code 0、no-op)
- `--force` flag がある場合は確認をスキップして reset を続行
- non-TTY (= stdin が tty でない) 環境かつ `--force` 無しの場合は中断 (CI 安全側)
- **二重確認の防止**: runtime 不一致時は本要件の新規 prompt 1 本に統一する。既存 destructive 確認 prompt (`src/cli/managed.ts:173-181` の `This will delete the Anthropic Environment...`) は `runtime !== "managed"` のときスキップする (managed 環境への destructive call は走らないため confirmation を重ねる必要がない)

### 3. reset の挙動

`runtime !== "managed"` で進行する場合:

- SDK の delete API は `environment.id` が truthy のときのみ呼ぶ (既存挙動)
- agents / environment.id を clear する
- 完了後に `Reset stale managed fields.` を出力 (新規追加メッセージ)

**完了メッセージの使い分け**:

- `runtime === "managed"` のときは既存メッセージ `Config reset.` (`src/cli/managed.ts:211`) を維持する
- `runtime !== "managed"` のときは `Reset stale managed fields.` を出力する (置き換えではなく、runtime 分岐で出し分ける)

### 4. `--force` flag の挙動拡張

`managed reset` の `--force` flag は **既に実装済** (`src/cli/managed.ts:162`、`src/cli/command-registry.ts:151`)。本要件では追加ではなく、本 request で新規導入する「runtime 不一致時の confirmation prompt」を bypass する挙動を `--force` に追加する。help text の表現も「Bypass confirmation when runtime is not managed」を含むよう更新する。

### 5. test

- `managed status` が `runtime: managed` で従来通り (regression)
- `managed status` が `runtime: local` + stale config で stale 列挙される
- `managed status` が `runtime: local` + stale なしで 1 行のみ
- `managed reset` が `runtime: managed` で従来通り (regression)
- `managed reset` が `runtime: local` + `--force` で警告のみで進行
- `managed reset` が `runtime: local` + `--force` 無しで non-TTY → 中断
- `managed reset` が `runtime: local` で stdin に `n` を渡すと中断

### 6. spec authority への反映

**新規 capability `managed-cli-commands` を立てる**:

- `specrunner/specs/managed-cli-commands/spec.md` を **新設** (= delta は ADDED)
- 既存の `managed-agent-runtime/spec.md` は managed runtime (= SDK / agent definition / environment) の権威ソースとして触らない
- `cli-commands/spec.md` は managed サブコマンドを含めない (現状 managed への言及なしの状態を維持)

**新規 capability 選定理由 (調査結果)**:
- `cli-commands/spec.md` に managed の言及なし
- `managed-agent-runtime/spec.md` に reset / status / --force / stale の言及なし
- CLI ハンドラ (`src/cli/managed.ts`) 仕様は runtime 自体の仕様 (`managed-agent-runtime`) と関心軸が異なる
- 将来 `managed init / setup` 等の subcommand が増えた場合の集約先としても自然

**ADDED 内容**:

- Requirement: `managed status` は `runtime != managed` のときに stale managed config (agents / environment.id) を列挙する
- Requirement: `managed reset` は `runtime != managed` のときに警告を出し、`--force` または対話確認なしには destructive 操作を実行しない
- Requirement: `managed reset` の `--force` flag は (a) destructive な reset 全般を確認なしで進める、(b) runtime 不一致時の confirmation prompt も bypass する
- Requirement: non-TTY 環境では `--force` 無しの `managed reset` は中断する
- Scenario: `runtime: local` + stale config で `managed status` → stale 列挙
- Scenario: `runtime: local` + `managed reset` → 警告 + 確認 prompt
- Scenario: `runtime: local` + `managed reset --force` → 警告のみで実行
- Scenario: non-TTY + `managed reset` (`--force` 無し) → 中断

## スコープ外

- `managed reset` の rollback / undo
- managed init / setup 側の defensive 化
- runtime detection ロジック自体の変更

## 受け入れ基準

- [ ] `managed status` が `runtime != managed` で stale managed config を列挙する
- [ ] `managed reset` が `runtime != managed` で警告 + 確認 prompt を出す
- [ ] `managed reset --force` で確認 prompt が bypass される
- [ ] non-TTY 環境 + `--force` 無しで `managed reset` が安全に中断する
- [ ] `runtime == managed` の既存挙動が regression していない (test 付き)
- [ ] 新規 capability `specrunner/specs/managed-cli-commands/spec.md` が ADDED で作成され、上記 Requirement / Scenario が記述されている
- [ ] `managed-agent-runtime/spec.md` / `cli-commands/spec.md` は変更されていない (調査結果に基づく権威ソース分離)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
