# Design: managed-reset-status-stale-guard

## Overview

`managed reset` / `managed status` が `runtime !== "managed"` の状態でも安全に振る舞うよう defensive guard を追加する。stale な managed 関連設定（`agents` / `environment.id`）の存在を可視化し、`reset` 時は確認なしに destructive 操作を実行しない。

## 変更方針

### stale 判定ロジック

`runtime !== "managed"` かつ以下のいずれかが truthy の場合を「stale managed config」とする:

- `config.environment?.id` が truthy
- `Object.keys(config.agents ?? {}).length > 0`

ヘルパー関数 `hasStaleManagedConfig(config)` を `src/cli/managed.ts` 内に追加する。

### Modified Files

| File | Change |
|------|--------|
| `src/cli/managed.ts` | `runManagedStatus` に stale 列挙、`runManagedReset` に runtime 不一致 guard、`hasStaleManagedConfig` ヘルパー追加 |
| `src/cli/command-registry.ts` | `MANAGED_RESET_USAGE` の help text 更新 |
| `tests/unit/cli/managed.test.ts` | 新規テストケース追加 |

### New Files

| File | Role |
|------|------|
| `specrunner/specs/managed-cli-commands/spec.md` | 新規 capability spec |

## Design Decisions

### D1: promptConfirm の TTY guard

既存の `promptConfirm()` は `readline.createInterface({ input: process.stdin })` を使っており、non-TTY でも readline が EOF まで待つ動作になる。runtime 不一致ガードでは **`promptConfirm` 呼び出し前に** `process.stdin.isTTY` を判定し、non-TTY + `--force` なしの場合は即時中断する。`rm` コマンド (`src/core/rm/runner.ts:143-145`) のパターンに準拠。

### D2: 二重確認の防止

`runtime !== "managed"` のとき、新規の runtime 不一致 confirmation prompt 1 本に統一する。既存の destructive 確認 prompt（`managed.ts:173-181`「This will delete the Anthropic Environment...」）は runtime 不一致時にスキップする。理由: managed 環境への destructive call は走らないため confirmation を重ねる必要がない。

分岐構造:

```
if (config.runtime !== "managed") {
  // 新規: stale guard prompt (non-TTY → 即中断, TTY → y/N, --force → skip)
  // → stale fields のみ reset
  // → メッセージ "Reset stale managed fields."
} else {
  // 既存: destructive prompt (--force → skip)
  // → SDK delete + full reset
  // → メッセージ "Config reset."
}
```

### D3: 完了メッセージの出し分け

- `runtime === "managed"`: 既存の `logSuccess("Config reset.")` + orphan warning を維持
- `runtime !== "managed"`: `logSuccess("Reset stale managed fields.")` を出力。orphan warning は不要（stale 状態の cleanup であり、新たに orphan を生まない）

### D4: `--force` flag の拡張

`--force` は既に実装済み (`command-registry.ts:151`)。本変更で「runtime 不一致時の confirmation prompt も bypass する」挙動を追加する。help text を更新してこの拡張を反映する。

## Data Flow

### `managed status` (runtime !== managed)

```
runManagedStatus()
  ├─ loadConfig()
  ├─ config.runtime !== "managed"
  │   ├─ stdout: "Runtime: local (managed setup not required)"
  │   ├─ hasStaleManagedConfig(config) === true?
  │   │   ├─ stdout: "Stale managed config detected:"
  │   │   ├─ stdout: "  - environment.id: env-xxx"    (if truthy)
  │   │   └─ stdout: "  - agents.<role>: <agentId>"   (for each agent)
  │   └─ return
  └─ (managed path: 既存挙動そのまま)
```

### `managed reset` (runtime !== managed)

```
runManagedReset({ force })
  ├─ loadConfig()
  ├─ config.runtime !== "managed"
  │   ├─ hasStaleManagedConfig(config) === false → "No stale managed config. Nothing to reset." + return
  │   ├─ stderr: "Warning: runtime is \"<value>\", not \"managed\". This will reset stale managed fields only."
  │   ├─ !force && !process.stdin.isTTY → "Non-interactive mode requires --force." + return
  │   ├─ !force → promptConfirm("Proceed? [y/N] ") → n → "Aborted." + return
  │   ├─ SDK delete (if environment.id && apiKey)
  │   ├─ config 更新: agents={}, environment 削除
  │   └─ logSuccess("Reset stale managed fields.")
  └─ config.runtime === "managed"
      ├─ (既存 destructive prompt: --force → skip)
      ├─ SDK delete + full reset
      └─ logSuccess("Config reset.") + orphan warning
```

## Non-Goals

- `promptConfirm` の共通ユーティリティ化（`rm/runner.ts` と `managed.ts` で別実装が存在するが、統一はスコープ外）
- `managed setup` 側の defensive 化
- runtime detection ロジックの変更
