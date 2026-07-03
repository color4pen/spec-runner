# Tasks: docs — Installation セクションに依存サイズの説明を追加

## T-01: optional SDK の実測インストールサイズを計測する

- [ ] クリーンな一時ディレクトリを作り、`npm install @anthropic-ai/claude-agent-sdk` の node_modules サイズを `du -sh node_modules` で計測する
- [ ] 同様に `npm install @openai/codex-sdk` の node_modules サイズを計測する
- [ ] 両 SDK を同時にインストールした場合の合計 node_modules サイズも計測する
- [ ] インストールした各 SDK のバージョン（`npm ls` 出力）を記録する
- [ ] `@color4pen/specrunner` のデフォルトインストール（optional 込み）と `--omit=optional` のサイズ差分も計測して確認する

**Acceptance Criteria**:
- 各 SDK 単独インストール時の node_modules サイズ（MB 単位）が実測値として記録されている
- インストール済みバージョンが記録されている

---

## T-02: README.md の Installation セクションにサイズ情報と動機を追記する

前提: T-01 の計測値が揃っていること。

- [ ] `README.md:55` 付近の以下のテキストを変更する:

  **変更前**:
  ```
  Provider SDKs (`@anthropic-ai/claude-agent-sdk` for local runtime, `@openai/codex-sdk` for Codex) ship as optional dependencies and install by default. To slim the install:
  ```

  **変更後の方針**（具体的な数値は T-01 の実測値で埋める）:
  ```
  Provider SDKs (`@anthropic-ai/claude-agent-sdk` for local runtime, `@openai/codex-sdk` for Codex) ship as optional dependencies and install by default. Their platform binaries add approximately N MB to `node_modules` (claude-agent-sdk X MB, codex-sdk Y MB as of vA.B.C / vD.E.F). Most users need only one runtime. To reduce install size by ~N MB, install with `--omit=optional` and add only the SDK you use:
  ```

  N, X, Y は T-01 で計測した実測値、vA.B.C / vD.E.F は記録したバージョンで置き換える。

- [ ] 既存の bash コードブロック（`--omit=optional` 手順）はそのまま維持する

**Acceptance Criteria**:
- Installation セクションに実測値を用いたサイズ情報（全体・SDK 別内訳・バージョン）が追記されている
- 動機（サイズ削減）が slim install 手順の直前に明示されている
- 既存の `--omit=optional` コードブロックが維持されている
- `bun run typecheck` green（README 変更のみのため型エラーは発生しないはずだが確認する）
- `bun run lint` green
- `bun run build` 成功
