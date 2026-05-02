# Bugfix Report: openspec-drift-cleanup

## Meta

- **reported**: 2026-05-02
- **severity**: low
- **status**: resolved

## Symptom

- **何が起きたか**: PR #51 (cli-finish-command) の `openspec archive` が delta spec sync で fail し、`--skip-specs` で迂回した。結果、`openspec/specs/cli-commands/spec.md` の Requirement header が `5 つのサブコマンド` のまま残り、実装（6 サブコマンド: init/login/run/ps/doctor/finish）と乖離している。さらに、過去の dogfooding テスト残骸 `openspec/changes/test-slug/` (verification-result.md のみ残存) が main にコミットされ削除されていない。
- **発生条件**:
  - cli-commands spec の同 Requirement を MODIFY する PR を出すと、main spec に「6」header が無いため "header not found" で archive 失敗（cascade）
  - `openspec list` 結果が test-slug で汚染される
- **エラーメッセージ**: `openspec archive cli-finish-command` 実行時、delta MODIFIED の header `### Requirement: \`specrunner\` バイナリは 6 つのサブコマンドを提供する` が main spec に存在せず、syncer が header not found で fail。

## Reproduction

- **再現手順**:
  1. `openspec validate openspec-drift-cleanup` を delta spec 未作成状態で実行 → change が無いため別エラー
  2. `openspec list` を実行 → `test-slug` が一覧に含まれることを確認
  3. `openspec/specs/cli-commands/spec.md:117-134` を grep → `5 つのサブコマンド` / `5 サブコマンド` の文字列が残存することを確認
- **再現結果**: 再現した（spec ファイル内容と changes ディレクトリの状態で確認）

## Fix

- **修正内容**:
  1. `openspec/specs/cli-commands/spec.md`: Purpose / Requirement header / body / 3 Scenario を 6 サブコマンド（init/login/run/ps/doctor/finish）に rename。`finish` の usage 説明を含めた
  2. `openspec/changes/openspec-drift-cleanup/proposal.md` / `tasks.md` / `specs/cli-commands/spec.md` を新規作成。delta は **`## RENAMED Requirements` + `## MODIFIED Requirements` 併記**（MODIFIED 単独で header を変えると "header not found" 再発するため）
  3. `openspec/changes/test-slug/` を `git rm` で削除
  4. `.gitignore` に `openspec/changes/test-slug/` を追加（`tests/pipeline-integration.test.ts` の mock が repo cwd へ writeFile するため、test 実行で再生成される。commit 再発を防止する応急策。mock を tempDir へ書く根本対策は別 request）
- **変更ファイル**:
  - `openspec/specs/cli-commands/spec.md` (M)
  - `openspec/changes/openspec-drift-cleanup/proposal.md` (A)
  - `openspec/changes/openspec-drift-cleanup/tasks.md` (A)
  - `openspec/changes/openspec-drift-cleanup/specs/cli-commands/spec.md` (A)
  - `openspec/changes/test-slug/verification-result.md` (D)
  - `.gitignore` (M)

## Verification

- **修正確認**: 再現手順で確認 → OK
  - `npx openspec validate openspec-drift-cleanup --strict` → `Change 'openspec-drift-cleanup' is valid` (exit 0)
  - `npx openspec list` → test-slug が消え、openspec-drift-cleanup が ✓ Complete として表示
  - `grep "5 サブコマンド\|5 つのサブコマンド" openspec/specs/cli-commands/spec.md` → 0 件
- **リグレッション**: Test ✓ (686/686 passed) / Type ✓ (tsc --noEmit exit 0)。Build / Lint は package.json に lint script なしのため対象外

