# Test Cases: design-delta-spec-must-checklist

## TC-01: DESIGN_SYSTEM_PROMPT に Completion Checklist セクションが存在する

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 / 受け入れ基準 1

**GIVEN** `design-system.ts` から `DESIGN_SYSTEM_PROMPT` をインポートする  
**WHEN** その文字列内を検索する  
**THEN** `Completion Checklist` という文言が含まれている

---

## TC-02: DESIGN_SYSTEM_PROMPT の spec-change チェックリストで delta spec が REQUIRED と明示されている

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 / 受け入れ基準 2

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** `spec-change` または `new-feature` に関するチェックリスト箇所を確認する  
**THEN** `delta spec` と `REQUIRED` の両方が同一セクション内に存在する

---

## TC-03: DESIGN_SYSTEM_PROMPT に spec-change および new-feature への言及がある

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 / 受け入れ基準 2

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** その文字列内を検索する  
**THEN** `spec-change` と `new-feature` の両方が delta spec 必須条件の文脈で言及されている

---

## TC-04: DESIGN_SYSTEM_PROMPT に bug-fix / refactoring 用チェックリストがあり delta spec が不要と分かる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 / 受け入れ基準 3

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** `bug-fix` または `refactoring` に関するセクションを確認する  
**THEN** そのセクションには delta spec に関する MUST / REQUIRED の記述がなく、`design.md` と `tasks.md` のみが必須項目として列挙されている

---

## TC-05: DESIGN_SYSTEM_PROMPT が ✗ のとき end_turn を禁止する指示を含む

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-01 (条件分岐の導入文)

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** チェックリスト条件分岐の導入文を確認する  
**THEN** ✗（未達成項目）がある場合に end_turn しないよう明示する文言が含まれている

---

## TC-06: DESIGN_SYSTEM_PROMPT に delta spec パス形式の規約が含まれる

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-01 (delta spec path が `specs/<capability-name>/spec.md` 形式)

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** チェックリスト内の delta spec パス規約項目を確認する  
**THEN** `specs/<capability-name>/spec.md` 形式（フラット path 不可）が明示されている

---

## TC-07: DESIGN_SYSTEM_PROMPT に ADDED/MODIFIED/REMOVED/RENAMED Requirements ヘッダーの規約が含まれる

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-01 (各 delta spec セクションが ADDED|MODIFIED|REMOVED|RENAMED のいずれか)

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** delta spec セクションヘッダーの規約を確認する  
**THEN** `ADDED Requirements`、`MODIFIED Requirements`、`REMOVED Requirements` の少なくとも 3 種が valid header として列挙されている

---

## TC-08: DESIGN_INITIAL_MESSAGE_TEMPLATE に `{{REQUEST_TYPE}}` プレースホルダが存在する

- **Category**: Template Variable
- **Priority**: must
- **Source**: T-02 / 受け入れ基準 4

**GIVEN** `design-system.ts` から `DESIGN_INITIAL_MESSAGE_TEMPLATE` をインポートする  
**WHEN** その文字列内を検索する  
**THEN** `{{REQUEST_TYPE}}` が含まれている

---

## TC-09: `buildInitialMessage` に requestType を渡すと出力に反映される

- **Category**: Function API
- **Priority**: must
- **Source**: T-03 / 受け入れ基準 (buildInitialMessage の出力)

**GIVEN** `buildInitialMessage("body", "my-slug", "my-branch", undefined, "spec-change")` を呼び出す  
**WHEN** 戻り値の文字列を検査する  
**THEN** `spec-change` が含まれている

---

## TC-10: `buildInitialMessage` に requestType="bug-fix" を渡すと出力に反映される

- **Category**: Function API
- **Priority**: should
- **Source**: T-03

**GIVEN** `buildInitialMessage("body", "my-slug", "my-branch", undefined, "bug-fix")` を呼び出す  
**WHEN** 戻り値の文字列を検査する  
**THEN** `bug-fix` が含まれている

---

## TC-11: `buildInitialMessage` は第5引数を省略しても正常動作する（後方互換）

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: T-03 (後方互換)

