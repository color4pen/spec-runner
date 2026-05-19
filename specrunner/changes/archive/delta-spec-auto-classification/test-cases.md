# Test Cases: Delta Spec Auto-Classification

## Meta

- **Source change**: delta-spec-auto-classification
- **Generated**: 2026-05-19
- **Coverage targets**: T-01〜T-15

---

## Category: parseDeltaSpec — 新形式 parse

### TC-01-01: Requirements セクションの parse

- **Priority**: must
- **Source**: T-01 受け入れ基準

**GIVEN** 以下の新形式 delta spec:
```markdown
# Delta Spec: Test

## Requirements
### Requirement: New Feature A
A user MUST be able to do X.

#### Scenario: basic usage
...
```

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `requirements` に `{ header: "New Feature A", content: "..." }` が 1 件含まれる
- `removed` は空配列
- `renamed` は空配列

---

### TC-01-02: Removed セクションの parse

- **Priority**: must
- **Source**: T-01、request.md 要件 2

**GIVEN** 以下の新形式 delta spec:
```markdown
# Delta Spec: Test

## Requirements
### Requirement: Feature B
...

## Removed
- "Old Feature X"
- "Old Feature Y"
```

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `removed` に `["Old Feature X", "Old Feature Y"]` が含まれる
- `requirements` に `Feature B` が含まれる

---

### TC-01-03: Renamed セクションの parse

- **Priority**: must
- **Source**: T-01、request.md 要件 2

**GIVEN** 以下の新形式 delta spec:
```markdown
# Delta Spec: Test

## Requirements
### Requirement: New Name
...

## Renamed
- "Old Name" → "New Name"
```

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `renamed` に `{ from: "Old Name", to: "New Name" }` が 1 件含まれる

---

### TC-01-04: 旧形式 delta spec を parse した場合

- **Priority**: must
- **Source**: T-01 受け入れ基準（「旧形式は空の結果を返す」）

**GIVEN** 旧形式の delta spec（`## ADDED Requirements` / `## MODIFIED Requirements` セクションを持つ）

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `requirements` が空配列
- `removed` が空配列
- `renamed` が空配列（= 旧形式セクションを解釈しない）

---

### TC-01-05: Removed / Renamed セクションが存在しない場合

- **Priority**: must
- **Source**: T-01

**GIVEN** `## Requirements` のみを持つ delta spec（`## Removed` / `## Renamed` なし）

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `requirements` に 1 件以上の Requirement が含まれる
- `removed` が空配列
- `renamed` が空配列

---

### TC-01-06: 複数 Requirement を含む Requirements セクション

- **Priority**: must
- **Source**: T-01

**GIVEN** `## Requirements` 配下に `### Requirement:` ブロックが 3 件ある delta spec

**WHEN** `parseDeltaSpec()` を呼び出す

**THEN**
- `requirements` の長さが 3

---

## Category: classifyDeltaSpec — 自動分類ロジック

### TC-02-01: baseline に存在する Requirement → MODIFIED

- **Priority**: must
- **Source**: T-02 受け入れ基準、request.md 要件 2、受け入れ基準

**GIVEN**
- baseline に `Requirement: Feature A` が存在する
- `parseDeltaSpec()` 結果の `requirements` に `Feature A` が含まれる

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `modified` に `Feature A` が含まれる
- `added` は空

---

### TC-02-02: baseline に存在しない Requirement → ADDED

- **Priority**: must
- **Source**: T-02 受け入れ基準、request.md 要件 2

**GIVEN**
- baseline に `Feature A` は存在するが `Feature B` は存在しない
- `requirements` に `Feature B` が含まれる

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `added` に `Feature B` が含まれる
- `modified` は空

---

### TC-02-03: 新規 capability（baseline null）→ 全 Requirement が ADDED

- **Priority**: must
- **Source**: T-02 受け入れ基準、request.md 受け入れ基準（PR #323 再現性消滅）

**GIVEN**
- baseline が `null`（capability の spec.md が存在しない）
- `requirements` に 3 件の Requirement が含まれる

