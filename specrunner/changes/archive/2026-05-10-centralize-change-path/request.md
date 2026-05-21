# openspec/changes/ のパスリテラルを changeFolderPath に集約する

## Meta

- **type**: refactoring
- **slug**: centralize-change-path
- **base-branch**: main

## 背景

`openspec/changes/<slug>/` のパスリテラルが 12 以上のファイルに散在している。パス構築を集約するユーティリティが存在せず、今後のディレクトリ移行（`openspec/changes/` → `specrunner/changes/`）で全箇所を個別に変更する必要がある。

本 request は openspec CLI 依存廃止（R2: remove-openspec-cli-dependency）の前提作業。R1 でパスを集約しておくことで、R2 の diff を最小化し移行の安全性を高める。

## 要件

1. `changeFolderPath(slug: string): string` 関数を新設する
   - 戻り値は `openspec/changes/${slug}`（R1 時点では旧パスのまま）
   - 将来の R2 でこの 1 関数の戻り値を変えるだけで全ステップのパスが切り替わる
2. 全ステップの result file path 構築を `changeFolderPath()` 経由に置換する
   - `spec-review.ts` の `buildFindingsPath`
   - `code-review.ts` の `buildReviewFeedbackPath`
   - `pr-create.ts` の `resultFilePath`
   - `spec-fixer.ts`, `code-fixer.ts`, `implementer.ts` のプロンプト内パス参照
3. propose / spec-review / test-case-gen / code-review のシステムプロンプト内パスリテラルを `changeFolderPath()` で生成した値に置換する
4. `finish/archive-openspec.ts`, `finish/preflight.ts`, `cli/finish.ts` のパスリテラルを置換する
5. `dynamic-context.ts` の `openspec/specs/`, `openspec/changes/` パスを関数化する
6. テストのパスリテラルも関数経由に書き換える

## スコープ外

- パスの値を `specrunner/changes/` に変更すること（R2 のスコープ）
- openspec CLI 呼び出しの除去（R2 のスコープ）
- proposal.md の廃止（R2 のスコープ）
- resume 時の dual-path fallback（R2 のスコープ）

## 受け入れ基準

- [ ] `changeFolderPath(slug)` が存在し、全ステップのパス構築がこの関数を経由している
- [ ] `openspec/changes/` のリテラル文字列がソースコード（テスト含む）に残っていない（`changeFolderPath` の実装内部を除く）
- [ ] 振る舞いに変更がない（全テスト pass、typecheck green）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: [test-case-generator]


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/centralize-change-path.md` by `merged-to-archive-consolidation`.
