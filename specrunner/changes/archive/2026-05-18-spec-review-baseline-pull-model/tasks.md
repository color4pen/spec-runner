# Tasks: spec-review baseline 取得を Read-tool-pull モデルに切替

## Task 1: system prompt の Baseline Spec Consistency Check セクションを書き換え

- [x] **file**: `src/prompts/spec-review-system.ts`
- **action**: L74-84 の `## Baseline Spec Consistency Check` セクションを Read-tool-pull モデルに書き換え
- **detail**:
  - L75 "When baseline specs are provided in the initial message, verify the following:" を削除
  - L84 "If no baseline specs are provided, skip this check entirely." を削除
  - 以下の Read-tool-pull 手順に置換:
    ```
    When the delta spec contains `## MODIFIED` / `## REMOVED` / `## RENAMED` / `## ADDED`
    Requirements sections, follow these steps:

    1. Identify the capability name from the delta spec path
       (`specrunner/changes/<slug>/specs/<capability>/spec.md`)
    2. Read `specrunner/specs/<capability>/spec.md` using the Read tool
    3. Extract existing `### Requirement:` headers from the baseline
    4. For MODIFIED / REMOVED / RENAMED-FROM headers: verify each exists in the baseline.
       If not, report a HIGH severity finding (category: consistency).
    5. For ADDED headers: verify each does NOT already exist in the baseline.
       If a duplicate is found, report a HIGH severity finding (category: consistency).
    6. If the baseline file does not exist and the delta has MODIFIED / REMOVED / RENAMED sections,
       report a HIGH severity finding (category: consistency).
    7. If the baseline file does not exist and the delta only has ADDED sections,
       this is expected (new capability) — no finding needed.
    ```
  - MODIFIED/REMOVED/ADDED の 3 項目チェック指示は維持（手順 4, 5 に含まれる）
- **test**: Task 7 で検証

## Task 2: 初期メッセージテンプレートから `{{BASELINE_SPECS}}` placeholder を削除

- [x] **file**: `src/prompts/spec-review-system.ts`
- **action**: L118 の `{{BASELINE_SPECS}}` をテンプレート文字列から削除
- **detail**: `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` 内の `{{BASELINE_SPECS}}` 行を除去
- **test**: Task 7 で検証

## Task 3: `SpecReviewPromptInput` から `baselineSpecs` field を削除

- [x] **file**: `src/prompts/spec-review-system.ts`
- **action**: L140-144 の `baselineSpecs?: Record<string, string>` field と JSDoc を削除
- **detail**: interface `SpecReviewPromptInput` から field を除去
- **test**: Task 7 で検証（型レベル: コンパイル通過で確認）

## Task 4: `buildSpecReviewInitialMessage()` から baseline specs セクション構築ロジックを削除

- [x] **file**: `src/prompts/spec-review-system.ts`
- **action**: L197-204 の baselineSpecsSection 構築ロジックと L213 の `.replace(/{{BASELINE_SPECS}}/g, baselineSpecsSection)` を削除
- **detail**:
  - `let baselineSpecsSection = "";` から `baselineSpecsSection = ...` までのブロック (L198-204) を削除
  - L213 の replace 呼び出しを削除
- **test**: Task 7 で検証

## Task 5: `DynamicContext` から `baselineSpecs` field を削除

- [x] **file**: `src/git/dynamic-context.ts`
- **action**: L42-48 の `baselineSpecs?: Record<string, string>` field と JSDoc を削除
- **detail**: interface `DynamicContext` から field を除去。`collectDynamicContext()` は元々この field を設定していないため変更不要
- **test**: Task 7 で検証（型レベル: コンパイル通過で確認）

## Task 6: `SpecReviewStep` から baselineSpecs 関連ロジックを削除

- [x] **file**: `src/core/step/spec-review.ts`
- **action**:
  1. `enrichContext()` (L89-110) を簡素化: baselineSpecs 構築ロジックを削除し、`dynamicContext` をそのまま返す
  2. `buildMessage()` (L124) から `baselineSpecs: deps.dynamicContext?.baselineSpecs` を削除
- **detail**:
  - enrichContext: specs/ ディレクトリ走査 + fs.readFile ループ + `{ ...dynamicContext, baselineSpecs }` → `return dynamicContext;`
  - buildMessage: `buildSpecReviewInitialMessage()` 呼び出しの引数オブジェクトから `baselineSpecs` プロパティを除去
  - `baselineSpecPath` import が enrichContext 以外で使われていなければ import 文も削除
- **test**: Task 7 で検証

## Task 7: テストの更新

- [x] **file**: `tests/prompts/spec-review-system.test.ts`
- **action**: 注入モデル依存テストを削除し、Read-tool-pull モデルのテストを追加
- **detail**:
  - **削除対象**:
    - TC-018: "skip check when no baseline" — 無音 skip は廃止されたため
    - TC-019: "baseline-specs section when provided" — `<baseline-specs>` tag 注入は廃止
    - TC-020: "baseline-specs omission when absent" — 同上
    - TC-021: "buildMessage passes baselineSpecs" — baselineSpecs 受け渡しは廃止
    - TC-022: "SpecReviewPromptInput has baselineSpecs field" — field 自体が廃止
  - **更新対象**:
    - TC-003: enrichContext signature test — 呼び出し可能であることの確認は維持、baselineSpecs 関連の assertion があれば除去
    - TC-010: enrichContext no-op test — baselineSpecs undefined assertion は DynamicContext から field が消えるため除去
  - **追加対象**:
    - system prompt に "Read tool" / "Read" が含まれることを assert
    - system prompt に step-by-step 手順のキーワード（"Identify the capability name", "Read `specrunner/specs/", "Extract existing", "category: consistency"）が含まれることを assert
    - system prompt に "skip this check entirely" が含まれ**ない**ことを assert
    - initial message template に `{{BASELINE_SPECS}}` が含まれないことを assert
    - `buildSpecReviewInitialMessage()` の戻り値に `<baseline-specs>` が含まれないことを assert（baselineSpecs を渡さなくても渡しても）
  - TC-015/016/017 (MODIFIED/REMOVED/ADDED check keywords) は system prompt の書き換え後も同キーワードが残るため、原則維持。regex パターンが新文面と合わない場合のみ修正
  - `tests/adapter/codex/agent-runner.test.ts`: `enrichedDynamicCtx` から `baselineSpecs` を除去
  - `tests/git/dynamic-context.test.ts`: TC-002 (baselineSpecs not set) を削除
  - `tests/pipeline-integration.test.ts`: TC-DC-105/106 の `baselineSpecs` assertion を削除・更新

