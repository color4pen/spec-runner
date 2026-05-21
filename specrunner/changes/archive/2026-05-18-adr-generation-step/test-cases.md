# Test Cases: adr-generation-step

Generated from: request.md / design.md / tasks.md

---

## Category: Parser — `adr` フィールド解析

### TC-ADR-PARSE-01

- **Priority**: must
- **Source**: tasks.md 10.1 / request.md 要件 1

**GIVEN** `adr: true` を含む request.md（Meta セクションに `- **adr**: true` が記載されている）  
**WHEN** `parseRequestMdContent` を呼び出す  
**THEN** `result.adr === true`（boolean）が返される

---

### TC-ADR-PARSE-02

- **Priority**: must
- **Source**: tasks.md 10.2 / request.md 要件 1

**GIVEN** `adr: false` を含む request.md（Meta セクションに `- **adr**: false` が記載されている）  
**WHEN** `parseRequestMdContent` を呼び出す  
**THEN** `result.adr === false`（boolean）が返される

---

### TC-ADR-PARSE-03

- **Priority**: must
- **Source**: tasks.md 10.3 / request.md 要件 1

**GIVEN** `adr` フィールドが存在しない request.md（Meta セクションに `adr` 行が含まれない）  
**WHEN** `parseRequestMdContent` を呼び出す  
**THEN** `requestMdInvalidError` が throw され、エラーメッセージに `"missing 'adr'"` が含まれる

---

### TC-ADR-PARSE-04

- **Priority**: must
- **Source**: tasks.md 10.4 / request.md 要件 1

**GIVEN** `- **adr**: maybe` など `true` / `false` 以外の値を持つ request.md  
**WHEN** `parseRequestMdContent` を呼び出す  
**THEN** `requestMdInvalidError` が throw される

---

### TC-ADR-PARSE-05

- **Priority**: must
- **Source**: tasks.md 10.7 / request.md 受け入れ基準

**GIVEN** 既存 parser テストの MINIMAL_META fixture（`adr` フィールドなし）  
**WHEN** `adr: false` を fixture に追加して parser テストを実行する  
**THEN** 既存テストが全て green のまま通過する（regression なし）

---

### TC-ADR-PARSE-06

- **Priority**: should
- **Source**: request.md 要件 1（pattern 仕様）

**GIVEN** `  - **adr**:  true  ` のように前後に余分な空白を含む行  
**WHEN** `parseRequestMdContent` を呼び出す  
**THEN** `result.adr === true` が返される（正規表現 `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/` に一致）

---

## Category: Step — adr-gen step 静的プロパティ

### TC-ADR-STEP-STATIC-01

- **Priority**: must
- **Source**: tasks.md 10.5 (TC-ADR-STEP-03)

**GIVEN** `AdrGenStep` オブジェクトをインポートする  
**WHEN** 各プロパティを参照する  
**THEN** `step.name === "adr-gen"`、`step.kind === "agent"`、`step.completionVerdict === "success"` がそれぞれ成立する

---

### TC-ADR-STEP-STATIC-02

- **Priority**: must
- **Source**: tasks.md 10.5 (TC-ADR-STEP-04) / design.md D10

**GIVEN** `AdrGenStep` オブジェクトをインポートする  
**WHEN** `step.resultFilePath()` および `step.parseResult()` を呼び出す  
**THEN** `resultFilePath()` が `null` を返し、`parseResult()` が `NULL_PARSE_RESULT` を返す

---

### TC-ADR-STEP-STATIC-03

- **Priority**: must
- **Source**: tasks.md 3.2 / design.md D1

**GIVEN** `AdrGenStep` オブジェクトをインポートする  
**WHEN** `step.requiresCommit` を参照する  
**THEN** `undefined`（= falsy）であり、`NO_COMMIT_DETECTED` エラーを引き起こさない

---

## Category: Step — adr-gen buildMessage 動作

### TC-ADR-STEP-NOOP-01

- **Priority**: must
- **Source**: tasks.md 10.5 (TC-ADR-STEP-01) / request.md 受け入れ基準

**GIVEN** `deps.request.adr === false` の state と deps  
**WHEN** `AdrGenStep.buildMessage(state, deps)` を呼び出す  
**THEN** 返却 message に ADR 生成不要・即 complete を指示するテキスト（例: "no-op"、"skip"、"adr is false"）が含まれる  
**AND** 判断材料パス（design.md / delta spec / review-feedback）への参照が含まれない

---

### TC-ADR-STEP-JUDGE-01

- **Priority**: must
- **Source**: tasks.md 10.5 (TC-ADR-STEP-02) / request.md 要件 4

