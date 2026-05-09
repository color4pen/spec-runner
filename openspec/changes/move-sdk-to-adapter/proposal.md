## Why

`src/sdk/` が `src/adapter/` 層の外に配置されており、`@anthropic-ai/sdk` への直接依存が adapter 境界を超えて漏洩している。`src/core/runtime/factory.ts` が `src/sdk/client.js` を import しているため、core 層が外部 SDK に間接依存する経路が存在する（architect レビュー Finding #6, MEDIUM）。module-boundary spec の「core は adapter を import しない」「SDK import は adapter/ に集約」の原則に違反している。

## What Changes

- `src/sdk/client.ts` と `src/sdk/environments.ts` を `src/adapter/managed-agent/` へ移動
- `src/sdk/agents.ts`（未使用デッドコード）と `src/sdk/sessions.ts`（`adapter/managed-agent/sdk/sessions.ts` と重複）を削除
- `factory.ts` の `createAnthropicClient` 呼び出しを DI に変更し、core 層から SDK/adapter 依存を除去
- 全 import パスを更新し `src/sdk/` ディレクトリを削除

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `module-boundary`: ソースレイアウト図を実態（`adapter/managed-agent/`）に合わせ、`src/sdk/` 不在の検証シナリオを追加

## Impact

- `src/sdk/client.ts` → `src/adapter/managed-agent/client.ts`（移動）
- `src/sdk/environments.ts` → `src/adapter/managed-agent/environments.ts`（移動）
- `src/sdk/agents.ts` → 削除（デッドコード）
- `src/sdk/sessions.ts` → 削除（`adapter/managed-agent/sdk/sessions.ts` に集約済み）
- `src/core/runtime/factory.ts`: DI 化。`createAnthropicClient` / `createAnthropicSessionClient` の import 除去
- `src/cli/init.ts`: import パス更新
- `src/cli/rm.ts`: import パス更新
- `src/cli/run.ts`: SessionClient を構築して `createRuntime` に渡す
- `src/cli/bootstrap.ts`: 同上
- `tests/completion.test.ts`: import パス更新