**WHEN** `classifyDeltaSpec(parsed, null)` を呼び出す

**THEN**
- `added` の長さが 3
- `modified` が空配列
- `removed` が空配列

---

### TC-02-04: Removed リストが removed に分類される

- **Priority**: must
- **Source**: T-02 受け入れ基準、request.md 受け入れ基準

**GIVEN**
- `parsed.removed` に `["Feature X"]` が含まれる
- baseline に `Feature X` が存在する

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `removed` に `Feature X` に対応する `RequirementBlock` が含まれる

---

### TC-02-05: Renamed の old → new 適用後に MODIFIED 判定

- **Priority**: must
- **Source**: T-02、design.md D5、request.md 受け入れ基準

**GIVEN**
- `parsed.renamed` に `{ from: "Old Name", to: "New Name" }` が含まれる
- `parsed.requirements` に `New Name` の Requirement が含まれる
- baseline に `Old Name` が存在し `New Name` は存在しない

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `modified` に `New Name` が含まれる（rename 後に MODIFIED と判定）
- `added` に `New Name` が含まれない

---

### TC-02-06: Renamed 適用後の baseline に対して ADDED も正しく動作する

- **Priority**: should
- **Source**: T-02、design.md D5

**GIVEN**
- `parsed.renamed` に `{ from: "Old X", to: "New X" }` が含まれる
- `parsed.requirements` に `New X`（rename）と `Brand New`（新規）が含まれる
- baseline に `Old X` のみ存在

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `modified` に `New X` が含まれる
- `added` に `Brand New` が含まれる

---

### TC-02-07: normalized header matching（markdown decoration 耐性）

- **Priority**: should
- **Source**: T-02（`normalizeRequirementHeader()` の使用）

**GIVEN**
- baseline に `**Feature A**`（bold decoration あり）の Requirement が存在する
- `requirements` に `Feature A`（decoration なし）の Requirement が含まれる

**WHEN** `classifyDeltaSpec(parsed, baselineRequirements)` を呼び出す

**THEN**
- `modified` に `Feature A` が含まれる（decoration の差異を吸収）

---

### TC-02-08: delta に書かれていない baseline Requirement は保持される

- **Priority**: must
- **Source**: request.md 要件 2 項目 4

**GIVEN**
- baseline に `Feature A`, `Feature B`, `Feature C` が存在する
- `requirements` に `Feature A` のみ含まれる（B, C は記載なし）

**WHEN** `classifyDeltaSpec` → `applyMerge` を呼び出す

**THEN**
- 結果の spec に `Feature B`, `Feature C` が残存する

---

## Category: mergeSpecsForChange — 統合フロー

### TC-03-01: 新形式 delta spec の end-to-end merge

- **Priority**: must
- **Source**: T-03 受け入れ基準

**GIVEN**
- 既存 capability の spec.md が存在する
- delta spec が新形式（`## Requirements` + `## Removed`）で記述されている

**WHEN** `mergeSpecsForChange()` を呼び出す

**THEN**
- parse → classify → validate → applyMerge の順で処理される
- baseline の既存 Requirement が適切に MODIFIED / 保持される

---

### TC-03-02: 新規 capability（baseline 不在）の全 ADDED

- **Priority**: must
- **Source**: T-03 受け入れ基準、T-13

**GIVEN**
- capability の spec.md が存在しない（新規 capability）
- delta spec が `## Requirements` 配下に 2 件の Requirement を持つ

**WHEN** `mergeSpecsForChange()` を呼び出す

**THEN**
- 2 件とも ADDED として処理され、新規 spec.md が生成される

---

### TC-03-03: baseline null + removed が非空 → エラー

- **Priority**: must
- **Source**: T-03（「baseline が null で removed/renamed が非空の場合はエラー」）

**GIVEN**
- baseline が null（新規 capability）
- delta spec の `## Removed` に 1 件のエントリがある

**WHEN** `mergeSpecsForChange()` を呼び出す

**THEN**
- エラーが返される（新規 capability に削除対象は存在しない）

