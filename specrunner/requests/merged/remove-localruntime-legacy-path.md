# LocalRuntime の positional legacy コンストラクタを削除する

## Meta

- **slug**: remove-localruntime-legacy-path
- **type**: refactoring
- **base-branch**: main
- **date**: 2026-05-11
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #124 で `LocalRuntime` に named options コンストラクタ（`LocalRuntimeOptions`）を追加した際、テスト20箇所が positional 呼び出しを使っていたため `cwdOrOpts: string | LocalRuntimeOptions` の union になった。production コードは全て named options に移行済みで、positional はテストのみ。union の結果 `githubClient!` の non-null assertion が入っている。

GitHub Issue #126。

## 目的

positional パスと union 型を削除し、全呼び出しを named options に統一する。non-null assertion を解消する。

## 要件

1. テストの `new LocalRuntime(cwd, githubClient, manager, spawnFn)` を全て `new LocalRuntime({ cwd, githubClient, manager, spawnFn })` に変更する
2. `LocalRuntime` コンストラクタから positional パス（`string | LocalRuntimeOptions` union）を削除し、`LocalRuntimeOptions` のみ受け付けるようにする
3. `githubClient!` の non-null assertion を削除する

## 受け入れ基準

- [ ] `LocalRuntime` コンストラクタが `LocalRuntimeOptions` のみ受け付ける
- [ ] テスト全箇所が named options で呼び出している
- [ ] non-null assertion (`!`) が解消されている
- [ ] 振る舞いが変わらない
- [ ] `bun run typecheck` / `bun run test` が全 pass
