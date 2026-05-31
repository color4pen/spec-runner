# Test Cases: sync-job-state-fsm-spec

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 9
- **Manual**: 6
- **Priority**: must: 11, should: 4, could: 0

---

### TC-001: delta spec の JobStatus 7値 enum が schema.ts と文字列一致する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-01 AC「delta spec の status enum が src/state/schema.ts L5 の JobStatus type と一致（7 値）」

**GIVEN** `specrunner/changes/sync-job-state-fsm-spec/specs/job-state-store/spec.md` が作成されている  
**WHEN** delta spec 内の `JobStatus` 型宣言を読む  
**THEN** `"running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled"` の 7 値であり、`src/state/schema.ts` L5 の型宣言と文字列一致する

---

### TC-002: delta spec の Requirement ヘッダが baseline L345 と完全一致する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-01 AC「delta spec の ### Requirement: header が baseline L345 の header と完全一致する」; design.md D1（MODIFIED 自動分類の前提条件）

**GIVEN** delta spec が作成されている  
**WHEN** delta spec の Requirement ヘッダを baseline spec L345 と比較する  
**THEN** ヘッダが `` ### Requirement: `JobStatus` includes `archived` as a terminal status `` と完全一致し、tool が MODIFIED として自動分類できる

---

### TC-003: canonical 正常完走遷移が `awaiting-merge → archived` と記述されている

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-01「canonical 正常完走遷移を awaiting-merge → archived と記述する」; 受け入れ基準 2

**GIVEN** delta spec の Requirement 本文  
**WHEN** canonical な正常完走遷移の記述を読む  
**THEN** `awaiting-merge → archived` が正常完走の最終遷移として記述されており、旧来の `success → archived` の記述が存在しない

---

### TC-004: VALID_TRANSITIONS 遷移表が lifecycle.ts L36-44 と一致する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-01「VALID_TRANSITIONS 許可遷移表（src/state/lifecycle.ts と同一）を Requirement 本文に含める」; design.md D3

**GIVEN** delta spec に VALID_TRANSITIONS 許可遷移表が含まれている  
**WHEN** delta spec の各行を `src/state/lifecycle.ts` L36-44 の `VALID_TRANSITIONS` と比較する  
**THEN** 以下がすべて一致する
- `running` → `{awaiting-resume, awaiting-merge, failed, terminated, canceled}`
- `awaiting-resume` → `{running, canceled}`
- `awaiting-merge` → `{archived, canceled}`
- `failed` → `{running, canceled, awaiting-resume}`
- `terminated` → `{running, canceled}`
- `archived` → `{}` (terminal・出口なし)
- `canceled` → `{}` (terminal・出口なし)

---

### TC-005: active / terminal 区分が lifecycle.ts と一致する

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-01「active = {running, awaiting-resume} / terminal = {archived, canceled} の区分を明記する」; lifecycle.ts L46-48

**GIVEN** delta spec の Requirement 本文  
**WHEN** active / terminal 区分の記述を読む  
**THEN** active = `{running, awaiting-resume}`、terminal = `{archived, canceled}` と明記されている

---

### TC-006: legacy `success` Scenario が remap 挙動（on-read で `awaiting-merge` へ変換）を反映する

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-01 AC「legacy success Scenario が remap 挙動（success → awaiting-merge）と一致」; 受け入れ基準 2

**GIVEN** 旧 CLI バージョンが書いた `status: "success"` の状態ファイルが存在する  
**WHEN** `JobStateStore.load()` を呼ぶ  
**THEN** `state.status === "awaiting-merge"` となる（delta spec の legacy success Scenario がこの挙動を記述しており、「success のまま残る」という旧 Scenario の主張が訂正されている）

---

### TC-007: "No intermediate `merged` status" Scenario が `awaiting-merge` ベースで記述されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-01「"No intermediate `merged` status" Scenario を awaiting-merge ベースに書き換える」

**GIVEN** delta spec の "No intermediate `merged` status" Scenario  
**WHEN** `specrunner finish` Phase 3（`gh pr merge`）が成功し Phase 4（markJobArchived）未実行の状態を参照する  
**THEN** `state.status` が `awaiting-merge` のまま保たれると記述されており（旧 Scenario の `success` ではない）、Phase 4 完了後に `archived` へ直接遷移すると記述されている

---

### TC-008: `SPEC_REVIEW_RETRIES_EXHAUSTED` Scenario の status が `awaiting-merge` に訂正されている

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-02 AC「delta spec の Scenario 内に status の現行値としての success が残っていない」; 受け入れ基準 4