---

### TC-03-04: baseline null + renamed が非空 → エラー

- **Priority**: must
- **Source**: T-03

**GIVEN**
- baseline が null（新規 capability）
- delta spec の `## Renamed` に 1 件のエントリがある

**WHEN** `mergeSpecsForChange()` を呼び出す

**THEN**
- エラーが返される

---

### TC-03-05: empty delta（requirements + removed + renamed すべて空）→ エラー

- **Priority**: must
- **Source**: T-03 受け入れ基準、T-13

**GIVEN**
- delta spec が `## Requirements` セクションを持つが Requirement が 0 件
- `## Removed` / `## Renamed` も空または存在しない

**WHEN** `mergeSpecsForChange()` を呼び出す

**THEN**
- エラーが返される（"empty delta" エラー）

---

## Category: dsv rule — 旧形式 reject / 新形式 require

### TC-04-01: 旧形式 `## ADDED Requirements` が HIGH violation

- **Priority**: must
- **Source**: T-04 受け入れ基準、request.md 受け入れ基準

**GIVEN** `## ADDED Requirements` セクションを持つ delta spec

**WHEN** `canonical-spec-structure` の validation rule を実行する

**THEN**
- `legacy-section-header` violation が返される
- severity が `error`（HIGH 相当）

---

### TC-04-02: 旧形式 `## MODIFIED Requirements` が HIGH violation

- **Priority**: must
- **Source**: T-04 受け入れ基準

**GIVEN** `## MODIFIED Requirements` セクションを持つ delta spec

**WHEN** validation rule を実行する

**THEN**
- `legacy-section-header` violation が返される

---

### TC-04-03: 旧形式 `## REMOVED Requirements` が HIGH violation

- **Priority**: must
- **Source**: T-04 受け入れ基準

**GIVEN** `## REMOVED Requirements` セクションを持つ delta spec

**WHEN** validation rule を実行する

**THEN**
- `legacy-section-header` violation が返される

---

### TC-04-04: 旧形式 `## RENAMED Requirements` が HIGH violation

- **Priority**: must
- **Source**: T-04

**GIVEN** `## RENAMED Requirements` セクションを持つ delta spec

**WHEN** validation rule を実行する

**THEN**
- `legacy-section-header` violation が返される

---

### TC-04-05: 新形式 `## Requirements` のみで violation なし

- **Priority**: must
- **Source**: T-04 受け入れ基準、request.md 受け入れ基準

**GIVEN** `## Requirements` セクションを持ち `## Removed` / `## Renamed` を持たない delta spec

**WHEN** validation rule を実行する

**THEN**
- `legacy-section-header` violation が返されない
- `missing-requirements-section` violation が返されない

---

### TC-04-06: 新形式 `## Requirements` + `## Removed` + `## Renamed` で violation なし

- **Priority**: must
- **Source**: T-04

**GIVEN** `## Requirements`, `## Removed`, `## Renamed` をすべて持つ delta spec

**WHEN** validation rule を実行する

**THEN**
- section header 関連の violation がなし

---

### TC-04-07: `## Requirements` が存在しない場合 `missing-requirements-section` violation

- **Priority**: must
- **Source**: T-04（`missing-requirements-section` の suggested メッセージ更新）

**GIVEN** `## Requirements` セクションが存在しない delta spec

**WHEN** validation rule を実行する

**THEN**
- `missing-requirements-section` violation が返される
- suggested メッセージが `"Add ## Requirements section"` を含む

---

### TC-04-08: violation の suggested メッセージが新形式を案内する

- **Priority**: should
- **Source**: T-04

**GIVEN** 旧形式 section header を持つ delta spec

**WHEN** validation rule を実行する

**THEN**
- `legacy-section-header` violation の suggested メッセージが `"## Requirements (tool auto-classifies)"` を含む

---

## Category: prompt fragment — DELTA_SPEC_FORMAT / AUTHORITY_SPEC_GUARD

### TC-05-01: DELTA_SPEC_FORMAT が `## Requirements` を含む