**GIVEN** `deps.request.adr === true` の state と deps、slug が "my-feature" の request  
**WHEN** `AdrGenStep.buildMessage(state, deps)` を呼び出す  
**THEN** 返却 message に以下が含まれる:
- `specrunner/changes/my-feature/design.md` への参照
- `specrunner/changes/my-feature/specs/` への参照
- `specrunner/changes/my-feature/review-feedback-*.md` への参照（または存在確認の記述）

---

## Category: Step — adr-gen 実行時 E2E 動作

### TC-ADR-STEP-E2E-01

- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `request.adr === false` で pipeline が adr-gen step に到達した  
**WHEN** agent が buildMessage を受けて実行する  
**THEN** `specrunner/adr/` 配下にファイルが生成されない  
**AND** step が `completionVerdict: "success"` で完了し、次の step（pr-create）に遷移する

---

### TC-ADR-STEP-E2E-02

- **Priority**: must
- **Source**: request.md 要件 4 / 受け入れ基準

**GIVEN** `request.adr === true` で pipeline が adr-gen step に到達した  
**AND** agent が判断材料（delta spec / git diff / review-feedback）を評価し `judge=no` と判定した  
**WHEN** step が完了する  
**THEN** `specrunner/adr/` 配下にファイルが生成されない  
**AND** step log / result.message に judge=no の理由が記録される  
**AND** step が `completionVerdict: "success"` で完了する

---

### TC-ADR-STEP-E2E-03

- **Priority**: must
- **Source**: request.md 要件 4 / 受け入れ基準

**GIVEN** `request.adr === true` で pipeline が adr-gen step に到達した  
**AND** agent が `judge=yes` と判定した  
**WHEN** step が完了する  
**THEN** `specrunner/adr/ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` が生成される  
**AND** git add が実行され、当該ファイルが staging area に追加される

---

## Category: ADR 番号採番

### TC-ADR-NUM-01

- **Priority**: must
- **Source**: request.md 要件 9 / tasks.md (request.md TC-ADR-STEP-04 相当)

**GIVEN** `specrunner/adr/` 配下に ADR ファイルが 0 件  
**WHEN** judge=yes で ADR が生成される  
**THEN** ファイル名の連番部分が `0001` になる

---

### TC-ADR-NUM-02

- **Priority**: must
- **Source**: request.md 要件 9

**GIVEN** `specrunner/adr/` 配下に `ADR-0001-*.md` / `ADR-0002-*.md` / `ADR-0003-*.md` の 3 件が存在する  
**WHEN** judge=yes で ADR が生成される  
**THEN** ファイル名の連番部分が `0004` になる

---

### TC-ADR-NUM-03

- **Priority**: should
- **Source**: request.md 設計判断 2

**GIVEN** `specrunner/adr/` 配下に最大番号が `0009` の ADR が存在する  
**WHEN** judge=yes で ADR が生成される  
**THEN** ファイル名の連番部分が `0010`（4 桁ゼロパディング）になる

---

## Category: ADR フォーマット

### TC-ADR-FORMAT-01

- **Priority**: must
- **Source**: request.md 設計判断 7 / 受け入れ基準

**GIVEN** judge=yes で ADR が生成された  
**WHEN** 生成ファイルの内容を確認する  
**THEN** 以下のセクションが全て含まれる:
- `## Context`
- `## Decision`
- `## Alternatives Considered`
- `## Consequences`

---

### TC-ADR-FORMAT-02

- **Priority**: must
- **Source**: request.md 設計判断 7

**GIVEN** judge=yes で ADR が生成された  
**WHEN** 生成ファイルの内容を確認する  
**THEN** ファイル先頭に `**Date**: YYYY-MM-DD` と `**Status**: accepted` が含まれる

---

### TC-ADR-FORMAT-03

- **Priority**: should
- **Source**: request.md 設計判断 7

**GIVEN** review-feedback-*.md に Known Design Debt セクションが存在する状態で judge=yes が返された  
**WHEN** 生成ファイルの内容を確認する  
**THEN** `### Known Design Debt` セクションが ADR ファイルに含まれる

---

### TC-ADR-FORMAT-04

- **Priority**: should
- **Source**: request.md 設計判断 7

**GIVEN** review-feedback に Known Design Debt が存在しない状態で judge=yes が返された  
**WHEN** 生成ファイルの内容を確認する  
**THEN** `Known Design Debt` セクションは含まれない（省略される）

---

## Category: ファイル命名

### TC-ADR-NAMING-01

