# Step 実行パラメータの config.json 外出し

## Meta

- **type**: new-feature
- **date**: 2026-05-07
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect

## 背景

PR #91 で各 step に model / maxTurns を設定したが、値はソースコードにハードコードされている。dogfood で implementer の maxTurns: 60 が不足して pipeline が失敗した。コード変更なしで実行パラメータを調整する手段がない。

PR #60 で session timeout を撤廃した際も、「撤廃」はしたがユーザーが必要に応じて設定する口を用意しなかった。同じ轍を踏まないために、実行パラメータを config.json に外出しする。

## 目的

`~/.config/specrunner/config.json` に `steps` セクションを追加し、step ごとの model / maxTurns / timeoutMs をコード変更なしで設定可能にする。

## 要件

### 1. config schema の拡張

1. `SpecRunnerConfig` に `steps?: StepConfigMap` を追加
2. `StepConfigMap` の型定義:
```typescript
interface StepExecutionConfig {
  model?: string;       // e.g. "claude-opus-4-6[1m]"
  maxTurns?: number | null;  // null = unlimited
  timeoutMs?: number | null; // null = no timeout
}

interface StepConfigMap {
  defaults?: StepExecutionConfig;
  propose?: StepExecutionConfig;
  "spec-review"?: StepExecutionConfig;
  "spec-fixer"?: StepExecutionConfig;
  implementer?: StepExecutionConfig;
  "build-fixer"?: StepExecutionConfig;
  "code-review"?: StepExecutionConfig;
  "code-fixer"?: StepExecutionConfig;
}
```
3. `null` は「制限なし」を意味する（maxTurns: null = unlimited、timeoutMs: null = no timeout）
4. 未指定フィールドは次の優先順で解決:
   - config `steps.<step-name>.<field>`
   - config `steps.defaults.<field>`
   - step 定義のハードコード値（`step.agent.model` / `step.maxTurns`）
   - SDK デフォルト（maxTurns なし = unlimited）

### 2. config の読み込みと解決

5. `getStepExecutionConfig(config: SpecRunnerConfig, stepName: string): ResolvedStepConfig` を実装
6. `ResolvedStepConfig` は model / maxTurns / timeoutMs の解決済み値を持つ
7. config migration: 既存 config に `steps` がなくても正常動作（後方互換）

### 3. ClaudeCodeRunner への適用

8. ClaudeCodeRunner が `getStepExecutionConfig` で解決した値を SDK `query()` に渡す
9. `maxTurns: null` の場合は SDK に `maxTurns` を渡さない（= unlimited）
10. `timeoutMs` は将来の guard 用に解決するが、現時点では未使用（SDK に timeout パラメータがない）

### 4. specrunner init の更新

11. `specrunner init --runtime=local` で生成する config に `steps.defaults` を含める:
```json
{
  "steps": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "maxTurns": null,
      "timeoutMs": null
    }
  }
}
```
12. 既存 config がある場合は `steps` セクションが未存在時のみ追加（上書きしない）

### 5. delta spec

13. `cli-config-store` spec に `steps` セクションの定義を追加

## 受け入れ基準

- [ ] config.json に `steps` セクションを書くと step の model / maxTurns が上書きされる
- [ ] `steps.defaults.maxTurns: null` で unlimited になる（SDK に maxTurns を渡さない）
- [ ] config に `steps` がなくても既存動作が維持される（後方互換）
- [ ] `specrunner init --runtime=local` で `steps.defaults` が生成される
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が存在し `openspec validate` が pass

## 補足

### 外部 SDK 制約

- `query()` の `options.maxTurns` を省略すると unlimited
- `options.model` は文字列で任意値
- timeout は SDK 側に対応パラメータなし（将来の自前実装用に config だけ用意）

### 解決順序の例

config:
```json
{ "steps": { "defaults": { "maxTurns": null }, "implementer": { "model": "claude-opus-4-6[1m]" } } }
```

- propose: model = config defaults なし → step 定義 `claude-opus-4-6[1m]`、maxTurns = config defaults `null` → unlimited
- implementer: model = config step `claude-opus-4-6[1m]`、maxTurns = config defaults `null` → unlimited

### 関連

- メモリ: `project_step_config_externalization.md`
- PR #91: step ごと model/maxTurns ハードコード（本 request で外出し化）
- dogfood failure: maxTurns: 60 で implementer が turns 不足
