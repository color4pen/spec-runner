# Test Cases: cleanup-openspec-directory

## Meta

- **Source tasks**: T-01〜T-08 (tasks.md)
- **Generated**: 2026-05-11

---

## TC-01: active change が specrunner/changes/ に移行されている

- **Category**: filesystem
- **Priority**: must
- **Source**: T-01, request 受け入れ基準

**GIVEN** R2 完了後の状態で `openspec/changes/` に archive 以外の active change ディレクトリが存在する  
**WHEN** T-01 の移行操作が完了する  
**THEN**
- `openspec/changes/` に存在していた active change（archive 以外）が全て `specrunner/changes/` に存在する
- 移行前後でディレクトリ名が変わっていない
- 各ディレクトリ内のファイル（request.md, design.md, tasks.md 等）が保持されている

---

## TC-02: 同名ディレクトリの衝突を回避している

- **Category**: filesystem
- **Priority**: must
- **Source**: T-01, design D1

**GIVEN** `specrunner/changes/` に既に `cleanup-openspec-directory` や `test-slug` が存在する  
**WHEN** T-01 の移行操作が完了する  
**THEN**
- `cleanup-openspec-directory` と `test-slug` は移行対象から除外されており、上書きされていない
- `specrunner/changes/cleanup-openspec-directory/` の内容は移行前と同一である

---

## TC-03: openspec/changes/ ディレクトリが存在しない

- **Category**: filesystem
- **Priority**: must
- **Source**: T-02, request 受け入れ基準

**GIVEN** T-01 で active change が移行済みの状態  
**WHEN** `git rm -rf openspec/changes/archive/` および `openspec/changes/` の削除が完了する  
**THEN**
- `openspec/changes/` ディレクトリが存在しない
- git status に削除されたファイルが正しく記録されている

---

## TC-04: openspec/specs/ ディレクトリが存在しない

- **Category**: filesystem
- **Priority**: must
- **Source**: T-03, request 受け入れ基準

**GIVEN** `openspec/specs/` に 45 件の baseline spec ファイルが存在する  
**WHEN** `git rm -rf openspec/specs/` が完了する  
**THEN**
- `openspec/specs/` ディレクトリが存在しない
- `openspec/project.md` は削除されておらず、そのまま残っている

---

## TC-05: openspec/ に project.md のみが残っている

- **Category**: filesystem
- **Priority**: must
- **Source**: T-03, design D7, request 受け入れ基準

**GIVEN** T-02 と T-03 の削除が完了した状態  
**WHEN** `openspec/` ディレクトリの内容を確認する  
**THEN**
- `openspec/project.md` が存在する
- `openspec/` 直下に `project.md` 以外のファイルやディレクトリが存在しない

---

## TC-06: paths.ts から SPECS_DIR と specsDirRel が削除されている

- **Category**: code
- **Priority**: must
- **Source**: T-04

**GIVEN** `src/util/paths.ts` に `SPECS_DIR` 定数と `specsDirRel()` 関数が存在する  
**WHEN** T-04 のコード変更が完了する  
**THEN**
- `src/util/paths.ts` に `SPECS_DIR` という文字列が存在しない
- `src/util/paths.ts` に `specsDirRel` という文字列が存在しない
- `paths.ts` の export は `changeFolderPath`, `specReviewResultPath`, `reviewFeedbackPath`, `verificationResultPath`, `prCreateResultPath`, `requestMdPath`, `changesDirRel` のみである

---

## TC-07: dynamic-context.ts から specsList 関連コードが除去されている

- **Category**: code
- **Priority**: must
- **Source**: T-05

**GIVEN** `src/git/dynamic-context.ts` に `specsList`, `specsDirRel`, `collectSpecsList` が存在する  
**WHEN** T-05 のコード変更が完了する  
**THEN**
- `dynamic-context.ts` に `specsList` という文字列が存在しない
- `dynamic-context.ts` に `specsDirRel` という文字列が存在しない
- `dynamic-context.ts` に `collectSpecsList` という文字列が存在しない
- `DynamicContext` interface は `gitLog`, `diffStat`, `changesList` の 3 フィールドのみである

---

## TC-08: dynamic-context.ts の JSDoc コメントが新パスに更新されている

- **Category**: code
- **Priority**: should
- **Source**: T-05

