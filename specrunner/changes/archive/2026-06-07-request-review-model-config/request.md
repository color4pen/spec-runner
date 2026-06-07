# `specrunner request review` に `--model` フラグを追加する

## Meta

- **type**: new-feature
- **slug**: request-review-model-config
- **base-branch**: main
- **adr**: false

## 背景

`specrunner request review` のモデルは config の解決チェーン（`getStepExecutionConfig`）で決まるが、CLI から一時的に別モデルで試す手段がない。`--model <model-name>` フラグがあれば、config を変えずにモデルを切り替えられる。

## 要件

1. `specrunner request review` に `--model <model-name>` フラグを追加する。
2. `--model` 指定時、config の解決チェーンより優先してそのモデルを使う。
3. `--model` 未指定時は既存の挙動（config → defaults → コード定数 `claude-opus-4-5`）を維持する。

## スコープ外

- config 解決チェーン自体の変更
- pipeline step のモデル指定フラグ

## 受け入れ基準

- [ ] `specrunner request review --model claude-opus-4-8[1m] <slug>` でそのモデルが使われる
- [ ] `--model` 未指定時は config の解決チェーンで決まったモデルが使われる
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- `--model` フラグの値は `resolvedConfig.model` を上書きする形で渡す（config より優先）。request review は requestType を持たないため byRequestType ベースの注入は機能しない。
