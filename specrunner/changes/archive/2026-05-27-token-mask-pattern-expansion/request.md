# token mask パターン拡充 (ghu_*, ghs_*, github_pat_*)

## Meta

- **type**: spec-change
- **slug**: token-mask-pattern-expansion
- **base-branch**: main
- **adr**: false
- **issue**: #426

## 背景

verbose log の token マスキング (`src/logger/stdout.ts` の `MASK_PATTERNS`) が `gho_*`, `ghp_*`, `ghr_*` のみ対応で、`ghu_*` (GitHub user-to-server token), `ghs_*` (GitHub server-to-server token), `github_pat_*` (fine-grained PAT) がマスクされない。Batch A の file-permission-hardening で log ファイルの permission は 0600 に制限されたが、マスク漏れは多層防御の穴になる。

## 対象ファイル

- `src/logger/stdout.ts:141-146` — MASK_PATTERNS 配列を以下に置き換える:
  - `gho_*`, `ghp_*`, `ghr_*`, `ghs_*`, `ghu_*` を1つの正規表現に統合: `/\b(gh[oprsu])_[A-Za-z0-9]+/g`
  - `github_pat_*` を追加: `/\bgithub_pat_[A-Za-z0-9_]+/g`
  - `sk-ant-*` は現状維持

## スコープ外

- maskSensitive 関数のロジック変更（prefix 抽出方式など）は行わない
- テスト追加は specrunner pipeline のテスト生成に委ねる

## 受け入れ基準

- `ghu_*`, `ghs_*`, `github_pat_*` が maskSensitive でマスクされること
- 既存の `sk-ant-*`, `gho_*`, `ghp_*`, `ghr_*` のマスクが引き続き動作すること
- MASK_PATTERNS の正規表現が3パターン以下に統合されていること
