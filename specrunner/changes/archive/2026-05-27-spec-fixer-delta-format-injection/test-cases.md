# Test Cases: spec-fixer-delta-format-injection

## Summary

| TC | Title | Category | Priority |
|----|-------|----------|----------|
| TC-029 | spec-fixer prompt — `## Removed` リスト形式規約が inline で含まれる | Prompt Content | must |
| TC-030 | spec-fixer prompt — `## Renamed` リスト形式規約が inline で含まれる | Prompt Content | must |
| TC-031 | spec-fixer prompt — `## Delta Spec Format Rules` セクションが存在する | Prompt Content | must |
| TC-032 | spec-fixer prompt — rules.md 参照が維持されている | Prompt Content | must |
| TC-033 | spec-fixer prompt — `### Requirement:` 一致規約が含まれる | Prompt Content | should |
| TC-034 | spec-fixer prompt — `SHALL` / `MUST` 規約が含まれる | Prompt Content | should |
| TC-035 | code-fixer prompt — `## Delta Spec Format Rules` セクションが存在する | Prompt Content | must |
| TC-036 | code-fixer prompt — `## Removed` リスト形式規約が inline で含まれる | Prompt Content | must |
| TC-037 | code-fixer prompt — `## Renamed` リスト形式規約が inline で含まれる | Prompt Content | must |
| TC-038 | code-fixer prompt — rules.md 参照が含まれる | Prompt Content | must |
| TC-039 | code-fixer prompt — 禁止事項が authority spec に限定されている | Prompt Content | must |
| TC-040 | code-fixer prompt — delta spec が禁止対象から除外されている | Prompt Content | must |
| TC-041 | code-fixer prompt — `### Requirement:` 一致規約が含まれる | Prompt Content | should |
| TC-042 | typecheck が green | Build | must |
| TC-043 | test suite が green（既存テストを壊さない） | Regression | must |

---

## TC-029: spec-fixer prompt — `## Removed` リスト形式規約が inline で含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 AC（`- "requirement name"` が含まれていること）

### GIVEN
`buildSpecFixerSystemPrompt()` を引数なしで呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `- "requirement name"` が含まれている
- ブロック形式・散文形式が禁止される旨が示されている（`ブロック形式` または `散文形式` を含む）

---

## TC-030: spec-fixer prompt — `## Renamed` リスト形式規約が inline で含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01 AC（`- "old name"` が含まれていること）

### GIVEN
`buildSpecFixerSystemPrompt()` を呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `- "old name"` が含まれている（`## Renamed` のリスト形式規約）

---

## TC-031: spec-fixer prompt — `## Delta Spec Format Rules` セクションが存在する

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-01、design.md §変更対象1

### GIVEN
`buildSpecFixerSystemPrompt()` を呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `## Delta Spec Format Rules` が含まれている

---

## TC-032: spec-fixer prompt — rules.md 参照が維持されている

- **Category**: Prompt Content
- **Priority**: must
- **Source**: request.md 要件1「rules.md を読め指示は残す」

### GIVEN
`buildSpecFixerSystemPrompt()` を呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `rules.md` が含まれている（「詳細ルールは rules.md 参照」の一文が維持されている）

---

## TC-033: spec-fixer prompt — `### Requirement:` 一致規約が含まれる

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-01（5 項目の 3 番目）、design.md §変更対象1

### GIVEN
`buildSpecFixerSystemPrompt()` を呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `### Requirement:` または `baseline と完全一致` が含まれている

---

## TC-034: spec-fixer prompt — `SHALL` / `MUST` 規約が含まれる

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-01（5 項目の 5 番目）、rules.md §delta spec 記法 ルール 6

### GIVEN
`buildSpecFixerSystemPrompt()` を呼び出す

### WHEN
返り値の文字列を検査する

### THEN
- `SHALL` または `MUST` という文字列が含まれている（Requirement 本文に normative keyword が必要な旨の規約）

---

## TC-035: code-fixer prompt — `## Delta Spec Format Rules` セクションが存在する

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-03 AC（`## Delta Spec Format Rules` が含まれていること）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `## Delta Spec Format Rules` が含まれている

---

## TC-036: code-fixer prompt — `## Removed` リスト形式規約が inline で含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-03 AC（`- "requirement name"` が含まれていること）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `- "requirement name"` が含まれている

---

## TC-037: code-fixer prompt — `## Renamed` リスト形式規約が inline で含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-03（T-01 と同じ 5 項目を code-fixer にも適用）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `- "old name"` が含まれている

---

## TC-038: code-fixer prompt — rules.md 参照が含まれる

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-03 AC（`rules.md` が含まれていること）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `rules.md` が含まれている（delta spec 記法の詳細を rules.md に委ねる参照が存在する）

---

## TC-039: code-fixer prompt — 禁止事項が authority spec に限定されている

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-02 AC（`specrunner/specs/` が含まれていること）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `specrunner/specs/` が含まれている（禁止対象が authority spec パスに限定されている）

---

## TC-040: code-fixer prompt — delta spec が禁止対象から除外されている

- **Category**: Prompt Content
- **Priority**: must
- **Source**: T-02 AC（delta spec が禁止対象から除外されている）

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `仕様変更（spec ファイルの変更）` という旧い禁止事項文言が含まれていない
  - 代わりに `specrunner/specs/` パス限定の禁止事項が記載されている（TC-039 で確認済み）

---

## TC-041: code-fixer prompt — `### Requirement:` 一致規約が含まれる

- **Category**: Prompt Content
- **Priority**: should
- **Source**: T-03（T-01 と同じ 5 項目を code-fixer にも適用）、design.md §変更対象2b

### GIVEN
`CODE_FIXER_SYSTEM_PROMPT` 定数を検査する

### WHEN
文字列を確認する

### THEN
- `### Requirement:` または `baseline と完全一致` が含まれている

---

## TC-042: typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: T-04 AC

### GIVEN
`src/prompts/spec-fixer-system.ts` と `src/prompts/code-fixer-system.ts` の変更が完了している

### WHEN
`bun run typecheck` を実行する

### THEN
- exit code が 0
- TypeScript コンパイルエラーがない

---

## TC-043: test suite が green（既存テストを壊さない）

- **Category**: Regression
- **Priority**: must
- **Source**: T-04 AC、design.md §テスト影響

### GIVEN
prompt ファイルの変更が完了している

### WHEN
`bun run test` を実行する

### THEN
- exit code が 0
- TC-028（buildSpecFixerSystemPrompt 必須キーワード）が pass
- TC-060（Author-Bias Elimination キーワード）が pass
- TC-006〜TC-010（CodeFixerStep 基本規約）が pass
- TC-025〜TC-026（CodeFixerStep.buildMessage）が pass
- 全テストが pass