**GIVEN** maxRetries=2 で iter=1 needs-fix → iter=2 needs-fix が発生した後の状態  
**WHEN** `SPEC_REVIEW_RETRIES_EXHAUSTED` Scenario のアサーションを読む  
**THEN**
- `state.error.code === "SPEC_REVIEW_RETRIES_EXHAUSTED"`
- `state.steps["spec-review"][1].verdict === "escalation"`
- `state.status === "awaiting-merge"`（旧 Scenario の `success` ではない）

---

### TC-009: `SPEC_REVIEW_RETRIES_EXHAUSTED` Requirement の normative 記述（MUST/SHALL）が baseline と同一である

- **Category**: manual
- **Priority**: should
- **Source**: tasks.md T-02「Requirement 本文の normative 記述（MUST/SHALL）は変更しない」

**GIVEN** delta spec の `SPEC_REVIEW_RETRIES_EXHAUSTED` Requirement 本文  
**WHEN** normative 記述（MUST/SHALL 文）を baseline（spec.md L72）と比較する  
**THEN** `state.error` の `{ code, message, hint }` 構造・`<NNN>` フォーマット・`verdict: escalation` への書き換えの各 MUST/SHALL 文が baseline と同一であり、変更はシナリオ内の status 値（`success` → `awaiting-merge`）のみである

---

### TC-010: delta spec 内に status の現行値としての `success` が残っていない（grep 確認）

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-03「delta spec 内に status の現行値としての success が残っていないことを grep で確認」; 受け入れ基準 4

**GIVEN** delta spec が完成している  
**WHEN** delta spec を `success` で grep する  
**THEN** `success` は legacy remap の説明文脈（例: "legacy `success` は load 時に `awaiting-merge` へ remap される"）にのみ出現し、現行の有効 status 値として宣言・参照されていない

---

### TC-011: delta spec の遷移表が `architecture/domain-model.md` の FSM と矛盾しない

- **Category**: manual
- **Priority**: must
- **Source**: tasks.md T-03「delta spec の遷移表が architecture/domain-model.md の遷移表と矛盾しないことを確認」; 受け入れ基準 3

**GIVEN** delta spec の VALID_TRANSITIONS 表と `architecture/domain-model.md` の JobStatus 状態機械節  
**WHEN** 両表のすべてのセルを比較する  
**THEN** delta spec にある遷移はすべて domain-model.md にも存在し、domain-model.md にある遷移はすべて delta spec にも存在する（矛盾ゼロ）

---

### TC-012: baseline の 5値 enum 宣言が delta spec によって supersede されており矛盾要件が残らない

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md T-01; 受け入れ基準 5「既存 Requirement JobStatus includes archived as a terminal status（L345-365）が delta spec で置換され、baseline に矛盾要件が残らない」

**GIVEN** baseline spec（specrunner/specs/job-state-store/spec.md）と delta spec が存在する  
**WHEN** merge 後の有効 spec を確認する（delta が baseline L345-365 を supersede）  
**THEN**
- baseline L345-365 の 5値 enum 宣言（`"running" | "success" | "failed" | "terminated" | "archived"`）は delta spec に置換されており有効でない
- baseline に `success → archived` を canonical 遷移とする記述が有効な要件として残らない
- baseline の "Legacy `success` state loads without migration" Scenario の矛盾内容が有効な要件として残らない

---

### TC-013: `awaiting-resume` が exit-guard によるチェックポイントとして説明されている

- **Category**: unit
- **Priority**: should
- **Source**: 要件 4「awaiting-resume（exit-guard が倒す checkpoint）を Requirement に追記する」

**GIVEN** delta spec の Requirement 本文  
**WHEN** `awaiting-resume` の意味・設定主体の記述を読む  
**THEN** `awaiting-resume` が exit-guard による中断チェックポイントである旨が明記されており（`running → awaiting-resume` の設定者が exit-guard）、active 区分に属することが分かる

---

### TC-014: `canceled` が terminal status として Requirement に記述されている

- **Category**: unit
- **Priority**: should
- **Source**: 要件 4「canceled を Requirement に追記し、terminal = {archived, canceled} の区分を spec に反映する」

**GIVEN** delta spec の Requirement 本文  
**WHEN** `canceled` ステータスの記述を読む  
**THEN** `canceled` が terminal 区分の一員として明記されており、遷移表から任意の非 terminal 状態（running / awaiting-resume / awaiting-merge / failed / terminated）から遷移可能であることが読み取れる

---

### TC-015: `bun run build && bun run typecheck && bun run lint && bun run test` が green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md T-03「bun run build && bun run typecheck && bun run lint && bun run test が green であることを確認」; 受け入れ基準 6

**GIVEN** delta spec の変更が適用されたコードベース  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行する  
**THEN** すべてのコマンドが exit code 0 で完了する

---

## Result

```yaml
result: completed
total: 15
automated: 9
manual: 6
must: 11
should: 4
could: 0
blocked_reasons: []
```
