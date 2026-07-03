# docs: Installation セクションに依存サイズ（optional SDK binary）の説明を追加する

## Meta

- **type**: chore
- **slug**: docs-install-dependency-size
- **base-branch**: main
- **adr**: false

## 背景

デフォルトインストールで node_modules が数百 MB 増える。原因は provider SDK の platform binary（`@anthropic-ai/claude-agent-sdk` と `@openai/codex-sdk`、いずれも optionalDependencies で既定インストール）。多くのユーザーは local runtime か codex のどちらか一方しか使わないため、両方入れる必要はない。README には `--omit=optional` の案内はあるが「なぜ slim 化したいのか」の動機（サイズ）が書かれていないため、選択肢が伝わらない。依存極小がこのプロダクトの最大の長所であり、その事実を導入時点で可視化する。

## 現状コードの前提

<!-- 未検証の前提。実装時に再確認する。 -->

- README の Installation セクション（`README.md:45` 付近）に `--omit=optional` を使う slim install 手順はある（`README.md:55-59`）が、デフォルト install のサイズとその内訳（どの SDK の binary が効いているか）の説明が無い
- 必須依存は `@anthropic-ai/sdk` のみ。`@anthropic-ai/claude-agent-sdk`（local runtime 用）と `@openai/codex-sdk`（Codex 用）は optionalDependencies で既定インストールされる

## 要件

1. README の Installation セクションに、デフォルトインストールで node_modules が大きく増えること・その原因が optional な provider SDK の platform binary であることを明記する。SDK ごとのサイズ内訳を、**実装時に現行の実測値を確認して**記載する（推測値を断定しない）
2. 使う runtime の SDK だけを入れて install を slim 化する方法を、動機（サイズ削減）とともに案内する（既存の `--omit=optional` 手順に説明を補う）

## スコープ外

- package.json の依存構成そのものの変更（optional → 別扱い等）
- グローバルインストール推奨への方針転換の実装（1.0 安定後の検討事項として本文に軽く触れるに留める）
- README 以外のドキュメント再構成（無人運用ストーリーへの Quick Start 再構成は別 request）

## 受け入れ基準

- [ ] README の Installation セクションに、デフォルト install のサイズと SDK 別内訳（実測値）が追記されている
- [ ] 使う runtime の SDK だけを入れる slim install 手順に、サイズ削減という動機の説明が付いている
- [ ] `typecheck` green / `lint` green / `build` 成功