- **Priority**: must
- **Source**: T-05a 受け入れ基準、request.md 受け入れ基準

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `DELTA_SPEC_FORMAT` の文字列を検査する

**THEN**
- `## Requirements` が含まれる

---

### TC-05-02: DELTA_SPEC_FORMAT が旧セクションヘッダーを含まない

- **Priority**: must
- **Source**: T-05a 受け入れ基準、request.md 受け入れ基準

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `DELTA_SPEC_FORMAT` の文字列を検査する

**THEN**
- `## ADDED Requirements` が含まれない
- `## MODIFIED Requirements` が含まれない
- `## REMOVED Requirements` が含まれない
- `## RENAMED Requirements` が含まれない

---

### TC-05-03: DELTA_SPEC_FORMAT が「tool が ADDED/MODIFIED を決定する」旨を明示している

- **Priority**: must
- **Source**: T-05a（「ADDED / MODIFIED の判断は agent がしない、tool が baseline 突合で決定する」を明示）

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `DELTA_SPEC_FORMAT` の文字列を検査する

**THEN**
- ADDED / MODIFIED の分類が tool 側で行われることを説明するテキストが含まれる

---

### TC-05-04: DELTA_SPEC_FORMAT が `## Removed` の記法を説明している

- **Priority**: should
- **Source**: T-05a

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `DELTA_SPEC_FORMAT` の文字列を検査する

**THEN**
- `- "name"` 形式のリストが `## Removed` セクションの説明として含まれる

---

### TC-05-05: DELTA_SPEC_FORMAT が `## Renamed` の記法を説明している

- **Priority**: should
- **Source**: T-05a

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `DELTA_SPEC_FORMAT` の文字列を検査する

**THEN**
- `"old" → "new"` 形式が `## Renamed` セクションの説明として含まれる

---

### TC-05-06: AUTHORITY_SPEC_GUARD が旧分類基準（ADDED/MODIFIED/REMOVED/RENAMED の選択指示）を含まない

- **Priority**: must
- **Source**: T-05b 受け入れ基準

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `AUTHORITY_SPEC_GUARD` の「書く側の規律」節を検査する

**THEN**
- `ADDED` / `MODIFIED` の選択基準を agent に指示するテキストが削除されている

---

### TC-05-07: AUTHORITY_SPEC_GUARD が新形式の「tool が ADDED/MODIFIED を決定する」旨を含む

- **Priority**: must
- **Source**: T-05b

**GIVEN** `src/prompts/fragments.ts` が更新済みである

**WHEN** `AUTHORITY_SPEC_GUARD` の文字列を検査する

**THEN**
- 「`## Requirements` に変更/追加したい Requirement を書く。ADDED / MODIFIED の判断は tool が行う」に相当するテキストが含まれる

---

## Category: design-system.ts checklist

### TC-06-01: Self-review checklist が旧形式セクションヘッダーを参照しない

- **Priority**: must
- **Source**: T-06 受け入れ基準

**GIVEN** `src/prompts/design-system.ts` が更新済みである

**WHEN** `DESIGN_SYSTEM_PROMPT` の完成文字列を検査する

**THEN**
- `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` への言及がない

---

### TC-06-02: Self-review checklist に `## Requirements` セクション存在確認が含まれる

- **Priority**: must
- **Source**: T-06

**GIVEN** `src/prompts/design-system.ts` が更新済みである

**WHEN** `DESIGN_SYSTEM_PROMPT` を検査する

**THEN**
- 「各 delta spec に `## Requirements` セクションが存在する」相当の checklist 項目が含まれる

---

### TC-06-03: Completion Checklist が旧形式を参照しない

- **Priority**: must
- **Source**: T-06

**GIVEN** `src/prompts/design-system.ts` が更新済みである

**WHEN** Completion Checklist 部分の文字列を検査する

**THEN**
- 旧セクションヘッダーへの言及がない
- 「baseline に存在する Requirement を変更する場合、header が baseline と一致している」相当の項目が含まれる

---

## Category: spec-review-system.ts Baseline Consistency Check

