# Test Cases: remove-openspec-cli-dependency

## Overview

openspec CLI への全依存廃止を検証するテストシナリオ。パス定数の切り替え、propose prompt の template 化、finish/doctor の簡素化、dynamic-context の specs 廃止が主軸。コード実行パスから `openspec` コマンド呼び出しが消滅することを多層的に検証する。

---

## TC-001: changeFolderPath が specrunner/changes を返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01, AC: changeFolderPath("my-change") → "specrunner/changes/my-change" |

**GIVEN** `src/util/paths.ts` の `CHANGES_DIR` が `"specrunner/changes"` に変更されている  
**WHEN** `changeFolderPath("my-change")` を呼び出す  
**THEN** `"specrunner/changes/my-change"` が返される

---

## TC-002: changesDirRel が specrunner/changes を返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01, AD-1 |

**GIVEN** `CHANGES_DIR` が `"specrunner/changes"` に変更されている  
**WHEN** `changesDirRel()` を呼び出す  
**THEN** `"specrunner/changes"` が返される

---

## TC-003: requestMdPath が新パスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01, AD-1 |

**GIVEN** `changeFolderPath` が `specrunner/changes` ベースに変更されている  
**WHEN** `requestMdPath("my-change")` を呼び出す  
**THEN** `"specrunner/changes/my-change/request.md"` が返される

---

## TC-004: specReviewResultPath が新パスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01 |

**GIVEN** `CHANGES_DIR` が `"specrunner/changes"` に変更されている  
**WHEN** `specReviewResultPath("my-change", 1)` を呼び出す  
**THEN** `"specrunner/changes/my-change/spec-review-result-001.md"` が返される

---

## TC-005: reviewFeedbackPath が新パスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01 |

**GIVEN** `CHANGES_DIR` が `"specrunner/changes"` に変更されている  
**WHEN** `reviewFeedbackPath("my-change", 2)` を呼び出す  
**THEN** `"specrunner/changes/my-change/review-feedback-002.md"` が返される

---

## TC-006: PROPOSE_SYSTEM_PROMPT に openspec CLI 呼び出しが含まれない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-02, AC: PROPOSE_SYSTEM_PROMPT に openspec / npx openspec / proposal.md の文字列が含まれない |

**GIVEN** `src/prompts/propose-system.ts` が template 方式に書き換えられている  
**WHEN** `PROPOSE_SYSTEM_PROMPT` の文字列を検査する  
**THEN** `"openspec"` / `"npx openspec"` / `"proposal.md"` のいずれもヒットしない

---

## TC-007: PROPOSE_SYSTEM_PROMPT が design.md / tasks.md を artifact として列挙する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-02, AD-2 |

**GIVEN** `PROPOSE_SYSTEM_PROMPT` が artifact checklist 方式に書き換えられている  
**WHEN** `PROPOSE_SYSTEM_PROMPT` の文字列を確認する  
**THEN** `specrunner/changes/<slug>/design.md` および `specrunner/changes/<slug>/tasks.md` が artifact として明示されている

---

## TC-008: PROPOSE_SYSTEM_PROMPT が specs/ を条件付き artifact として列挙する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-02, AD-2 |

**GIVEN** `PROPOSE_SYSTEM_PROMPT` が template 方式に書き換えられている  
**WHEN** `PROPOSE_SYSTEM_PROMPT` の文字列を確認する  
**THEN** `specrunner/changes/<slug>/specs/<capability>/spec.md` が「該当時」の条件付き artifact として記述されている

---

## TC-009: PROPOSE_SYSTEM_PROMPT に Delta Spec Format Rules が維持されている

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-02, AD-2 |

**GIVEN** `PROPOSE_SYSTEM_PROMPT` が書き換えられている  
**WHEN** Delta Spec Format Rules の記述（ADDED / MODIFIED / REMOVED / Requirement / Scenario フォーマット）を確認する  
**THEN** 既存の Delta Spec Format Rules がそのまま維持されている

---

## TC-010: PROPOSE_SYSTEM_PROMPT に self-review checklist が含まれる

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-02, AD-2 |

**GIVEN** `PROPOSE_SYSTEM_PROMPT` が書き換えられている  
**WHEN** self-review checklist の記述を確認する  
**THEN** `openspec validate` の代替として self-review checklist が存在し、少なくとも 1 項目以上のチェック項目が記述されている

---

## TC-011: PROPOSE_INITIAL_MESSAGE_TEMPLATE に proposal.md の言及がない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-02 |

**GIVEN** `PROPOSE_INITIAL_MESSAGE_TEMPLATE` が更新されている  
**WHEN** `PROPOSE_INITIAL_MESSAGE_TEMPLATE` の文字列を検査する  
**THEN** `"proposal.md"` が含まれない

---

