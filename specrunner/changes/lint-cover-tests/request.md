# eslint の対象に tests/ を加える

## Meta

- **type**: chore
- **slug**: lint-cover-tests
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`eslint.config` が `tests/**` / `**/*.test.ts` / `**/__tests__/**` を `ignores` に入れており、テストコードは一切 lint されていない。このため整形崩れやスタイル違反がテスト側で全ゲートを素通りする。

ignore を外すと現状 74 件の違反が表面化する（内訳: `@typescript-eslint/no-unused-vars` 63 / `no-explicit-any` 2 / `no-non-null-asserted-optional-chain` 2 ほか）。`lint` は `--max-warnings 0` 運用のため、warning も含め解消するか、テスト向けにルールを調整する必要がある。

## 要件

1. `package.json` の lint スクリプトのターゲットを `./src` から `./src ./tests` に変更し、eslint の `ignores` から `tests/**` / `**/*.test.ts` / `**/__tests__/**` を外す。これにより `bun run lint` がテストコードを含めて走査する。
2. テスト側で過剰なルール（テストでは妥当な書き方を不当に弾くもの）があれば、テスト向けの override block でルールを調整する。どのルールを緩めたかが config 上で追える形にする。
3. 表面化した違反を解消し、`src` + `tests` 全体で `lint --max-warnings 0` が green になる。

## スコープ外

- プロダクションコード（`src/`）のロジック変更。
- `GitHubClient` mock の共有 factory 化（別 request）。

## 受け入れ基準

- [ ] eslint が `tests/` 配下を lint 対象に含む
- [ ] `bun run lint`（`--max-warnings 0`）が `src` + `tests` 全体で green
- [ ] テスト向けにルールを緩めた場合、その範囲と理由が config 上で明示されている
- [ ] `bun run typecheck && bun run test` が green（テストの挙動・件数の回帰なし）

## architect 評価済みの設計判断

- 違反解消は原則「コードを直す」。ルールを緩めるのは、テストで正当な記法（例: fixture の意図的な未使用引数）を弾く場合に限り、対象を tests に絞った override で行う。グローバルにルールを無効化しない。
