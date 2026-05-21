# Test Cases: gitignore-test-slug-changes

## TC-001: .gitignore に specrunner/changes/test-slug/ エントリが存在する

- **Category**: gitignore
- **Priority**: must
- **Source**: request.md 受け入れ基準 #1

**GIVEN** `.gitignore` ファイルが存在する  
**WHEN** ファイル内容を確認する  
**THEN** `specrunner/changes/test-slug/` の行が含まれている

---

## TC-002: git ls-files で test-slug/ 配下に tracked file が存在しない

- **Category**: untrack
- **Priority**: must
- **Source**: request.md 受け入れ基準 #2, tasks.md Task 2

**GIVEN** `git rm --cached` が実行されている  
**WHEN** `git ls-files specrunner/changes/test-slug/` を実行する  
**THEN** 出力が空である（pr-create-result.md, verification-result.md ともに含まれない）

---

## TC-003: bun run test 実行後に git status が clean

- **Category**: test execution
- **Priority**: must
- **Source**: request.md 受け入れ基準 #3, tasks.md Task 3

**GIVEN** `.gitignore` に `specrunner/changes/test-slug/` が追加され、既存 tracked file が untrack されている  
**WHEN** `bun run test` を実行し、その後 `git status` を確認する  
**THEN** `specrunner/changes/test-slug/` 配下のファイルが untracked にも modified にも表示されない

---

## TC-004: typecheck と test が green

- **Category**: build
- **Priority**: must
- **Source**: request.md 受け入れ基準 #4, tasks.md Task 3

**GIVEN** .gitignore 変更と git rm --cached のみが実施されている（ソースコード変更なし）  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit 0 で完了する

---

## TC-005: 将来追加される test artifact も自動で ignore される

- **Category**: gitignore
- **Priority**: should
- **Source**: design.md（ディレクトリ単位の ignore 設計判断）

**GIVEN** `.gitignore` に `specrunner/changes/test-slug/` がディレクトリ単位で登録されている  
**WHEN** テストが `specrunner/changes/test-slug/` 配下に新たなファイル（例: `specrunner/changes/test-slug/new-artifact.md`）を書き出す  
**THEN** そのファイルは git に追跡されず、git status にも現れない

---

## TC-006: openspec/changes/test-slug/ の既存 ignore が引き続き有効

- **Category**: gitignore
- **Priority**: should
- **Source**: design.md（既存パターンとの並置）

**GIVEN** `.gitignore` に `specrunner/changes/test-slug/` を追加した後も `openspec/changes/test-slug/` エントリが残っている  
**WHEN** `openspec/changes/test-slug/` 配下にファイルが書き出される  
**THEN** そのファイルは git に追跡されない（既存の ignore が破壊されていない）

---

## TC-007: ワーキングツリーのファイルは削除されない

- **Category**: untrack
- **Priority**: should
- **Source**: tasks.md Task 2（ファイルはワーキングツリーに残る）

**GIVEN** `git rm --cached` が実行されている  
**WHEN** ファイルシステムを確認する  
**THEN** `specrunner/changes/test-slug/pr-create-result.md` および `specrunner/changes/test-slug/verification-result.md` がワーキングツリーに残っている

---

## TC-008: .gitignore の追加位置が openspec/changes/test-slug/ の直後である

- **Category**: gitignore
- **Priority**: could
- **Source**: tasks.md Task 1（既存コメントのスコープに含まれる）

**GIVEN** `.gitignore` の変更差分を確認する  
**WHEN** `openspec/changes/test-slug/` 行の前後を確認する  
**THEN** `specrunner/changes/test-slug/` がその直後に配置されており、既存の `# pipeline-integration test fixture residue` コメントのスコープ内に収まっている
