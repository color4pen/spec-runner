# Test Cases: centralize-change-path

## Overview

`src/util/paths.ts` の新設とパスリテラルの集約を検証するテストシナリオ。
振る舞い保存（pure refactoring）が主目標のため、regression 観点のシナリオが中心。

---

## TC-001: changeFolderPath が正しいパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, AC1 |

**GIVEN** `changeFolderPath` 関数が `src/util/paths.ts` に実装されている  
**WHEN** `changeFolderPath("my-change")` を呼び出す  
**THEN** `"openspec/changes/my-change"` が返される

---

## TC-002: specReviewResultPath が iteration を 3 桁ゼロパディングで返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 1.2, AC1 |

**GIVEN** `specReviewResultPath` 関数が実装されている  
**WHEN** `specReviewResultPath("my-change", 1)` を呼び出す  
**THEN** `"openspec/changes/my-change/spec-review-result-001.md"` が返される

---

## TC-003: reviewFeedbackPath が iteration を 3 桁ゼロパディングで返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 1.2, AC1 |

**GIVEN** `reviewFeedbackPath` 関数が実装されている  
**WHEN** `reviewFeedbackPath("my-change", 2)` を呼び出す  
**THEN** `"openspec/changes/my-change/review-feedback-002.md"` が返される

---

## TC-004: verificationResultPath が正しいパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 2.3, Task 2.5 |

**GIVEN** `verificationResultPath` 関数が実装されている  
**WHEN** `verificationResultPath("my-change")` を呼び出す  
**THEN** `"openspec/changes/my-change/verification-result.md"` が返される

---

## TC-005: prCreateResultPath が正しいパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 2.4 |

**GIVEN** `prCreateResultPath` 関数が実装されている  
**WHEN** `prCreateResultPath("my-change")` を呼び出す  
**THEN** `"openspec/changes/my-change/pr-create-result.md"` が返される

---

## TC-006: requestMdPath が正しいパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 5.3 |

**GIVEN** `requestMdPath` 関数が実装されている  
**WHEN** `requestMdPath("my-change")` を呼び出す  
**THEN** `"openspec/changes/my-change/request.md"` が返される

---

## TC-007: changesDirRel が正しいディレクトリパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 6.1 |

**GIVEN** `changesDirRel` 関数が実装されている  
**WHEN** `changesDirRel()` を呼び出す  
**THEN** `"openspec/changes"` が返される

---

## TC-008: specsDirRel が正しいディレクトリパスを返す

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | must |
| Source | Task 1.1, Task 6.1 |

**GIVEN** `specsDirRel` 関数が実装されている  
**WHEN** `specsDirRel()` を呼び出す  
**THEN** `"openspec/specs"` が返される

---

## TC-009: iteration が 10 以上の場合もゼロパディングが正しい

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | should |
| Source | Task 1.2 |

**GIVEN** `specReviewResultPath` と `reviewFeedbackPath` が実装されている  
**WHEN** `specReviewResultPath("slug", 10)` を呼び出す  
**THEN** `"openspec/changes/slug/spec-review-result-010.md"` が返される（2 桁でも 3 桁にパディングされる）

---

## TC-010: iteration が 100 以上の場合は桁あふれしない

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | could |
| Source | Task 1.2 |

**GIVEN** `specReviewResultPath` が実装されている  
**WHEN** `specReviewResultPath("slug", 100)` を呼び出す  
**THEN** `"openspec/changes/slug/spec-review-result-100.md"` が返される（3 桁以上はそのまま）

---

## TC-011: ハイフンを含む slug が正しく処理される

| Field | Value |
|-------|-------|
| Category | unit |
| Priority | should |
| Source | Task 1.1 |

**GIVEN** `changeFolderPath` が実装されている  
**WHEN** `changeFolderPath("centralize-change-path")` を呼び出す  
**THEN** `"openspec/changes/centralize-change-path"` が返される

---

## TC-012: spec-review の buildFindingsPath が specReviewResultPath と同値を返す

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 2.1, AC3 |

**GIVEN** `spec-review.ts` の `buildFindingsPath` が `specReviewResultPath` の re-export になっている  
**WHEN** `buildFindingsPath("my-change", 1)` を呼び出す  
**THEN** `specReviewResultPath("my-change", 1)` と同じ値が返される（振る舞い変化なし）

---

## TC-013: code-review の buildReviewFeedbackPath が reviewFeedbackPath と同値を返す

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 2.2, AC3 |

**GIVEN** `code-review.ts` の `buildReviewFeedbackPath` が `reviewFeedbackPath` の re-export になっている  
**WHEN** `buildReviewFeedbackPath("my-change", 2)` を呼び出す  
**THEN** `reviewFeedbackPath("my-change", 2)` と同じ値が返される（振る舞い変化なし）

---

## TC-014: verification step が verificationResultPath を使用してファイルパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 2.3, Task 2.5, Task 2.6, AC3 |

