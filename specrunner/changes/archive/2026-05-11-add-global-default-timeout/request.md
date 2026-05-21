# step config の defaults.timeoutMs を解決チェーンに組み込む

## Meta

- **slug**: add-global-default-timeout
- **type**: bug-fix
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`config.steps.defaults` に `model` と `maxTurns` は解決チェーンで参照されるが、`timeoutMs` は無視される。全ステップ共通のタイムアウトを設定するにはステップごとに個別設定する必要がある。

GitHub Issue #185。

## 目的

`steps.defaults.timeoutMs` を step-config 解決チェーンに組み込み、ステップ固有設定 > defaults > ハードコードデフォルト > SDK デフォルトの優先順位で解決されるようにする。

## 要件

1. `src/config/step-config.ts` の `getStepExecutionConfig` で `defaults.timeoutMs` を参照する。ステップ固有の `timeoutMs` がある場合はそちらを優先する
2. `src/adapter/managed-agent/agent-runner.ts` の timeout 解決ロジックも同じ解決チェーンに統一する
3. `timeoutMs` が `null` の場合は SDK デフォルトにフォールバックする（既存動作を維持）

## 受け入れ基準

- [ ] `defaults.timeoutMs` を設定すると全ステップに適用される
- [ ] ステップ固有の `timeoutMs` が `defaults` を上書きする
- [ ] `timeoutMs` 未設定時は既存動作と同じ
- [ ] `bun run typecheck` / `bun run test` が全 pass