### TC-07-01: Baseline Consistency Check が旧セクションヘッダー条件判定を含まない

- **Priority**: must
- **Source**: T-07 受け入れ基準

**GIVEN** `src/prompts/spec-review-system.ts` が更新済みである

**WHEN** `SPEC_REVIEW_BASE` の文字列を検査する

**THEN**
- `## MODIFIED` / `## REMOVED` / `## RENAMED` / `## ADDED` を条件判定するテキストが削除されている

---

### TC-07-02: Baseline Consistency Check が新形式に対応した確認指示を持つ

- **Priority**: must
- **Source**: T-07

**GIVEN** `src/prompts/spec-review-system.ts` が更新済みである

**WHEN** Baseline Consistency Check 節を検査する

**THEN**
- 「delta spec の `## Requirements` がある場合、各 Requirement header が baseline と整合するか確認する」相当の指示が含まれる

---

### TC-07-03: 「ADDED/MODIFIED 分類は tool 側が担保」の明記

- **Priority**: should
- **Source**: T-07（design.md D7 の方針）

**GIVEN** `src/prompts/spec-review-system.ts` が更新済みである

**WHEN** Baseline Consistency Check 節を検査する

**THEN**
- ADDED/MODIFIED 分類が tool 側（`classifyDeltaSpec`）で担保される旨の説明が含まれる

---

### TC-07-04: 新規 capability + Removed/Renamed がある場合の HIGH finding ルールが維持される

- **Priority**: should
- **Source**: T-07（「baseline file が存在しない場合 + `## Removed` / `## Renamed` がある → HIGH finding」は維持）

**GIVEN** `src/prompts/spec-review-system.ts` が更新済みである

**WHEN** Baseline Consistency Check 節を検査する

**THEN**
- 「baseline 不在 + `## Removed` / `## Renamed` → HIGH finding」のルールが残存している

---

## Category: delta-spec-validation.ts / delta-spec-fixer.ts メッセージ

### TC-08-01: validation の How to Fix メッセージが新形式を案内する

- **Priority**: must
- **Source**: T-08 受け入れ基準

**GIVEN** `src/core/spec/delta-spec-validation.ts` が更新済みである

**WHEN** `How to Fix` メッセージの文字列を検査する

**THEN**
- `## Requirements` section への言及がある
- `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` への言及がない

---

### TC-08-02: fixer の指示メッセージが新形式を参照する

- **Priority**: must
- **Source**: T-08 受け入れ基準

**GIVEN** `src/core/spec/delta-spec-fixer.ts` が更新済みである

**WHEN** L54 周辺の fixer 指示メッセージを検査する

**THEN**
- `"a ## Requirements section header"` への言及がある
- 旧形式（`## ADDED Requirements`）への言及がない

---

## Category: type-config.ts specImpact

### TC-09-01: new-feature の specImpact が旧ヘッダーを参照しない

- **Priority**: should
- **Source**: T-09 受け入れ基準

**GIVEN** `src/config/type-config.ts` が更新済みである

**WHEN** `new-feature` の `specImpact` フィールドを検査する

**THEN**
- `## ADDED Requirements` / `MODIFIED` 等の旧セクションヘッダーへの言及がない
- `## Requirements` への言及がある

---

### TC-09-02: spec-change の specImpact が新形式用語を使用する

- **Priority**: should
- **Source**: T-09

**GIVEN** `src/config/type-config.ts` が更新済みである

**WHEN** `spec-change` の `specImpact` フィールドを検査する

**THEN**
- `## Requirements` + `## Removed` / `## Renamed` の説明がある

---

### TC-09-03: bug-fix の specImpact が MODIFIED 言及を削除している

- **Priority**: should
- **Source**: T-09

**GIVEN** `src/config/type-config.ts` が更新済みである

**WHEN** `bug-fix` の `specImpact` フィールドを検査する

**THEN**
- `MODIFIED` への言及がなく `## Requirements` を使う条件説明がある

---

## Category: unit test — parseDeltaSpec / classifyDeltaSpec

