# Design: cleanup-openspec-directory

## 概要

R2（remove-openspec-cli-dependency）完了後の掃除として、`openspec/` ディレクトリ内の不要ファイルを削除し、active change を `specrunner/changes/` に移行する。

## 設計判断

### D1: git mv による active change 移行

`openspec/changes/` 配下の 27 件の active change を `git mv` で `specrunner/changes/` に移動する。git history が追跡される。

既に `specrunner/changes/` に同名のディレクトリが存在する場合（`test-slug`, `cleanup-openspec-directory` 自体）は移行対象外とする。

### D2: archive は rm -rf

`openspec/changes/archive/`（70 件）は git history に残っているため復元可能。`git rm -rf` で削除し、ディスク上の肥大化を防ぐ。

### D3: specs/ 一括削除

`openspec/specs/`（45 件）は `collectSpecsList()` が既に空配列を返す実装で消費者不在が確認済み。`git rm -rf` で削除する。

### D4: specsDirRel() と関連コードの完全除去

`paths.ts` の `SPECS_DIR` 定数と `specsDirRel()` を削除。import 先の 2 ファイルも修正:

- `src/git/dynamic-context.ts`: `specsDirRel` import 除去、`collectSpecsList` 関数削除、`DynamicContext.specsList` フィールド削除
- `src/prompts/propose-system.ts`: `specsDirRel` import 除去、`_specsDir` 変数削除、プロンプト内の baseline spec 参照ルール（MODIFIED headers の照合ルール等）を削除

### D5: propose-system.ts の Delta Spec Rules 更新

baseline spec が消滅するため:
- Rule 3（MODIFIED headers が `openspec/specs/<spec>/spec.md` と一致すべき）は削除
- Rule 7 の「既存ディレクトリ名と一致」制約は削除（新規 capability 名のみ許可に簡素化）
- Self-review checklist から対応項目を除去

### D6: workflow-structure.ts に changes/ チェック追加

現在 `specrunner/requests/{active,merged}` のみチェック。`specrunner/changes/` の存在チェックを追加する（warn レベル）。

### D7: openspec/project.md は据え置き

`openspec/project.md` は agent のプロジェクト理解アンカーとして残す。移動しない。

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `openspec/changes/` (27 active) | `specrunner/changes/` へ git mv |
| `openspec/changes/archive/` (70 件) | git rm -rf |
| `openspec/specs/` (45 件) | git rm -rf |
| `src/util/paths.ts` | `SPECS_DIR`, `specsDirRel()` 削除 |
| `src/git/dynamic-context.ts` | `specsList` 関連コード除去 |
| `src/prompts/propose-system.ts` | `_specsDir` 除去、baseline spec 参照ルール削除 |
| `src/core/doctor/checks/repo/workflow-structure.ts` | `specrunner/changes` チェック追加 |

## リスク

- **名前衝突**: `openspec/changes/` と `specrunner/changes/` に同名ディレクトリがある場合 → D1 で除外ルールを定義済み
- **propose-system.ts の prompt 変更**: Delta Spec ルールが変わるため、次回 propose 実行時の出力品質に影響 → 不要ルール削除のみなので品質低下なし
