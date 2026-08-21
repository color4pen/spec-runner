# Claude Agent SDK の依存更新 PR を自動化する

## Meta

- **type**: chore
- **slug**: sdk-auto-update
- **base-branch**: main
- **adr**: false

## 背景

`@anthropic-ai/claude-agent-sdk` は pipeline の実行基盤（同梱 Claude Code binary ごと差し替わる）だが、更新は手動 `bun update` 頼みで、気付いた時にまとめて上げる運用になっている。SDK の更新遅れは新モデル・新機能への追従遅れに直結し、更新の間隔が空くほど一度の更新の挙動差分が大きくなる。更新 PR の作成を自動化し、追従を定常化する。

merge は自動化しない。SDK 更新は CI（unit test）で見えない層 — 同梱 binary の platform 解決や agent 実行既定 — に挙動変化が出た実績があるためで、人間 merge の担保は「auto-merge を設定しない」ことによる（CODEOWNERS は根拠にしない — 下記前提参照）。

## 現状コードの前提

- `package.json:40` — `"@anthropic-ai/claude-agent-sdk": "^0.2.128"`（caret range）。upstream は 0.3.x まで進んでおり、導入直後の初回更新 PR は 0.x の minor 境界を越える大型更新になる見込み
- `.github/dependabot.yml` / renovate 設定は存在しない（自動更新なし）
- lockfile はテキスト形式の `bun.lock`。GitHub Actions runner も `bun install` で同 lockfile から復元するため、lockfile が更新の正本
- Dependabot はテキスト形式 `bun.lock` を正式サポートしている（`package-ecosystem: "bun"`）。根拠: https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories
- `CODEOWNERS` — `/.github/` は @color4pen 所有。**自動更新設定の導入 PR は code owner review 対象だが、その後の SDK 更新 PR が変更する `package.json` / `bun.lock` は CODEOWNERS 対象外**。更新 PR の人間 merge は auto-merge を設定しないことで担保する

## 要件

1. **Dependabot による weekly 更新 PR**: `.github/dependabot.yml` を追加し、`package-ecosystem: "bun"` / `directory: "/"` / weekly スケジュールで、週次チェック時に検出された `@anthropic-ai/claude-agent-sdk` の新バージョンの更新 PR（`package.json` + `bun.lock`）が自動で作られるようにする。
2. **対象の限定**: `allow` の `dependency-name` で `@anthropic-ai/claude-agent-sdk` のみに限定する。他の依存は対象外（依存極小の方針）。
3. **merge は自動化しない**: auto-merge に相当する設定を入れない。更新 PR は CI を通した上で人間が merge する。
4. **初回更新の運用注記**: 初回 PR は 0.x minor 境界を越える大型更新になるため、定常的な patch 更新と区別し、人間が pipeline の実地動作まで確認してから merge する前提を導入 PR の説明（PR body）に明記する。

## スコープ外

- 更新 PR の auto-merge
- SDK 以外の依存（bun 本体・devDependencies）の自動更新
- SDK 更新時の pipeline 実地スモーク（更新 PR 上で job を走らせる仕組み）— 将来の別 request

## 受け入れ基準

- [ ] `.github/dependabot.yml` が追加され、`package-ecosystem: "bun"`・weekly・`allow` による `@anthropic-ai/claude-agent-sdk` 限定を設定検査テストで固定する（設定ファイルを parse して assert する）
- [ ] auto-merge に相当する指定が含まれないことを同テストで固定する
- [ ] 導入 PR の説明に初回大型更新の運用注記（実地確認後の人間 merge）が含まれる
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **Dependabot 採用で確定**: テキスト形式 `bun.lock` の正式サポートが公式ドキュメントで確認できるため、ツール選定の調査工程は不要。Renovate は却下（追加の外部サービス設定に対して利点がない）。
- **PR 自動・merge 人間**: SDK は同梱 binary ごと変わるため、unit CI green ≠ pipeline 無変化。全自動 merge は却下。
- **caret range の据え置き**: range を広げて暗黙更新する案は却下。更新は必ず lockfile 更新 PR として可視化する。
