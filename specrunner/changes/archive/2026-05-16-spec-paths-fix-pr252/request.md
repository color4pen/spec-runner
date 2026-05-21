# spec authority 文書の旧 path 参照を PR #252 の新構造に更新する

## Meta

- **type**: bug-fix
- **slug**: spec-paths-fix-pr252
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

PR #252 で `specrunner/requests/` → `specrunner/changes/{active,merged,canceled}/` の構造再編を実施したが、2 つの spec authority 文書に旧 path 参照 (`specrunner/requests/...`) が残っている。code-reviewer の verify (acceptance criterion 14) で FAIL 判定されている。

関連 issue: https://github.com/color4pen/spec-runner/issues/253

## 目的

spec 自体が source of truth として機能するよう、参照整合性を回復する。コード動作には影響しないが、放置すると spec 経由で読む reader を誤誘導する。

## 要件

以下 2 ファイルの旧 path 参照を新構造に書き換える:

### `specrunner/specs/cli-commands/spec.md`

- L168-200 周辺の旧 path 参照を新 path に置換

### `specrunner/specs/job-state-store/spec.md`

- L260, L275, L286, L292, L302 周辺の旧 path 参照を新 path に置換

### 置換ルール

- `specrunner/requests/active/<slug>/request.md` → `specrunner/changes/active/<slug>/request.md`
- `specrunner/requests/merged/<slug>/request.md` → `specrunner/changes/merged/<slug>/request.md`
- `specrunner/requests/<state>/` (一般) → `specrunner/changes/<state>/`

## スコープ外

- 他 spec ファイルの textual cleanup（grep ヒットがなければ触らない）
- コード側の path 参照（PR #252 で対応済み前提）
- request lifecycle 仕様自体の更新

## 受け入れ基準

- [ ] `grep -rn "specrunner/requests/" specrunner/specs/` が **0 hit**
- [ ] 上記 2 ファイル以外の spec 文書が変更されていない（前述 grep が他ファイルを示さない場合）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