## TC-012: archive-openspec.ts が削除されている

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-03, AC: archiveOpenspec への参照がコードベースに残っていない |

**GIVEN** T-03 の変更が完了している  
**WHEN** `src/core/finish/archive-openspec.ts` の存在を確認する  
**THEN** ファイルが存在しない

---

## TC-013: orchestrator.ts に archiveOpenspec の呼び出しが残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-03, AC: archiveOpenspec への参照がコードベースに残っていない |

**GIVEN** T-03 の変更が完了している  
**WHEN** `src/core/finish/orchestrator.ts` を `archiveOpenspec` でフルテキスト検索する  
**THEN** 一致が 0 件

---

## TC-014: archiveChangeFolder が change folder を archive ディレクトリへ git mv する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04, AC: finish Phase 1 が specrunner/changes/<slug>/ を specrunner/changes/archive/<slug>/ に移動する |

**GIVEN** `specrunner/changes/my-change/` が存在し、`archiveChangeFolder({ slug: "my-change", cwd, spawn, fs })` が呼ばれる  
**WHEN** 関数を実行する  
**THEN** `git mv specrunner/changes/my-change specrunner/changes/archive/my-change` が実行され、`{ ok: true }` が返される

---

## TC-015: archiveChangeFolder が change folder 不在の場合に skip を返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04 |

**GIVEN** `specrunner/changes/my-change/` が存在しない  
**WHEN** `archiveChangeFolder({ slug: "my-change", cwd, spawn, fs })` を実行する  
**THEN** `{ ok: true, skipped: true }` が返され、git mv は実行されない

---

## TC-016: archiveChangeFolder が git mv 失敗時に escalation を返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04 |

**GIVEN** `specrunner/changes/my-change/` が存在し、git mv が exit code 非 0 で失敗する  
**WHEN** `archiveChangeFolder` を実行する  
**THEN** escalation を示すエラー結果が返される（`{ ok: false }` またはエラーオブジェクト）

---

## TC-017: orchestrator.ts の Phase 1 が archiveChangeFolder を moveRequestsDir より前に実行する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04, AD-3 |

**GIVEN** `orchestrator.ts` の Phase 1 に `archiveChangeFolder()` が追加されている  
**WHEN** `runPhase1Archive` の実行順序を確認する  
**THEN** `archiveChangeFolder()` が `moveRequestsDir()` より前に呼ばれる

---

## TC-018: preflight が openspec コマンドを spawn しない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-05, AC: preflight が openspec コマンドを spawn しない |

**GIVEN** `src/core/finish/preflight.ts` から Check 6（openspec validate）が削除されている  
**WHEN** preflight のコード全体を `openspec` でフルテキスト検索する  
**THEN** 一致が 0 件

---

## TC-019: preflight の checkBinaries が gh と git のみを検査する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-05, AD-4 |

**GIVEN** Check 7 の binary list から `"openspec"` が除去されている  
**WHEN** preflight の checkBinaries 呼び出し引数を確認する  
**THEN** `["gh", "git"]` のみが渡され、`"openspec"` は含まれない

---

## TC-020: doctor の allChecks に openspecCheck が含まれない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-06, AC: allChecks に openspec runtime check が含まれない |

**GIVEN** `src/core/doctor/checks/index.ts` から `openspecCheck` の登録が除去されている  
**WHEN** `allChecks` 配列の内容を確認する  
**THEN** `openspecCheck` が含まれない

---

## TC-021: runtime/openspec.ts が削除されている

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-06, AC |

**GIVEN** T-06 の変更が完了している  
**WHEN** `src/core/doctor/checks/runtime/openspec.ts` の存在を確認する  
**THEN** ファイルが存在しない

---

## TC-022: openspecProjectMdCheck.required が false である

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-06, AC: openspecProjectMdCheck.required === false |

**GIVEN** `src/core/doctor/checks/repo/openspec-project-md.ts` の `required` が `false` に変更されている  
**WHEN** `openspecProjectMdCheck.required` を確認する  
**THEN** `false` が返される

---

## TC-023: collectSpecsList が常に空配列を返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-07, AC: collectSpecsList() が常に [] を返す |

**GIVEN** `src/git/dynamic-context.ts` の `collectSpecsList()` が `return [];` に置換されている  
**WHEN** `collectSpecsList()` を呼び出す（任意の cwd / fs で）  
**THEN** `[]` が返される

---

## TC-024: dynamic-context の specs セクションが空配列固定になっている

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-07 |

**GIVEN** `collectSpecsList()` が空配列固定になっている  
**WHEN** dynamic-context のテストで specs 関連アサーションを実行する  
**THEN** `specs` は `[]` であり、ファイルシステムの状態に依存しない

---

## TC-025: spec-review-system.ts に proposal.md への参照がない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-08, AC: grep -r "proposal\.md" src/prompts/ がヒットしない |

