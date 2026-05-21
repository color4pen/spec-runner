# openspec ディレクトリの整理と既存 change の移行

## Meta

- **type**: refactoring
- **slug**: cleanup-openspec-directory
- **base-branch**: main
- **depends-on**: specrunner/requests/active/remove-openspec-cli-dependency

## 背景

R2（remove-openspec-cli-dependency）で openspec CLI への依存を廃止し、パスを `specrunner/changes/` に切り替えた。本 request は R2 完了後の掃除として、openspec/ ディレクトリ内の不要ファイルを削除し、active な change を新ディレクトリに移行する。

## 要件

### 1. active change の移行

`openspec/changes/` 配下の active change（archive/ 以外）を `specrunner/changes/` に `git mv` する。

### 2. openspec/changes/ の削除

- `openspec/changes/archive/` を丸ごと削除（git history に残るため復元可能）
- `openspec/changes/` ディレクトリを削除

### 3. openspec/specs/ の削除

baseline spec 47 本を削除。消費者不在が確認済み。

### 4. paths.ts の fallback 除去

R2 で fallback ロジックが入っている場合は削除し、`specrunner/changes/` のみ返すようにする。`specsDirRel()` も不要なら削除。

### 5. doctor チェックの更新

`workflow-structure.ts` のチェック対象を `specrunner/changes/` に更新。

### 6. openspec/project.md は据え置き

openspec/project.md は agent がプロジェクトの tech stack を把握するアンカーとして機能しているため、移動しない。

## スコープ外

- openspec/project.md の移動や内容更新
- specrunner/requests/ と specrunner/changes/ の統一（別 request で検討）
- openspec-workflow/ ディレクトリへの変更

## 受け入れ基準

- [ ] `openspec/specs/` が存在しない
- [ ] `openspec/changes/` が存在しない
- [ ] `openspec/project.md` のみが openspec/ に残っている
- [ ] active change が `specrunner/changes/` に移行されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
