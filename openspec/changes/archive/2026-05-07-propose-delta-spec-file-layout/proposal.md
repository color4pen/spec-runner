## Why

PR #98 と #107 で propose agent が `specs/<name>.delta.md` のようなフラットファイルを生成し、`openspec validate` / `openspec archive` が認識できない問題が複数回発生した。PR #100 で delta spec のセクションヘッダールールを追加したが、ファイル配置規約が漏れていた。また propose-session spec は PR #91・#100 で prompt に追加された openspec CLI ワークフローや delta spec ルールを反映していない。

## What Changes

- `src/prompts/propose-system.ts` の Delta Spec Format Rules セクションにファイル配置ルール（ディレクトリ構造の強制、フラットファイルの禁止、既存 capability 名との一致チェック）を追加
- `openspec/specs/propose-session/spec.md` に openspec CLI ワークフロー使用・delta spec フォーマットルール・commit 前 validation の Requirement を delta spec として追加

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

- `propose-session`: openspec CLI ワークフロー使用、delta spec フォーマットルール（セクションヘッダー + ファイル配置）、commit 前 `openspec validate` 実行の Requirement を追加

## Impact

- `src/prompts/propose-system.ts` — Delta Spec Format Rules セクションにファイル配置ルールを追記
- `openspec/specs/propose-session/spec.md` — 3 つの Requirement を新規追加
- 既存テスト・型に影響なし（prompt 文字列とスペックファイルのみの変更）
