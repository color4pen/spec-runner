# Tasks: cleanup-openspec-directory

## T-01: Active change の移行

`openspec/changes/` 配下の active change（archive/ 以外）を `specrunner/changes/` に `git mv` する。

- [x] `openspec/changes/` 内のディレクトリ一覧を取得（archive 除外）
- [x] `specrunner/changes/` に同名が既に存在するものを除外（`cleanup-openspec-directory`, `test-slug`）
- [x] 残りの全ディレクトリを `git mv openspec/changes/<name> specrunner/changes/<name>` で移動
- [x] 移動後、`specrunner/changes/` に全ディレクトリが存在することを確認

**受け入れ基準**: `openspec/changes/` に archive/ のみが残り、active change が全て `specrunner/changes/` に存在する。

## T-02: openspec/changes/ の削除

- [x] `git rm -rf openspec/changes/archive/`
- [x] `git rm -rf openspec/changes/` で残ったディレクトリごと削除（T-01 で active は移動済みなので archive 削除後は空）

**受け入れ基準**: `openspec/changes/` ディレクトリが存在しない。

## T-03: openspec/specs/ の削除

- [x] `git rm -rf openspec/specs/`

**受け入れ基準**: `openspec/specs/` ディレクトリが存在しない。

## T-04: paths.ts から specsDirRel() を除去

ファイル: `src/util/paths.ts`

- [x] `const SPECS_DIR = "openspec/specs";` を削除（コメント含む）
- [x] `specsDirRel()` 関数を削除（JSDoc 含む）

**受け入れ基準**: `paths.ts` に `SPECS_DIR` と `specsDirRel` が存在しない。export は `changeFolderPath`, `specReviewResultPath`, `reviewFeedbackPath`, `verificationResultPath`, `prCreateResultPath`, `requestMdPath`, `changesDirRel` のみ。

## T-05: dynamic-context.ts から specsList 関連コード除去

ファイル: `src/git/dynamic-context.ts`

- [x] `import { specsDirRel, changesDirRel }` から `specsDirRel` を除去 → `import { changesDirRel }`
- [x] `DynamicContext` interface から `specsList: string[]` フィールドを削除
- [x] JSDoc コメント `/** Subdirectory names under specrunner/specs/ ... */` を削除
- [x] `collectDynamicContext()` 内の `collectSpecsList(cwd)` 呼び出しを除去し、return object から `specsList` を削除
- [x] `collectSpecsList()` 関数全体を削除
- [x] `collectChangesList()` の JSDoc コメント `Collect directories under openspec/changes/` を `Collect directories under specrunner/changes/` に修正

**受け入れ基準**: `dynamic-context.ts` に `specsList`, `specsDirRel`, `collectSpecsList` が存在しない。`DynamicContext` interface は `gitLog`, `diffStat`, `changesList` の 3 フィールドのみ。

## T-06: propose-system.ts から baseline spec 参照を除去

ファイル: `src/prompts/propose-system.ts`

- [x] import から `specsDirRel` を除去 → `import { changesDirRel, changeFolderPath }`
- [x] `const _specsDir = specsDirRel();` を削除
- [x] プロンプト内の Delta Spec Format Rules セクションから baseline spec 参照ルールを修正:
  - Rule 3（MODIFIED headers が `${_specsDir}/<spec>/spec.md` と一致すべき）を削除
  - Rule 7 の `<capability-name>` は `${_specsDir}/` 配下の既存ディレクトリ名と一致すること` を `<capability-name> は design.md で宣言した名前を使用すること` に簡素化
  - Self-review checklist から `\`## MODIFIED Requirements\` の header が \`${_specsDir}/<spec>/spec.md\` の現状 header と一致している` を削除
- [x] `buildInitialMessage()` 内の `dynamicContext.specsList` 分岐を削除（specsList が無くなるため）
- [x] `buildInitialMessage()` の `dynamicContext` 引数型から `specsList` を除去

**受け入れ基準**: `propose-system.ts` に `specsDirRel`, `_specsDir`, `specsList` が存在しない。Delta Spec ルールが baseline spec 不在の状態に整合。

## T-07: workflow-structure.ts に changes/ チェック追加

ファイル: `src/core/doctor/checks/repo/workflow-structure.ts`

- [x] `REQUIRED_DIRS` のチェック対象に `specrunner/changes` を追加、もしくは別途チェックロジックを追加（現在のチェックは `specrunner/requests/{active,merged}` のパス構造なので、changes は独立チェックが適切）
- [x] `specrunner/changes` ディレクトリが存在しない場合に warn を返す

**受け入れ基準**: `bun run test` で doctor check が pass。`specrunner/changes/` の存在がチェックされている。

## T-08: 型チェック・テスト通過確認

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `specsList` を参照していた箇所でコンパイルエラーが出ていないこと

**受け入れ基準**: `bun run typecheck && bun run test` が exit 0。
