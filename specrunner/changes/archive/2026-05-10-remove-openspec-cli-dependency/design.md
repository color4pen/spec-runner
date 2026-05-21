# Design: remove-openspec-cli-dependency

## Overview

openspec CLI への全依存を廃止し、SpecRunner が自律的に change folder を管理する構造に移行する。パス定数を `openspec/changes` → `specrunner/changes` に切り替え、propose prompt を template-driven に書き換え、finish/doctor から openspec 呼び出しを除去する。

## Architecture Decisions

### AD-1: パス切り替え（paths.ts）

`CHANGES_DIR` を `"specrunner/changes"` に変更。`SPECS_DIR` は廃止対象だが R3 で `openspec/specs/` 自体を削除するため、ここでは参照を残しつつ noop 化（空配列固定）する。

`requestMdPath(slug)` は change folder 内の `request.md` を返すため、パス切り替えに自動追従する。finish.ts の base-branch 解決もこの関数経由で正しく動作する。

### AD-2: propose prompt の template 化

openspec CLI ワークフロー（5 ステップの CLI ループ）を削除し、artifact checklist + self-review checklist 方式に置き換える。

生成対象 artifact:
- `specrunner/changes/<slug>/design.md`
- `specrunner/changes/<slug>/tasks.md`
- `specrunner/changes/<slug>/specs/<capability>/spec.md`（該当時）

proposal.md は生成しない。request.md は CLI が配置済みのため agent は編集しない。

Delta Spec Format Rules（既存 L99-151 相当）はそのまま維持する。validate は prompt 内 self-review checklist + spec-review の二重防御で担保。

### AD-3: finish Phase 1 の簡素化

`archiveOpenspec()` 呼び出しを除去。Phase 1 は `moveRequestsDir()` のみ実行する。
change folder のアーカイブは `specrunner/changes/<slug>/` → `specrunner/changes/archive/<slug>/` の git mv で実装する（新規関数 `archiveChangeFolder()`）。`moveRequestsDir()` の後に実行し、同一 commit に含める。

### AD-4: preflight から openspec validate を除去

Check 6（openspec validate）を削除。Check 7 の binary list から `"openspec"` を除去。
Check 5 は change folder 存在チェックとして維持するが、パスは `changeFolderPath()` 経由で自動切り替え。

### AD-5: doctor openspec check の除去

`openspecCheck`（runtime/openspec.ts）を allChecks から除去し、ファイルを削除する。
`openspecProjectMdCheck` は `required: false` に変更（openspec/project.md は R3 まで据え置き）。

### AD-6: dynamic-context の specs 廃止

`collectSpecsList()` を空配列固定にする（baseline spec は消費者不在）。
`collectChangesList()` は `changesDirRel()` 経由で自動追従するため変更不要。

### AD-7: proposal.md 参照の除去

全 prompt から `proposal.md` への参照を削除:
- `spec-review-system.ts`: review 対象リストから `proposal.md` を除去
- `test-case-gen-system.ts`: 読み込み対象から `proposal.md` を除去し、`request.md` に置換
- `propose-system.ts`: 出力 artifact リストから `proposal.md` を除去

### AD-8: request.md の change folder コピー

pipeline 起動時に `specrunner/requests/active/<slug>/request.md` を `specrunner/changes/<slug>/request.md` にもコピーする。LocalRuntime.setupWorkspace() で既存の request.md コピー処理を拡張し、change folder 内にも配置する。

これにより change folder 内で request.md が他 artifact と同居し、agent が参照しやすくなる。

### AD-9: init.ts の ENVIRONMENT_PACKAGES_NPM

`@fission-ai/openspec` を ENVIRONMENT_PACKAGES_NPM から除去する。managed runtime の Environment 作成時に openspec をインストールする必要がなくなる。

### AD-10: propose maxTurns の削減

openspec CLI ループ（5-10 turns 消費）が不要になるため、`ProposeStep.maxTurns` を 20 → 15 に削減する。

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/util/paths.ts` | MODIFY | `CHANGES_DIR` → `"specrunner/changes"` |
| `src/prompts/propose-system.ts` | REWRITE | openspec CLI ワークフロー → template 方式 |
| `src/prompts/spec-review-system.ts` | MODIFY | proposal.md 参照除去 |
| `src/prompts/test-case-gen-system.ts` | MODIFY | proposal.md → request.md 置換 |
| `src/core/finish/archive-openspec.ts` | DELETE | openspec archive 呼び出し不要 |
| `src/core/finish/orchestrator.ts` | MODIFY | archiveOpenspec 除去、archiveChangeFolder 追加 |
| `src/core/finish/preflight.ts` | MODIFY | Check 6/7 から openspec 除去 |
| `src/core/finish/archive-change-folder.ts` | CREATE | change folder の git mv アーカイブ |
| `src/core/doctor/checks/runtime/openspec.ts` | DELETE | openspec binary check 不要 |
| `src/core/doctor/checks/repo/openspec-project-md.ts` | MODIFY | `required: false` |
| `src/core/doctor/checks/index.ts` | MODIFY | openspecCheck import/登録除去 |
| `src/git/dynamic-context.ts` | MODIFY | `collectSpecsList()` → 空配列固定 |
| `src/core/runtime/local.ts` | MODIFY | request.md の change folder コピー追加 |
| `src/core/step/propose.ts` | MODIFY | maxTurns 20 → 15, コメント更新 |
| `src/cli/init.ts` | MODIFY | ENVIRONMENT_PACKAGES_NPM から openspec 除去 |
| テストファイル群 | MODIFY | 上記変更に対応するテスト修正 |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| delta spec の品質低下（validate 廃止） | prompt self-review checklist + spec-review の二重防御。品質低下が観測された場合に別途 validator 検討（YAGNI） |
| 既存 change folder との互換 | R3 で `openspec/changes/` を物理削除するまで共存。パス切り替え後も archive 内の旧パスは参照されない |
| managed runtime で openspec が必要な既存 Environment | init 再実行で Environment が再作成される。既存 Environment は手動削除 |