- **Priority**: must
- **Source**: request.md 設計判断 2 / 受け入れ基準

**GIVEN** slug が "my-feature"、日付が "2026-05-18"、既存 ADR が 0 件  
**WHEN** judge=yes で ADR が生成される  
**THEN** ファイルパスが `specrunner/adr/ADR-0001-2026-05-18-my-feature.md` になる

---

### TC-ADR-NAMING-02

- **Priority**: must
- **Source**: request.md 設計判断 2

**GIVEN** request.md の slug が `adr-generation-step`  
**WHEN** ADR ファイルが生成される  
**THEN** ファイル名の slug 部分が `adr-generation-step` になる（request.md の slug をそのまま使用）

---

## Category: Pipeline — transition table

### TC-ADR-INT-01

- **Priority**: must
- **Source**: tasks.md 10.6 / request.md 受け入れ基準

**GIVEN** `STANDARD_TRANSITIONS` 配列を参照する  
**WHEN** 配列内の遷移を検証する  
**THEN** `{ step: "code-review", on: "approved", to: "adr-gen" }` が存在する  
**AND** `{ step: "code-review", on: "approved", to: "pr-create" }` は存在しない（置換済み）

---

### TC-ADR-INT-02

- **Priority**: must
- **Source**: tasks.md 4.2 / request.md 受け入れ基準

**GIVEN** `STANDARD_TRANSITIONS` 配列を参照する  
**WHEN** adr-gen 関連の遷移を検証する  
**THEN** `{ step: "adr-gen", on: "success", to: "pr-create" }` が存在する  
**AND** `{ step: "adr-gen", on: "error", to: "escalate" }` が存在する

---

### TC-ADR-INT-03

- **Priority**: must
- **Source**: request.md 要件 5 / design.md D2

**GIVEN** `STANDARD_TRANSITIONS` 配列を参照する  
**WHEN** code-fixer 関連の遷移を検証する  
**THEN** `{ step: "code-fixer", on: "approved", to: "code-review" }` が存在する（既存 loop が維持されている）

---

### TC-ADR-INT-04

- **Priority**: must
- **Source**: tasks.md 5.2 / design.md D2

**GIVEN** `createStandardPipeline` が生成する steps Map を参照する  
**WHEN** `"adr-gen"` キーが存在するか確認する  
**THEN** `AdrGenStep` が steps Map に登録されている

---

## Category: Step 名定義

### TC-ADR-NAMES-01

- **Priority**: must
- **Source**: tasks.md 2.1 / request.md 受け入れ基準

**GIVEN** `src/core/step/step-names.ts` の `AGENT_STEP_NAMES` 配列を参照する  
**WHEN** 配列要素を確認する  
**THEN** `"adr-gen"` が含まれる

---

### TC-ADR-NAMES-02

- **Priority**: must
- **Source**: tasks.md 2.2 / request.md 受け入れ基準

**GIVEN** `src/core/step/step-names.ts` の `STEP_NAMES` オブジェクトを参照する  
**WHEN** `STEP_NAMES.ADR_GEN` を参照する  
**THEN** `"adr-gen"` が返される

---

### TC-ADR-NAMES-03

- **Priority**: must
- **Source**: request.md 要件 6

**GIVEN** `AgentStepName` 型が `AGENT_STEP_NAMES` から derive される  
**WHEN** TypeScript 型チェック（`bun run typecheck`）を実行する  
**THEN** `"adr-gen"` が `AgentStepName` の有効な値として受け入れられる（型エラーなし）

---

## Category: request template / scaffold

### TC-ADR-TEMPLATE-01

- **Priority**: must
- **Source**: tasks.md 6.1 / request.md 要件 3 / 受け入れ基準

**GIVEN** `specrunner request template` コマンドを実行する  
**WHEN** 出力された scaffold テキストを確認する  
**THEN** Meta セクションに `- **adr**: false` が含まれる

---

### TC-ADR-TEMPLATE-02

- **Priority**: must
- **Source**: tasks.md 6.2 / request.md 受け入れ基準

**GIVEN** `specrunner request template` コマンドを実行する  
**WHEN** 出力された scaffold テキストを確認する  
**THEN** ADR 判断基準のコメント（例: `<!-- adr 判断基準: ... -->`）が含まれる

---

### TC-ADR-TEMPLATE-03

- **Priority**: should
- **Source**: request.md 要件 3

**GIVEN** scaffold の Meta セクションを確認する  
**WHEN** `adr` フィールドの位置を確認する  
**THEN** `base-branch` フィールドの直後に配置されている

---

## Category: request generate prompt

