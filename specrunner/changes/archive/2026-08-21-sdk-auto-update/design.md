# Design: Claude Agent SDK 依存更新 PR 自動化

## Context

現在 `@anthropic-ai/claude-agent-sdk`（`optionalDependencies`、`^0.2.128`）の更新は手動運用であり、upstream は既に 0.3.x に達している。`.github/dependabot.yml` および renovate 設定は存在しない。

- `bun.lock` はテキスト（JSON）形式で存在し、GitHub Actions runner も lockfile から復元する。Dependabot は `package-ecosystem: "bun"` でテキスト形式 bun.lock を正式サポートしている（公式 docs 確認済み）。
- CODEOWNERS: `/.github/` は @color4pen 所有（本 PR は code owner review 対象）。`package.json` / `bun.lock` は CODEOWNERS 対象外（Dependabot が生成する更新 PR は code owner review なしで人間が merge できる）。
- SDK 更新は unit CI が検知できない層（同梱 binary の platform 解決・agent 実行挙動）に影響した実績があり、CI green のみでは安全性を保証できない。

## Goals / Non-Goals

**Goals**:
- `.github/dependabot.yml` を追加し、週次で `@anthropic-ai/claude-agent-sdk` の更新 PR を Dependabot が自動生成するようにする
- 対象を `@anthropic-ai/claude-agent-sdk` のみに限定する（`allow` フィルタ）
- auto-merge に相当する設定を一切含めない
- 設定の不変条件をテストで固定する（ファイル parse + assert）
- 導入 PR の説明（背景セクション）に人間 merge 必須の運用根拠と、初回更新が 0.x minor 境界越えの大型更新になる旨をコメントで明示する

**Non-Goals**:
- 更新 PR の auto-merge
- SDK 以外の依存（bun 本体・devDependencies）の自動更新
- SDK 更新時の pipeline 実地スモーク（将来の別 request）

## Decisions

### D1: Dependabot を採用（Renovate は却下）

**Rationale**: GitHub ネイティブの Dependabot は外部サービス追加なしで動作し、テキスト形式 bun.lock の正式サポートが公式ドキュメントで確認済み。Renovate は追加の外部サービス設定コストがあり利点がない。architect 評価済み。

**Alternatives considered**: Renovate — 却下（外部サービス設定コストに対して利点なし）。GitHub Actions での手動 bun update スケジュール — 却下（lockfile コミットの自動化が複雑になる）。

### D2: `allow` フィルタで対象を単一 SDK に限定

**Rationale**: 依存極小の方針に従い、Dependabot が触れる範囲を `@anthropic-ai/claude-agent-sdk` に絞る。`allow` なしだと全依存が対象になり、意図しない PR が生成される。

**Alternatives considered**: `ignore` リストで他依存を除外 — 却下（新しい依存が追加されるたびに ignore 更新が必要で脆い）。

### D3: テストは文字列ベースのアサーションで依存関係を増やさない

**Rationale**: 既存テスト群（`grep-workflow-actions-pinned.test.ts` 等）は `.yml` ファイルを `node:fs/promises` で読んで文字列マッチングする一貫したパターンを持つ。YAML パーサーライブラリを追加すると devDependencies が増えるが、確認すべき invariant（`package-ecosystem`・`interval`・`dependency-name`・`auto-merge` 不在）は構造的に安定しており文字列アサーションで十分。

**Alternatives considered**: `js-yaml` / `yaml` パッケージ追加 — 却下（追加依存コストに対して利点が小さい）。Bun 組み込み YAML API — 存在しない。

### D4: 初回大型更新の運用注記は `.github/dependabot.yml` の YAML コメントに記載

**Rationale**: PR body は `body-template.ts` が request.md の `背景` セクションを自動レンダリングする（人間 merge 必須の根拠が含まれる）。初回更新が 0.x minor 境界を越える大型更新である点は、設定ファイル自体に YAML コメントとして残すことで、設定を参照する運用者が必ず目にできる。

**Alternatives considered**: PR body テンプレートを変更して要件セクションを追加レンダリング — 却下（body-template.ts のスコープ変更はこの request の対象外）。

### D5: caret range `^0.2.128` を維持

**Rationale**: architect 決定。range を広げた暗黙更新は却下。更新は必ず lockfile 更新 PR として可視化する。

## Risks / Trade-offs

**[Risk]**: Dependabot `bun` エコシステムサポートの変更または制限  
→ **Mitigation**: 正式サポートは公式 docs で確認済み（request-review 検証済み）。変更があれば手動設定更新で対応。

**[Risk]**: CODEOWNERS により `/.github/` への変更が @color4pen の review ゲートを通るまで待機  
→ **Mitigation**: これは意図した動作。導入 PR は一度きりでその後の SDK 更新 PR は CODEOWNERS 対象外。

**[Risk]**: 初回 Dependabot PR が 0.x minor 境界を越える大型更新になり、pipeline 実地確認なしで merge されるリスク  
→ **Mitigation**: auto-merge を設定しないことで人間 merge を必須とする。dependabot.yml コメントに初回確認事項を明記。

## Open Questions

なし — 全設計判断が architect レビュー済み。