### TC-10-01: TC-SM-010〜014 が新形式 fixture で green

- **Priority**: must
- **Source**: T-10 受け入れ基準

**GIVEN** `tests/finish-spec-merge.test.ts` の `parseDeltaSpec` テストケースが新形式に書き直されている

**WHEN** `bun run test -- finish-spec-merge` を実行する

**THEN**
- TC-SM-010〜014 がすべて pass

---

### TC-10-02: classifyDeltaSpec の新規テストが green

- **Priority**: must
- **Source**: T-10 受け入れ基準

**GIVEN** baseline あり + requirements の ADDED/MODIFIED 自動分類テストが追加されている

**WHEN** テストを実行する

**THEN**
- `classifyDeltaSpec` の全新規テストが pass

---

### TC-10-03: classifyDeltaSpec — baseline null → 全 ADDED のテストが green

- **Priority**: must
- **Source**: T-10 受け入れ基準（PR #323 再現性消滅）

**GIVEN** `classifyDeltaSpec(parsed, null)` で全 ADDED のテストが追加されている

**WHEN** テストを実行する

**THEN**
- テストが pass

---

## Category: unit test — dsv rule

### TC-11-01: helpers.ts の validSpecContent が新形式で書かれている

- **Priority**: must
- **Source**: T-11

**GIVEN** `tests/unit/core/spec/rules/helpers.ts` の `validSpecContent()` が `## Requirements` に更新されている

**WHEN** `canonical-spec-structure.test.ts` を実行する

**THEN**
- 既存テストが全て pass

---

### TC-11-02: 旧形式 `## ADDED Requirements` が `legacy-section-header` violation を返すテストが green

- **Priority**: must
- **Source**: T-11 受け入れ基準

**GIVEN** 旧形式 section header の violation テストが追加されている

**WHEN** テストを実行する

**THEN**
- `legacy-section-header` violation が検出される（severity: error）

---

### TC-11-03: 旧形式 `## MODIFIED Requirements` の violation テストが green

- **Priority**: must
- **Source**: T-11

**GIVEN** 旧形式 `## MODIFIED Requirements` の violation テストが追加されている

**WHEN** テストを実行する

**THEN**
- テストが pass

---

### TC-11-04: delta-spec-validator.test.ts の fixture が新形式で green

- **Priority**: must
- **Source**: T-11

**GIVEN** `tests/unit/core/spec/delta-spec-validator.test.ts` の fixture が `## Requirements` に更新されている

**WHEN** テストを実行する

**THEN**
- すべてのテストが pass

---

## Category: unit test — prompt fragment string assertion

### TC-12-01: DELTA_SPEC_FORMAT に `## Requirements` が含まれ `## ADDED Requirements` が含まれないことを assert するテストが green

- **Priority**: must
- **Source**: T-12 受け入れ基準

**GIVEN** `DELTA_SPEC_FORMAT` の string assertion テストが追加されている

**WHEN** テストを実行する

**THEN**
- テストが pass

---

### TC-12-02: AUTHORITY_SPEC_GUARD が旧分類基準を含まないことを assert するテストが green

- **Priority**: must
- **Source**: T-12 受け入れ基準

**GIVEN** `AUTHORITY_SPEC_GUARD` の string assertion テストが追加されている

**WHEN** テストを実行する

**THEN**
- テストが pass

---

### TC-12-03: DESIGN_SYSTEM_PROMPT が `## ADDED Requirements` を含まないことを assert するテストが green

- **Priority**: must
- **Source**: T-12 受け入れ基準

**GIVEN** `DESIGN_SYSTEM_PROMPT` の string assertion テストが追加されている

**WHEN** テストを実行する

**THEN**
- テストが pass

---

### TC-12-04: pipeline-integration.test.ts の旧形式 fixture が新形式に更新されている

- **Priority**: must
- **Source**: T-12

**GIVEN** `tests/pipeline-integration.test.ts` の delta spec fixture が新形式に書き直されている

**WHEN** テストを実行する

**THEN**
- すべてのテストが pass