### TC-ADR-PROMPT-01

- **Priority**: must
- **Source**: tasks.md 7.1 / request.md 要件 2

**GIVEN** `src/prompts/request-generate-system.ts` を参照する  
**WHEN** Meta セクションの必須項目記述を確認する  
**THEN** `- **adr**: <true|false>` が明記されている

---

### TC-ADR-PROMPT-02

- **Priority**: must
- **Source**: tasks.md 7.2 / request.md 要件 2

**GIVEN** `src/prompts/request-generate-system.ts` を参照する  
**WHEN** ADR 判断基準の記述を確認する  
**THEN** 以下の基準が全て含まれる:
- 新しい port / adapter を追加する
- 既存パターンと違う設計選択をする
- 振る舞い / 契約を変える bug-fix
- 構造的なリファクタリング
- 上記いずれにも該当しない場合は `false`

---

## Category: specrunner/adr/ ディレクトリ

### TC-ADR-DIR-01

- **Priority**: must
- **Source**: tasks.md 8.1 / request.md 受け入れ基準

**GIVEN** リポジトリの `specrunner/adr/` ディレクトリ  
**WHEN** ディレクトリ内容を確認する  
**THEN** `.gitkeep` が存在し、空ディレクトリが git で追跡される

---

## Category: docs/architecture.md 削除

### TC-ADR-CLEANUP-01

- **Priority**: must
- **Source**: tasks.md 9.1 / request.md 設計判断 8 / 受け入れ基準

**GIVEN** `docs/architecture.md` が untracked または tracked で存在している  
**WHEN** 実装完了後にファイルシステムを確認する  
**THEN** `docs/architecture.md` が存在しない

---

## Category: Delta spec

### TC-ADR-SPEC-01

- **Priority**: must
- **Source**: tasks.md 11.1 / request.md 受け入れ基準

**GIVEN** `specrunner/changes/adr-generation-step/specs/adr-generation/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** `## ADDED Requirements` セクションが存在し、adr-gen step の振る舞い仕様（no-op / judge / ADR 生成）が記述されている

---

### TC-ADR-SPEC-02

- **Priority**: must
- **Source**: tasks.md 11.2

**GIVEN** `specrunner/changes/adr-generation-step/specs/pipeline-orchestrator/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** `## MODIFIED Requirements` セクションに transition table の更新内容（`code-review --approved→ adr-gen`、`adr-gen --success→ pr-create`、`adr-gen --error→ escalate`）が含まれる

---

### TC-ADR-SPEC-03

- **Priority**: must
- **Source**: tasks.md 11.3

**GIVEN** `specrunner/changes/adr-generation-step/specs/request-md-parser/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** `## MODIFIED Requirements` セクションに `adr` フィールド必須化の要件が含まれる

---

### TC-ADR-SPEC-04

- **Priority**: must
- **Source**: tasks.md 11.4

**GIVEN** `specrunner/changes/adr-generation-step/specs/cli-commands/spec.md` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** `## MODIFIED Requirements` セクションに scaffold への `adr` フィールド追加が記述されている

---

## Category: 型チェック / テスト全体

### TC-ADR-BUILD-01

- **Priority**: must
- **Source**: tasks.md 12.1 / request.md 受け入れ基準

**GIVEN** 本変更の実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-ADR-BUILD-02

- **Priority**: must
- **Source**: tasks.md 12.2 / request.md 受け入れ基準

**GIVEN** 本変更の実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが green で通過し、既存テストの regression がない

---

## Category: authority spec edit guard との整合

### TC-ADR-GUARD-01

- **Priority**: should
- **Source**: request.md 要件 7 / design.md D（guard 整合）

**GIVEN** adr-gen step が `specrunner/adr/ADR-0001-*.md` を生成しようとする  
**WHEN** `AuthoritySpecEditViolation` guard がチェックを実行する  
**THEN** `specrunner/adr/` は `specrunner/specs/` prefix を持たないため、guard がエラーを throw しない

---

## Category: adr-gen System Prompt

### TC-ADR-SYS-01

- **Priority**: must
- **Source**: tasks.md 3.1

**GIVEN** `src/prompts/adr-gen-system.ts` を参照する  
**WHEN** ファイル内容を確認する  
**THEN** 以下が全て含まれる:
- judge 判定基準の説明
- judge=yes 時: Michael Nygard 形式（Context / Decision / Alternatives Considered / Consequences）での ADR 書き出し + git add + commit 指示
- judge=no 時: 理由を述べて終了する指示
- 番号採番ルール（`specrunner/adr/` 配下の既存最大番号 + 1）

---