**GIVEN** `verification.ts` と `runner.ts` と `propagate.ts` が `verificationResultPath` を使うように変更されている  
**WHEN** slug `"test-slug"` でパスを構築する  
**THEN** パスは `"openspec/changes/test-slug/verification-result.md"` であり、変更前と同じ値が生成される

---

## TC-015: pr-create step が prCreateResultPath を使用してファイルパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 2.4, AC3 |

**GIVEN** `pr-create.ts` が `prCreateResultPath` を使うように変更されている  
**WHEN** slug `"test-slug"` でパスを構築する  
**THEN** パスは `"openspec/changes/test-slug/pr-create-result.md"` であり、変更前と同じ値が生成される

---

## TC-016: implementer のプロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 3.1, AC3 |

**GIVEN** `implementer.ts` のメッセージ構築が `changeFolderPath(slug)` を使うように変更されている  
**WHEN** slug `"my-feature"` で `buildImplementerInitialMessage` 等を呼び出す  
**THEN** 生成されたプロンプト文字列に `"openspec/changes/my-feature"` が含まれ、以前と同じパスが参照される

---

## TC-017: spec-fixer のプロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 3.2, AC3 |

**GIVEN** `spec-fixer.ts` のメッセージ構築が `changeFolderPath(slug)` を使うように変更されている  
**WHEN** slug `"my-feature"` でプロンプトを生成する  
**THEN** 生成されたプロンプト文字列に `"openspec/changes/my-feature"` が含まれ、リテラルは残っていない

---

## TC-018: code-fixer のプロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 3.3, AC3 |

**GIVEN** `code-fixer.ts` のメッセージ構築が `changeFolderPath(deps.slug)` を使うように変更されている  
**WHEN** slug `"my-feature"` でプロンプトを生成する  
**THEN** 生成されたプロンプト文字列に `"openspec/changes/my-feature"` が含まれ、リテラルは残っていない

---

## TC-019: build-fixer のプロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 3.4, AC3 |

**GIVEN** `build-fixer.ts` のメッセージ構築が `changeFolderPath(deps.slug)` を使うように変更されている  
**WHEN** slug `"my-feature"` でプロンプトを生成する  
**THEN** 生成されたプロンプト文字列に `"openspec/changes/my-feature"` が含まれ、リテラルは残っていない

---

## TC-020: propose-system プロンプトが changeFolderPath / changesDirRel / specsDirRel 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 4.1, AC3 |

**GIVEN** `propose-system.ts` が `changeFolderPath()` / `changesDirRel()` / `specsDirRel()` を使うように変更されている  
**WHEN** slug を渡してシステムプロンプトを生成する  
**THEN** プロンプト内の `openspec/changes/` および `openspec/specs/` の参照が関数経由で生成された値であり、以前と同じ文字列が出力される

---

## TC-021: spec-review-system プロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 4.2, AC3 |

**GIVEN** `spec-review-system.ts` が関数経由のパスを使うように変更されている  
**WHEN** slug を渡してシステムプロンプトを生成する  
**THEN** プロンプト内の `openspec/changes/` 参照が関数経由であり、値は変わっていない

---

## TC-022: test-case-gen-system の changeFolder 変数が changeFolderPath 経由で構築される

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 4.3, AC3 |

**GIVEN** `test-case-gen-system.ts` が `changeFolderPath(slug)` を使うように変更されている  
**WHEN** slug `"my-change"` でシステムプロンプトを生成する  
**THEN** `changeFolder` 変数の値は `"openspec/changes/my-change"` であり、変更前と同じ

---

## TC-023: code-review-system プロンプトが changeFolderPath 経由のパスを含む

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 4.4, AC3 |

**GIVEN** `code-review-system.ts` が関数経由のパスを使うように変更されている  
**WHEN** slug を渡してシステムプロンプトを生成する  
**THEN** instruction text 内の `openspec/changes/` 参照が関数経由であり、値は変わっていない

---

## TC-024: finish/archive-openspec が changeFolderPath 経由でパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 5.1, AC1 |

**GIVEN** `archive-openspec.ts` が `path.join(cwd, changeFolderPath(slug))` を使うように変更されている  
**WHEN** cwd `"/project"` と slug `"my-feature"` でアーカイブ処理を実行する  
**THEN** 対象ディレクトリは `"/project/openspec/changes/my-feature"` であり、変更前と同一のパスが使われる

---

## TC-025: finish/preflight が changeFolderPath 経由でパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 5.2, AC1 |

**GIVEN** `preflight.ts` が `path.join(checkCwd, changeFolderPath(slug))` を使うように変更されている  
**WHEN** cwd と slug を渡して preflight チェックを実行する  
**THEN** チェック対象パスは `changeFolderPath(slug)` から生成された値であり、変更前と同じディレクトリを参照する

---

## TC-026: cli/finish が requestMdPath 経由で request.md パスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 5.3, AC1 |

**GIVEN** `cli/finish.ts` が `path.join(opts.cwd, requestMdPath(opts.slug))` を使うように変更されている  
**WHEN** cwd `"/project"` と slug `"my-feature"` で finish を実行する  
**THEN** request.md のパスは `"/project/openspec/changes/my-feature/request.md"` であり、変更前と同一

