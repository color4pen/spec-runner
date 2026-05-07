# propose の delta spec ファイル配置ルール追加 + propose-session spec 更新

## Meta

- **type**: spec-change
- **slug**: propose-delta-spec-file-layout

## 背景

PR #100 で propose prompt に delta spec のセクションヘッダールール（`## MODIFIED Requirements` 等）を追加したが、ファイル配置規約が漏れていた。propose agent が `specs/<name>.delta.md` のようなフラットファイルを生成し、openspec CLI の `openspec validate` / `openspec archive` が認識できない問題が複数回発生した（PR #98, #107）。

また propose-session spec には openspec CLI ワークフローや delta spec フォーマットルールの記述がない。PR #91 と PR #100 で prompt に追加したが spec には反映されていない。

## 要件

### 1. prompt のファイル配置ルール追加

1. `src/prompts/propose-system.ts` の Delta Spec Format Rules に以下を追加:
   - delta spec は `openspec/changes/<slug>/specs/<capability-name>/spec.md` に配置すること
   - `specs/<name>.delta.md` 等のフラットファイルは禁止
   - `<capability-name>` は `openspec/specs/` 配下の既存ディレクトリ名と一致すること

### 2. propose-session spec の更新

2. `openspec/specs/propose-session/spec.md` に以下を delta spec として追加:
   - openspec CLI ワークフロー（`openspec new change` → `openspec status` → `openspec instructions`）の使用
   - delta spec フォーマットルール（セクションヘッダー + ファイル配置）
   - commit 前の `openspec validate` 実行

## 受け入れ基準

- [ ] prompt にファイル配置ルールが明記されている
- [ ] propose-session spec に openspec CLI ワークフロー + delta spec ルールが delta spec として含まれている
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が `openspec validate` を pass する