## Task 8: delta spec の作成

- [x] **file**: `specrunner/changes/spec-review-baseline-pull-model/specs/spec-review-session/spec.md`
- **action**: REMOVED + ADDED の combo で delta spec を作成
- **detail**:
  - **REMOVED**: `### Requirement: spec-review の初期メッセージに関連 baseline spec が注入される`
    - baseline (`specrunner/specs/spec-review-session/spec.md` L121) の完全一致 header
    - 理由: initial message 注入モデルから Read-tool-pull モデルに切り替えたため
  - **ADDED**: `### Requirement: spec-review agent は Read tool で baseline spec を自力取得する`
    - spec-review session は baseline spec を agent 経由 (= `Read` tool) で取得し、initial message での注入は行わない MUST
    - agent は delta spec が `## MODIFIED` / `## REMOVED` / `## RENAMED` セクションを含む場合 SHALL baseline spec を Read して header 一致を check する
    - agent は delta spec の `## ADDED Requirements` 配下 header が baseline に既存しないかも SHALL Read で check する (= 重複追加の防止、`category: consistency` HIGH severity)
    - baseline と一致しない MODIFIED/REMOVED/RENAMED-FROM header は HIGH severity finding (= `category: consistency`) として記録する
    - baseline に既存と重複する ADDED header は HIGH severity finding (= 同上) として記録する
- **test**: spec-review 自体が本 delta spec をレビューすることで構造検証される

## Task 9: typecheck + test green 確認

- [x] **command**: `bun run typecheck && bun run test`
- **action**: 全タスク完了後に実行し、型エラー・テスト失敗がないことを確認
- **detail**: Task 1-8 の変更で型不整合やテスト regression が発生した場合はここで修正

## 依存関係

```
Task 1 ──┐
Task 2 ──┤
Task 3 ──┼── Task 7 (テスト更新) ── Task 9 (green 確認)
Task 4 ──┤
Task 5 ──┤
Task 6 ──┘
Task 8 (delta spec) ── 独立
```

Task 1-6 は互いに独立して実施可能だが、Task 7 (テスト更新) は全ての production code 変更後に実施。Task 8 (delta spec) は他タスクと独立。Task 9 は最後に実施。