---

## TC-027: dynamic-context が specsDirRel / changesDirRel 経由でディレクトリパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 6.1, AC1 |

**GIVEN** `dynamic-context.ts` が `path.join(cwd, specsDirRel())` および `path.join(cwd, changesDirRel())` を使うように変更されている  
**WHEN** cwd `"/project"` でコンテキストを取得する  
**THEN** specs ディレクトリは `"/project/openspec/specs"`、changes ディレクトリは `"/project/openspec/changes"` であり、変更前と同じ

---

## TC-028: errors.ts がパス関数経由でエラーメッセージを生成する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 6.2, AC1 |

**GIVEN** `errors.ts` の `specReviewResultNotFoundError` と `codeReviewResultNotFoundError` が `specReviewResultPath()` / `reviewFeedbackPath()` を使うように変更されている  
**WHEN** slug `"my-change"` と iteration `1` でエラーを生成する  
**THEN** エラーメッセージ内のパスは `"openspec/changes/my-change/spec-review-result-001.md"` であり、変更前と同一

---

## TC-029: agent-runner が changeFolderPath 経由でパスを構築する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 6.3, AC1 |

**GIVEN** `agent-runner.ts` が `changeFolderPath(ctx.slug)` を使うように変更されている  
**WHEN** slug `"my-change"` でエージェントを実行する  
**THEN** 対象パスは `"openspec/changes/my-change"` であり、変更前と同一

---

## TC-030: ソースコードに openspec/changes/ のリテラルが残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | AC2 |

**GIVEN** 全ての置換が完了している  
**WHEN** `src/` 配下を `openspec/changes/` でフルテキスト検索する（`changeFolderPath` の実装内部を除外）  
**THEN** 一致するリテラルは 0 件（実装内部の 1 行のみ許容）

---

## TC-031: ソースコードに openspec/specs/ のリテラルが残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | AC2 |

**GIVEN** 全ての置換が完了している  
**WHEN** `src/` 配下を `openspec/specs/` でフルテキスト検索する（`specsDirRel` の実装内部を除外）  
**THEN** 一致するリテラルは 0 件（実装内部の 1 行のみ許容）

---

## TC-032: テストファイルに openspec/changes/ のリテラルが残っていない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | AC2, Task 7 |

**GIVEN** Task 7.1〜7.14 の全テストファイルが関数経由に書き換えられている  
**WHEN** `tests/` 配下を `"openspec/changes/"` でフルテキスト検索する（fixture JSON を除外）  
**THEN** 一致するリテラルは 0 件（`tests/fixtures/legacy-job-state-post-pr24.json` のみ許容）

---

## TC-033: fixture JSON は変更されない

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | must |
| Source | Task 7.15, Design D4 |

**GIVEN** `tests/fixtures/legacy-job-state-post-pr24.json` が互換性テスト用データとして保持されている  
**WHEN** 全置換後に fixture JSON の内容を確認する  
**THEN** ファイルの内容は変更前と完全に一致する（リテラルパスが残ったままである）

---

## TC-034: paths.ts が他の src/ モジュールを import しない

| Field | Value |
|-------|-------|
| Category | static-analysis |
| Priority | must |
| Source | Design D1, Design Risks |

**GIVEN** `src/util/paths.ts` が実装されている  
**WHEN** ファイルの import 文を確認する  
**THEN** `src/` 配下の他モジュールへの import は存在しない（pure utility 関数のみ）

---

## TC-035: bun run typecheck が green

| Field | Value |
|-------|-------|
| Category | build |
| Priority | must |
| Source | Task 8.1, AC4 |

**GIVEN** 全ての置換とリファクタリングが完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-036: bun run test が green

| Field | Value |
|-------|-------|
| Category | build |
| Priority | must |
| Source | Task 8.2, AC4 |

**GIVEN** 全ての置換とリファクタリングが完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS し、失敗が 0 件で終了する

---

## TC-037: spec-review テストが buildFindingsPath ではなく specReviewResultPath を直接 import する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 7.1 |

**GIVEN** `tests/core/steps/spec-review.test.ts` が `specReviewResultPath` を `paths.ts` から import するように変更されている  
**WHEN** テストを実行する  
**THEN** assertion が通り、パスの値は変更前と同一

---

## TC-038: pipeline-integration テストがパス関数を使用する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 7.3 |

**GIVEN** `tests/pipeline-integration.test.ts` のパス構築が `changeFolderPath` 等の関数経由になっている  
**WHEN** テストを実行する  
**THEN** 全 assertion が通り、パスの値は変更前と同一

---

## TC-039: dynamic-context テストが specsDirRel / changesDirRel を使用する

| Field | Value |
|-------|-------|
| Category | regression |
| Priority | should |
| Source | Task 7.14 |

**GIVEN** `tests/git/dynamic-context.test.ts` が `specsDirRel()` / `changesDirRel()` を使うように変更されている  
**WHEN** テストを実行する  
**THEN** `openspec/specs` と `openspec/changes` の assertion が通る