**GIVEN** `buildInitialMessage("body", "my-slug", "my-branch")` を第5引数なしで呼び出す  
**WHEN** 実行する  
**THEN** 例外を投げず、非空文字列を返す

---

## TC-12: `buildInitialMessage` に requestType=undefined を渡すと `{{REQUEST_TYPE}}` が残留しない

- **Category**: Function API
- **Priority**: should
- **Source**: T-03 (.replaceAll の処理確認)

**GIVEN** `buildInitialMessage("body", "my-slug", "my-branch", undefined, undefined)` を呼び出す  
**WHEN** 戻り値の文字列を検査する  
**THEN** `{{REQUEST_TYPE}}` という未展開のプレースホルダが残っていない

---

## TC-13: design.ts の buildMessage が request.type を buildInitialMessage に渡す

- **Category**: Integration
- **Priority**: must
- **Source**: T-04 / 受け入れ基準 4

**GIVEN** `DesignStep.buildMessage` が `deps.request.type = "spec-change"` の状態で呼び出される  
**WHEN** 生成されたメッセージ文字列を検査する  
**THEN** `spec-change` が含まれている

---

## TC-14: design.ts の buildMessage が request.type="bug-fix" のとき正しく渡す

- **Category**: Integration
- **Priority**: should
- **Source**: T-04

**GIVEN** `DesignStep.buildMessage` が `deps.request.type = "bug-fix"` の状態で呼び出される  
**WHEN** 生成されたメッセージ文字列を検査する  
**THEN** `bug-fix` が含まれている

---

## TC-15: Completion Checklist セクションが既存完了条件テキストの後に配置されている

- **Category**: Prompt Structure
- **Priority**: should
- **Source**: D1 (既存テキストを維持し直後にチェックリストを追加)

**GIVEN** `DESIGN_SYSTEM_PROMPT` を参照する  
**WHEN** 既存完了条件テキストと `Completion Checklist` の出現位置を比較する  
**THEN** `Completion Checklist` の index が既存完了条件テキストの index より大きい（後に配置されている）

---

## TC-16: bun run typecheck が pass する

- **Category**: Build Integrity
- **Priority**: must
- **Source**: T-06 / 受け入れ基準

**GIVEN** 全コード変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で終了する（型エラーなし）

---

## TC-17: bun run test が全 green

- **Category**: Build Integrity
- **Priority**: must
- **Source**: T-06 / 受け入れ基準

**GIVEN** 全コード変更が適用されており、TC-01〜TC-15 に対応するテストが追加されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、exit code 0 で終了する

---

## TC-18: delta spec が change フォルダ内に少なくとも 1 件存在する

- **Category**: Spec Authority
- **Priority**: must
- **Source**: 受け入れ基準 (spec authority に Requirement が反映されている)

**GIVEN** `specrunner/changes/design-delta-spec-must-checklist/` ディレクトリが存在する  
**WHEN** `specs/` サブディレクトリを確認する  
**THEN** `specs/<capability>/spec.md` 形式のファイルが 1 件以上存在する

---

## TC-19: delta spec のセクションヘッダーが規約に準拠している

- **Category**: Spec Authority
- **Priority**: must
- **Source**: 受け入れ基準 (spec authority に Requirement が反映されている)

**GIVEN** `specrunner/changes/design-delta-spec-must-checklist/specs/` 配下の delta spec ファイルを読み込む  
**WHEN** 各セクションヘッダーを確認する  
**THEN** `## ADDED Requirements`、`## MODIFIED Requirements`、`## REMOVED Requirements`、`## RENAMED Requirements` のいずれかに分類されている

---

## TC-20: 既存テスト (TC-007〜TC-012 等) が引き続き green

- **Category**: Regression
- **Priority**: must
- **Source**: D5 (既存 TC-007〜TC-012 が green のまま)

**GIVEN** 変更前に pass していた既存テストスイートが存在する  
**WHEN** 全変更適用後に `bun run test` を実行する  
**THEN** 既存テストは新たに失敗していない
