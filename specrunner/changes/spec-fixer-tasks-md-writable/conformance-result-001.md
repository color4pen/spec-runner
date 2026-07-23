# Conformance Result — spec-fixer-tasks-md-writable — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: すべての spec 要件・シナリオが実装でカバーされているか

**Requirement: spec-fixer SHALL declare tasks.md in its canon write-set**

- *Scenario: writes() exposes tasks.md alongside spec.md and design.md*
  — `src/core/step/spec-fixer.ts` lines 99–106: `writes()` が `design.md`・`spec.md`・`tasks.md` の 3 ファイルを返す。✅
- *Scenario: the D5 canon-write-scope map grants spec-fixer tasks.md*
  — `src/core/step/canon-write-scope.ts` line 51: `spec-fixer` エントリが `{spec.md, design.md, tasks.md}`。`request.md`・`test-cases.md` は含まれない。✅

**Requirement: spec-review SHALL route fixable tasks.md findings to spec-fixer regardless of severity**

- *Scenario: medium fixable finding on tasks.md yields needs-fix*
  — `spec-fixer-tasks-md-writable.test.ts` TC-003 および `spec-review-fixer-routing.test.ts` TC-013 第一 sub-test: `deriveSpecReviewVerdict` が `needs-fix` を返すことを確認。✅
- *Scenario: spec-review needs-fix reaches spec-fixer in the transition table*
  — TC-001 第二 sub-test (`STANDARD_TRANSITIONS` row `spec-review + needs-fix → spec-fixer`) が green。✅

**Requirement: spec-review SHALL keep escalating fixable findings on canon files spec-fixer cannot write**

- *Scenario: fixable finding on test-cases.md escalates with reason*
  — TC-013 第三 sub-test: `deriveStepCompletion` が `escalation` を返し、`escalationReason` に `CANON_FINDING_ESCALATION` と `test-cases.md` が含まれる。✅
- *Scenario: fixable finding on request.md escalates with reason*
  — `spec-review-fixer-routing.test.ts` TC-003 および `spec-fixer-tasks-md-writable.test.ts` TC-006: `request.md` で `escalation` かつ `CANON_FINDING_ESCALATION` を確認。✅

**Requirement: conformance routing SHALL follow the expanded write-set**

- *Scenario: conformance tasks.md finding with fixTarget spec-fixer → needs-fix:spec-fixer*
  — `judge-verdict-canon.test.ts` TC-006 第二 sub-test: `deriveConformanceVerdict(tasks.md, fixTarget:spec-fixer)` が `needs-fix:spec-fixer` を返す。✅
- *Scenario: conformance tasks.md finding with fixTarget code-fixer → escalation*
  — TC-006 第一 sub-test: `deriveConformanceVerdict(tasks.md, fixTarget:code-fixer)` が `escalation` を返す。✅

**Requirement: write-set declaration SHALL remain drift-guarded**

- *Scenario: drift-guard confirms spec-fixer writes() equals its D5 map entry*
  — `canon-write-scope.test.ts` TC-029 第三 sub-test タイトルが `{spec.md, design.md, tasks.md}` に更新済み。動的アサーション（`writes() ∩ protectedCanonPaths == D5 map entry`）は自動で green。✅

**Requirement: spec-fixer prompt SHALL name tasks.md as a fixable target**

- *Scenario: conformance-entry message names tasks.md*
  — `src/core/step/spec-fixer.ts` line 136: "fix the spec.md, design.md, or tasks.md artifact as indicated by the rationale"。✅
- *Scenario: system prompt write-set names tasks.md*
  — `src/prompts/spec-fixer-system.ts` lines 20–24: Contract セクションが `spec.md / design.md / tasks.md` を修正対象・write-set として列挙。✅

### J2: 実装が設計判断と矛盾しないか