**GIVEN** `src/prompts/spec-review-system.ts` から proposal.md 参照が除去されている  
**WHEN** `src/prompts/spec-review-system.ts` を `proposal.md` でフルテキスト検索する  
**THEN** 一致が 0 件

---

## TC-026: test-case-gen-system.ts が proposal.md の代わりに request.md を読む

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-08, AD-7 |

**GIVEN** `src/prompts/test-case-gen-system.ts` の proposal.md 参照が request.md に置換されている  
**WHEN** `test-case-gen-system.ts` のシステムプロンプト文字列を確認する  
**THEN** `"proposal.md"` が含まれず、`"request.md"` が読み込み対象として明示されている

---

## TC-027: src/prompts/ 配下に proposal.md への参照が残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-08, AC: grep -r "proposal\.md" src/prompts/ がヒットしない |

**GIVEN** T-08 の全ファイル変更が完了している  
**WHEN** `src/prompts/` 配下を `proposal\.md` でフルテキスト検索する  
**THEN** 一致が 0 件

---

## TC-028: pipeline 起動後に specrunner/changes/<slug>/request.md が存在する

| Field | Value |
|-------|-------|
| Category | integration |
| Priority | must |
| Source | T-09, AC: pipeline 起動後に specrunner/changes/<slug>/request.md が存在する |

**GIVEN** `src/core/runtime/local.ts` の `setupWorkspace()` に change folder への request.md コピー処理が追加されている  
**WHEN** slug `"my-change"` で pipeline を起動する  
**THEN** `specrunner/changes/my-change/request.md` がワークツリー内に存在する

---

## TC-029: local.ts の setupWorkspace が change folder ディレクトリを事前作成する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-09, AD-8 |

**GIVEN** `setupWorkspace()` に change folder コピー処理が追加されている  
**WHEN** change folder が存在しない状態で `setupWorkspace()` を実行する  
**THEN** `specrunner/changes/<slug>/` ディレクトリが mkdir -p で作成された上で request.md がコピーされる

---

## TC-030: managed.ts の setupWorkspace が change folder に request.md をコピーする

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-09, AD-8 |

**GIVEN** `src/core/runtime/managed.ts` の `setupWorkspace()` にも change folder コピー処理が追加されている  
**WHEN** managed runtime で pipeline を起動する  
**THEN** `specrunner/changes/<slug>/request.md` が存在する

---

## TC-031: ENVIRONMENT_PACKAGES_NPM から @fission-ai/openspec が除去されている

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-10, AC: managed runtime の Environment 作成時に openspec がインストールされない |

**GIVEN** `src/cli/init.ts` の `ENVIRONMENT_PACKAGES_NPM` から `"@fission-ai/openspec"` が除去されている  
**WHEN** `ENVIRONMENT_PACKAGES_NPM` の内容を確認する  
**THEN** `"@fission-ai/openspec"` が含まれない

---

## TC-032: ProposeStep.maxTurns が 15 である

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-11, AC: ProposeStep.maxTurns === 15 |

**GIVEN** `src/core/step/propose.ts` の `maxTurns` が 20 から 15 に変更されている  
**WHEN** `ProposeStep` の `maxTurns` 値を確認する  
**THEN** `15` が返される

---

## TC-033: orchestrator.ts の dry-run 出力に openspec が含まれない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-12, AC: dry-run 出力に openspec の文字列が含まれない |

**GIVEN** `orchestrator.ts` の `outputDryRunPlan()` が更新されている  
**WHEN** dry-run モードで orchestrator を実行する  
**THEN** 出力文字列に `"openspec"` が含まれない

---

## TC-034: propose.ts のコメントが template-driven design を示している

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | should |
| Source | T-14, AC: propose.ts のコメントが実態と整合する |

**GIVEN** `src/core/step/propose.ts` のコメントが `openspec CLI` から `template-driven design` に更新されている  
**WHEN** `propose.ts` のコメントを確認する  
**THEN** `"openspec CLI"` の記述がなく、`"template-driven"` または同等の記述がある

---

## TC-035: src/ の実行パスに openspec コマンド呼び出しが残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-15, AC: コード実行パスから openspec コマンド呼び出しが消滅 |

**GIVEN** 全タスクの変更が完了している  
**WHEN** `grep -r "openspec" src/ | grep -v "//\|/\*\|\.md\|project\.md\|openspec-workflow\|propose-openspec-cli"` を実行する  
**THEN** 一致が 0 件（コメント・markdown 参照・ADR 名を除く）

---

## TC-036: bun run typecheck が green

| Field | Value |
|-------|-------|
| Category | build |
| Priority | must |
| Source | T-15, AC: bun run typecheck && bun run test が green |

