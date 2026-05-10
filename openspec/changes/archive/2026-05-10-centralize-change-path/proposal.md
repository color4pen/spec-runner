## Why

`openspec/changes/<slug>/` のパスリテラルが 20 以上のソースファイルと 15 以上のテストファイルに散在している。パス構築を集約するユーティリティが存在しないため、今後のディレクトリ移行（R2: `openspec/changes/` → `specrunner/changes/`）で全箇所を個別に変更する必要がある。本 change はパス集約によって R2 の diff を最小化し移行の安全性を高める。

## What Changes

- `src/util/paths.ts` に `changeFolderPath(slug)` と関連ヘルパーを新設する
- 全 step の result file path 構築を `changeFolderPath()` 経由に置換する（spec-review, code-review, verification, pr-create）
- fixer step (spec-fixer, code-fixer, build-fixer, implementer) のプロンプト内パス参照を関数経由に置換する
- system prompt ファイル（propose, spec-review, test-case-gen, code-review）のパスリテラルを関数生成値に置換する
- finish 関連モジュール（archive-openspec, preflight, cli/finish）のパスリテラルを置換する
- `dynamic-context.ts` の `openspec/specs/`, `openspec/changes/` パスを関数化する
- `errors.ts` のエラーメッセージ内パスを関数経由に置換する
- テストのパスリテラルも関数経由に書き換える

## Capabilities

### New Capabilities

(なし — 新規 spec は発生しない)

### Modified Capabilities

(なし — 振る舞いは変わらない。内部リファクタリングのみ)

## Impact

- **コード**: `src/util/paths.ts` を新設。約 20 のソースファイルに import 追加とリテラル置換
- **テスト**: 約 15 のテストファイルでパスリテラルを関数呼び出しに置換
- **動作変更**: なし。全パスの値は変わらないため振る舞いは完全に保存される
- **後方互換**: 完全互換。外部から見える変更はゼロ
