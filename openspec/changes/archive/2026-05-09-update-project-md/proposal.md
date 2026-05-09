# Proposal: update-project-md

## Summary

`openspec/project.md` を現行の CLI-first アーキテクチャに全面書き換えする。propose agent の設計判断に直接影響するファイルであり、古い Next.js/React/SSE 記述の除去が急務。

## Approach

既存の project.md を全面置換する。セクション構成は維持しつつ（Stack / Architecture / Directory Structure）、全内容を現行コードベースの実態に合わせる。

### 変更対象

| File | Action | 理由 |
|------|--------|------|
| `openspec/project.md` | 全面書き換え | Next.js → CLI-first への転換を反映 |

### 書き換え内容

1. **ヘッダー**: Web アプリケーション → CLI ツールに変更
2. **Stack セクション**: package.json の dependencies/devDependencies を正確に反映
3. **Architecture セクション**: CLI-first dual runtime、10 ステップ pipeline、設計パターン
4. **Directory Structure セクション**: src/ 配下の現行構造に更新

## Risk

- **Low**: ドキュメントのみの変更。ソースコードへの影響なし
- `bun run typecheck && bun run test` は既存テストの成否に依存（project.md 変更では壊れない）

## Out of Scope

- specs/ 配下の仕様ファイル更新
- ソースコード変更
- README.md 更新