**GIVEN** `collectChangesList()` の JSDoc が `openspec/changes/` を参照している  
**WHEN** T-05 のコード変更が完了する  
**THEN**
- `collectChangesList()` の JSDoc コメントが `specrunner/changes/` を参照している
- `openspec/changes/` への言及が `dynamic-context.ts` に残っていない

---

## TC-09: propose-system.ts から baseline spec 参照が除去されている

- **Category**: code
- **Priority**: must
- **Source**: T-06

**GIVEN** `src/prompts/propose-system.ts` に `specsDirRel`, `_specsDir`, `specsList` が存在する  
**WHEN** T-06 のコード変更が完了する  
**THEN**
- `propose-system.ts` に `specsDirRel` という文字列が存在しない
- `propose-system.ts` に `_specsDir` という文字列が存在しない
- `propose-system.ts` に `specsList` という文字列が存在しない

---

## TC-10: propose-system.ts の Delta Spec Rules が baseline spec 不在に整合している

- **Category**: code
- **Priority**: must
- **Source**: T-06, design D5

**GIVEN** Delta Spec Format Rules に `${_specsDir}/<spec>/spec.md` への参照を含む Rule 3 が存在する  
**WHEN** T-06 のコード変更が完了する  
**THEN**
- Rule 3（MODIFIED headers が `openspec/specs/<spec>/spec.md` と一致すべき）が存在しない
- Rule 7 の `<capability-name>` の制約が `design.md で宣言した名前を使用すること` に簡素化されている
- Self-review checklist から `## MODIFIED Requirements` header と `openspec/specs/` への言及が除去されている

---

## TC-11: workflow-structure.ts が specrunner/changes/ の存在をチェックしている

- **Category**: code
- **Priority**: must
- **Source**: T-07, design D6

**GIVEN** `workflow-structure.ts` が `specrunner/requests/{active,merged}` のみをチェックしている  
**WHEN** T-07 のコード変更が完了する  
**THEN**
- `specrunner/changes` の存在チェックが `workflow-structure.ts` に追加されている
- `specrunner/changes` ディレクトリが存在しない場合に warn レベルの結果が返る

---

## TC-12: doctor check が specrunner/changes/ 存在時に pass する

- **Category**: behavior
- **Priority**: must
- **Source**: T-07

**GIVEN** `specrunner/changes/` ディレクトリが存在するリポジトリで doctor コマンドを実行する  
**WHEN** workflow-structure チェックが実行される  
**THEN**
- workflow-structure チェックが pass または warn なしで通過する
- `specrunner/changes` に関するエラーが出力されない

---

## TC-13: doctor check が specrunner/changes/ 不在時に warn を返す

- **Category**: behavior
- **Priority**: should
- **Source**: T-07, design D6

**GIVEN** `specrunner/changes/` ディレクトリが存在しないリポジトリで doctor コマンドを実行する  
**WHEN** workflow-structure チェックが実行される  
**THEN**
- `specrunner/changes` に関する warn レベルの診断結果が返る
- エラー（error レベル）ではなく warn として扱われる

---

## TC-14: bun run typecheck が green

- **Category**: integration
- **Priority**: must
- **Source**: T-08, request 受け入れ基準

**GIVEN** T-04〜T-06 のコード変更が全て完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN**
- TypeScript 型チェックが exit code 0 で完了する
- `specsList` を参照していた箇所でコンパイルエラーが発生しない
- `specsDirRel` を参照していた箇所でコンパイルエラーが発生しない

---

## TC-15: bun run test が green

- **Category**: integration
- **Priority**: must
- **Source**: T-08, request 受け入れ基準

**GIVEN** 全タスク（T-01〜T-07）の変更が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN**
- テストスイートが exit code 0 で完了する
- doctor check の unit test を含む全テストが pass する

---

## TC-16: git history が active change の移行を追跡できる

- **Category**: filesystem
- **Priority**: should
- **Source**: T-01, design D1

**GIVEN** `git mv` を使って active change を移行した状態  
**WHEN** `git log --follow specrunner/changes/<name>/` を実行する  
**THEN**
- 移行前の `openspec/changes/<name>/` での変更履歴が追跡できる

---

## TC-17: openspec-workflow/ ディレクトリが変更されていない

- **Category**: filesystem
- **Priority**: should
- **Source**: request スコープ外

**GIVEN** 全タスクの変更が完了した状態  
**WHEN** `openspec-workflow/` ディレクトリの内容を確認する  
**THEN**
- `openspec-workflow/` 内のファイルに変更が加えられていない