**GIVEN** 全タスクの変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラー 0 件で終了する

---

## TC-037: bun run test が green

| Field | Value |
|-------|-------|
| Category | build |
| Priority | must |
| Source | T-15, AC: bun run typecheck && bun run test が green |

**GIVEN** 全タスクの変更が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS し、失敗が 0 件で終了する

---

## TC-038: paths.ts のテストが specrunner/changes を期待値として持つ

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-01 |

**GIVEN** `tests/util/paths.test.ts` のアサーション値が `specrunner/changes` に更新されている  
**WHEN** paths のテストを実行する  
**THEN** 全アサーションが通り、`"openspec/changes"` を期待する assertion が残っていない

---

## TC-039: propose-system のテストが openspec CLI 関連アサーションを含まない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-02 |

**GIVEN** `tests/prompts/propose-system.test.ts` が更新されている  
**WHEN** propose-system テストを実行する  
**THEN** `"openspec"` / `"proposal.md"` を期待する assertion が存在せず、新しい artifact list のアサーションが通る

---

## TC-040: finish-archive-openspec テストが削除されている

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-03 |

**GIVEN** T-03 の変更が完了している  
**WHEN** `tests/finish-archive-openspec.test.ts` の存在を確認する  
**THEN** ファイルが存在しない

---

## TC-041: finish-archive-change-folder テストが change folder 存在パターンを検証する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04 |

**GIVEN** `tests/finish-archive-change-folder.test.ts` が新規作成されている  
**WHEN** change folder 存在・git mv 成功のシナリオでテストを実行する  
**THEN** `git mv` が正しく呼ばれ、`{ ok: true }` が返されるアサーションが通る

---

## TC-042: finish-archive-change-folder テストが change folder 不在パターンを検証する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04 |

**GIVEN** `tests/finish-archive-change-folder.test.ts` が新規作成されている  
**WHEN** change folder 不在のシナリオでテストを実行する  
**THEN** git mv が呼ばれず、`{ ok: true, skipped: true }` が返されるアサーションが通る

---

## TC-043: finish-archive-change-folder テストが git mv 失敗パターンを検証する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-04 |

**GIVEN** `tests/finish-archive-change-folder.test.ts` が新規作成されている  
**WHEN** git mv が非 0 exit code で失敗するシナリオでテストを実行する  
**THEN** escalation（`{ ok: false }` またはエラーオブジェクト）が返されるアサーションが通る

---

## TC-044: preflight テストから openspec validate 関連ケースが削除されている

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-05 |

**GIVEN** `tests/unit/core/finish/preflight.test.ts` が更新されている  
**WHEN** preflight テストを実行する  
**THEN** openspec validate を検証する test case が存在せず、全テストが PASS する

---

## TC-045: doctor openspec テストが削除されている

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-06 |

**GIVEN** T-06 の変更が完了している  
**WHEN** `tests/core/doctor/checks/runtime/openspec.test.ts` の存在を確認する  
**THEN** ファイルが存在しない

---

## TC-046: dynamic-context テストが collectSpecsList の空配列を検証する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-07 |

**GIVEN** `tests/git/dynamic-context.test.ts` の specs 関連テストが更新されている  
**WHEN** dynamic-context テストを実行する  
**THEN** specs が `[]` であることを検証する assertion が通る

---

## TC-047: spec-review-system テストに proposal.md を期待する assertion が残っていない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | should |
| Source | T-08 |

**GIVEN** spec-review-system のテストが更新されている  
**WHEN** spec-review-system テストを実行する  
**THEN** `"proposal.md"` を期待する assertion が 0 件であり、テストが PASS する

---

## TC-048: request.md が change folder にコピーされることをテストが検証する

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | T-09 |

**GIVEN** local.ts / managed.ts のテストが更新されている  
**WHEN** setupWorkspace のテストを実行する  
**THEN** `specrunner/changes/<slug>/request.md` が存在することを検証する assertion が通る

---

## TC-049: specrunner/changes/ 配下が新しい change folder の標準置き場になっている

| Field | Value |
|-------|-------|
| Category | integration |
| Priority | must |
| Source | T-01, AD-1, 全体 |

**GIVEN** 全タスクの変更が完了し、pipeline が end-to-end で実行された  
**WHEN** propose ステップが完了する  
**THEN** `specrunner/changes/<slug>/design.md` と `specrunner/changes/<slug>/tasks.md` が生成されており、`openspec/changes/<slug>/` には何も生成されない

---

## TC-050: openspec/changes/ リテラルが src/ の実装コードに残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | T-15, AC |

**GIVEN** 全タスクの変更が完了している  
**WHEN** `src/` 配下を `"openspec/changes/"` でフルテキスト検索する（`paths.ts` の定数定義行を除く）  
**THEN** 一致が 0 件
