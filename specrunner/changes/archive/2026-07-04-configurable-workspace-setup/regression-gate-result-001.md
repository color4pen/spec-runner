# Regression Gate Result — Iteration 1

- **change**: configurable-workspace-setup
- **iteration**: 1
- **verdict**: approved

## Findings Verification

### [HIGH] TC-025/TC-026: LocalRuntime 統合ワイヤリングテスト
- **file**: tests/unit/core/runtime/local.test.ts
- **status**: fixed
- **evidence**: TC-025（lines 852–875）: `workspaceSetup` 注入時に `manager.create` の第6引数（index 5）が `{ kind: "commands", commands: [{ run: "uv sync" }] }` であることを assert している。TC-026（lines 878–904）: `workspaceSetup` 未注入かつ `bun.lock` が存在する場合に `{ kind: "detect-install" }` が渡されることを assert している。両テスト存在確認済み。

### [HIGH] TC-002: 複数コマンド fail-fast（cmd1 失敗→cmd2 未実行）
- **file**: tests/core/worktree/manager.test.ts
- **status**: fixed
- **evidence**: TC-002（lines 612–640）: `commands` 配列の cmd1（`uv sync`）が exit 1 で失敗したとき、`sh -c` の呼び出し回数が 1 件のみで cmd2（`pip install -r requirements.txt`）が spawn されていないことを `expect(shCalls).toHaveLength(1)` で固定している。

### [HIGH] TC-028: factory での config.workspace.setup → LocalRuntime.workspaceSetup 配線テスト
- **file**: tests/unit/core/runtime/factory.test.ts
- **status**: fixed
- **evidence**: TC-028（lines 97–118）: `createRuntime(config, ...)` に `config.workspace.setup = ["uv sync"]` を渡したとき `LocalRuntime.workspaceSetup` が `["uv sync"]` になること、および未設定時は `undefined` になることを2ケースで assert している。

## Summary

全3件の findings が現在のコードで修正済みであることを確認した。リグレッションなし。