---

### TC-12-05: delta-spec-validation.test.ts の旧形式 fixture が新形式に更新されている

- **Priority**: must
- **Source**: T-12

**GIVEN** `tests/unit/step/delta-spec-validation.test.ts` の fixture が新形式に書き直されている

**WHEN** テストを実行する

**THEN**
- すべてのテストが pass

---

## Category: integration test — mergeSpecsForChange

### TC-13-01: 新形式 delta spec の統合テスト（既存 capability）が green

- **Priority**: must
- **Source**: T-13 受け入れ基準

**GIVEN** `tests/finish-spec-merge.test.ts` の TC-SM-070 以降の fixture が新形式に更新されている

**WHEN** テストを実行する

**THEN**
- 既存 capability + baseline → ADDED/MODIFIED 自動分類の統合テストが pass

---

### TC-13-02: 新規 capability（baseline 不在）の統合テストが green

- **Priority**: must
- **Source**: T-13 受け入れ基準

**GIVEN** 新規 capability の統合テストが追加されている

**WHEN** テストを実行する

**THEN**
- 全 Requirement が ADDED として処理される統合テストが pass

---

## Category: build green

### TC-14-01: `bun run typecheck` が green

- **Priority**: must
- **Source**: T-14 受け入れ基準、request.md 要件 7

**GIVEN** T-01〜T-13 の実装が完了している

**WHEN** `bun run typecheck` を実行する

**THEN**
- 型エラーが 0 件

---

### TC-14-02: `bun run test` が green

- **Priority**: must
- **Source**: T-14 受け入れ基準、request.md 受け入れ基準

**GIVEN** T-01〜T-13 の実装・テスト更新が完了している

**WHEN** `bun run test` を実行する

**THEN**
- 全テストが pass

---

### TC-14-03: src/ 配下に旧形式セクションヘッダーへの参照が残存しない

- **Priority**: must
- **Source**: T-14（grep 確認）

**GIVEN** 実装が完了している

**WHEN** `src/` 配下を `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` で grep する

**THEN**
- ヒット件数が 0（archive / テスト期待値を除く）

---

## Category: ADR

### TC-15-01: `docs/adr/` に ADR ファイルが存在する

- **Priority**: must
- **Source**: T-15 受け入れ基準、request.md 受け入れ基準

**GIVEN** T-15 の実装が完了している

**WHEN** `docs/adr/` ディレクトリを確認する

**THEN**
- 本変更に関する ADR ファイルが存在する

---

### TC-15-02: ADR に LLM 不確定性への構造的解決の思想が記録されている

- **Priority**: must
- **Source**: T-15 受け入れ基準、request.md 受け入れ基準

**GIVEN** ADR ファイルが存在する

**WHEN** ADR の内容を確認する

**THEN**
- PR #283 / #289 / #299 / #323 の事故分析が背景として記録されている
- 「LLM agent には semantic content だけ書かせる、format/structure/classification は tool が決定する」思想が記録されている
- D1〜D7（design.md の Decisions）が要約されている
- 旧形式 delta spec の移行が必要という trade-off が記録されている

---

## Summary

| Priority | Count |
|----------|-------|
| must     | 43    |
| should   | 11    |
| could    | 0     |
| **Total** | **54** |

| Category | Count |
|----------|-------|
| parseDeltaSpec — 新形式 parse | 6 |
| classifyDeltaSpec — 自動分類ロジック | 8 |
| mergeSpecsForChange — 統合フロー | 5 |
| dsv rule — 旧形式 reject / 新形式 require | 8 |
| prompt fragment | 7 |
| design-system.ts checklist | 3 |
| spec-review-system.ts | 4 |
| delta-spec-validation / fixer | 2 |
| type-config.ts specImpact | 3 |
| unit test — parseDeltaSpec / classifyDeltaSpec | 3 |
| unit test — dsv rule | 4 |
| unit test — prompt fragment string assertion | 5 |
| integration test — mergeSpecsForChange | 2 |
| build green | 3 |
| ADR | 2 |