- **D1（write-set 拡張のみ・verdict ロジック編集なし）**: `deriveSpecReviewVerdict`・`conformanceEffectiveFixer`・遷移テーブルは無変更。`writes()`・D5 map・drift-guard タイトル・prompt のみ更新。✅
- **D2（4 同期点の同時更新）**: `spec-fixer.ts` `writes()` / `canon-write-scope.ts` D5 map / TC-029 タイトル / conformance entry メッセージ + system prompt の計 4 点が 1 変更で更新済み。✅
- **D3（conformance path はデータ駆動で追随）**: `judge-verdict-canon.test.ts` TC-006 第二 sub-test を `escalation` → `needs-fix:spec-fixer` に移行済み。FAST プロファイルの副作用（reason-less halt）は design.md D3 に文書化。✅
- **D4（専用 fixer 新設なし）**: 新 step・fixer・ループの追加なし。✅
- **D5（境界テストを弱めずテスト移行）**: `implementation-notes.md` に全移行テストを列挙。`request.md`・`test-cases.md` の境界テストは保存・強化済み。✅
- **追加変更**: `src/prompts/rules.ts` の `spec-fixer` 行を `{spec.md, design.md, tasks.md}` に更新。D2 と整合しており、全 agent session に注入される rules.md の表現を最新化する変更。✅

### J3: request.md の受け入れ基準をすべて満たしているか

| 受け入れ基準 | 証拠 | 状態 |
|---|---|---|
| tasks.md severity medium fixable → spec-review verdict needs-fix かつ遷移表で spec-fixer に到達 | TC-003 (spec-fixer-tasks-md-writable.test.ts)、TC-013 第一 sub-test (spec-review-fixer-routing.test.ts)、TC-001 遷移テーブル sub-test | ✅ |
| request.md / test-cases.md fixable → escalation（escalationReason 設定つき） | TC-005/TC-006 (spec-fixer-tasks-md-writable.test.ts)、TC-003/TC-013 第三 sub-test (spec-review-fixer-routing.test.ts) | ✅ |
| TC-029 drift-guard が writes() / D5 map / 期待値の同期を検証したまま green | `canon-write-scope.test.ts` TC-029: writes() と D5 map を同時更新したため自動で green | ✅ |
| spec-fixer の prompt（conformance entry / normal entry）が tasks.md を修正対象に含む | `spec-fixer.ts` line 136（conformance entry 用メッセージ）、`spec-fixer-system.ts` write-set（system prompt = 全 entry 共通） | ✅ |
| 期待値を更新した既存テストが implementation-notes に列挙 | `implementation-notes.md` に 4 テストファイル・全移行箇所を記載 | ✅ |
| `typecheck && test` が green | verification-result.md: 全 5 フェーズ passed、9476 テスト passed、638 test file green | ✅ |

### J4: テスト衛生・リグレッション安全性

**移行済みテスト（新仕様に合わせて期待値変更）:**
- `spec-review-fixer-routing.test.ts`: `makeCanonScope()` に `TASKS_MD` を追加、TC-013 第一 sub-test を `"escalation"` → `"needs-fix"` に変更、test-cases.md の新 sub-test（`escalationReason` 付き）を追加。
- `canon-write-scope.test.ts`: TC-019 を `tasks.md` 除外アサーションから包含アサーションに置換、TC-029 タイトルを更新。
- `judge-verdict-canon.test.ts`: `makeFullCanonScope()` を更新、TC-006 第二 sub-test を `"escalation"` → `"needs-fix:spec-fixer"` に変更。
- `step-io-contracts.test.ts`: SpecFixerStep writes() テストに `tasks.md` の存在アサーションを追加。

**保存済み境界テスト（期待値変更なし）:**
- TC-003（`request.md` → escalation）、TC-004（coexistence では escalation 優先）、TC-017（`code-fixer ∅`）、TC-018（`implementer {tasks.md}`）はすべて変更なし。
- `judge-verdict-canon.test.ts` TC-006 第一 sub-test（`tasks.md + fixTarget:code-fixer → escalation`）は保存・green。

**リグレッション証拠:** verification-result.md: test フェーズ passed（9476 passed、1 skipped、638 test files green）。

**軽微な非ブロッキング注記:** `spec-review-fixer-routing.test.ts` ファイル先頭の frozen TC list コメント（line 21）に `TC-013: deriveSpecReviewVerdict — fixable finding on tasks.md escalates` と旧記述が残っている。`describe()` タイトル（line 923）は "routes to spec-fixer" と正しく更新済み。挙動テストは正確であり、非ブロッキング。

## 検証できなかった項目

None — 全 4 判断項目を実装・テスト・prompt の直接確認で網羅した。

## Findings 詳細

指摘なし。
