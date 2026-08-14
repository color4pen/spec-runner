# Conformance Result — test-case-gen-design-phase (Iteration 2)

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

### Spec Presence Check

spec.md 存在確認: 6 Requirement / 17 Scenario、全 normative keyword (SHALL/MUST) 確認済み。

### Request Acceptance Criteria (12 項目)

| AC | 検証内容 | 結果 |
|----|---------|------|
| AC1 | 通常 type: design→test-case-gen→spec-review→test-materialize のテスト固定 | OK (TC-001/002/003) |
| AC2 | needs-fix ループ: spec-fixer→test-case-gen→spec-review のテスト固定 | OK (TC-006/007) |
| AC3 | 観察 pass 後に spec-review が再実行されないこと（stop gate）のテスト固定 | OK (TC-010/011) |
| AC4 | 免除 type が design→spec-review 直行・test-case-gen を通らないことのテスト固定 | OK (TC-004/005) |
| AC5 | spec-review の入力に test-cases.md が含まれることのテスト固定 | OK (TC-012/013) |
| AC6 | spec-review prompt に TC 照合観点 3 点のテスト固定 | OK (TC-014) |
| AC7 | test-case-gen prompt に振る舞いレベル記述指示のテスト固定 | OK (TC-015) |
| AC8 | spec-review の test-cases.md fixable finding が escalation にならず TC 再生成経路に乗るテスト固定 | OK (TC-017/018) |
| AC9 | TC のみの needs-fix で spec-fixer を経由せず test-case-gen→spec-review のテスト固定 | OK (TC-008) |
| AC10 | spec-review 承認後の test-cases.md finding が operator 保護されるテスト固定 | OK (TC-019) |
| AC11 | design で遷移表 pin テスト更新対象を全列挙し根拠明示、列挙外は無変更 green | OK (design.md §遷移表 pin テスト) |
| AC12 | `typecheck && test` が green | OK (765 test files / 11516 tests) |

### Spec Requirement ごとの実装確認

**Requirement: 通常 type は test-case-gen を spec-review の前に実行する**

`src/core/pipeline/types.ts` STANDARD_TRANSITIONS (length=52):
- `DESIGN success → TEST_CASE_GEN` (unconditional、guarded exempt row の後): 行 254 確認
- `TEST_CASE_GEN success → SPEC_REVIEW`: 行 266 確認
- `SPEC_REVIEW approved → TEST_MATERIALIZE` (unconditional): 行 261 確認
- `SPEC_REVIEW approved → TEST_CASE_GEN` の unconditional row: 存在しないことを確認（旧遷移削除）

**Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する**

- `DESIGN success → SPEC_REVIEW when isTestGenExempt`（guarded、unconditional TEST_CASE_GEN row に先行）: 行 253 確認
- TC-004: `isTestGenExempt` が chore type で true / spec-change で false を返すことを直接検証
- TC-005 integration test: chore type pipeline で testCaseGenCallCount=0 を確認

**Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする**

- `SPEC_FIXER approved → TEST_CASE_GEN when specFixerNeedsFixForward`: 行 275 確認
- `specFixerNeedsFixForward` (spec-observation.ts): getConformanceFixContext=null かつ最新 spec-review verdict=needs-fix で true
- TC-006: needs-fix 状態で true、observation pass（approved）状態で false を確認

**Requirement: TC のみの needs-fix は spec-fixer を経由せず test-case-gen を再生成する**

- `SPEC_REVIEW needs-fix → TEST_CASE_GEN when specReviewNeedsFixIsTcOnly`（guarded、unconditional SPEC_FIXER row に先行）: 行 263 確認
- `specReviewNeedsFixIsTcOnly` ロジック (spec-observation.ts):
  - tcRoutable ≥ 1 AND specRoutable = 0 AND nonCanonCriticalHigh = 0 → true
- TC-028: medium/low severity でも spec routable が 1 件あれば false（severity 問わず spec routable で TC-only にならない）

**Requirement: 観察 pass の意味論を維持する**

- `SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward`（旧 specFixerForwardsToTestGen をリネーム）: 行 273 確認
- forward 先が test-materialize（test-case-gen でも spec-review でもない）
- TC-010: 観察 pass 後に spec-review に戻らず test-materialize へ進むことを確認
- TC-011 integration: 観察 pass 後に spec-review run が 1 回のみであることを確認

**Requirement: spec-review は test-cases.md を照合対象に含める**

- `spec-review.ts` reads(): `isTestGenRequired(state.request.type)` が真のとき `<folder>/test-cases.md` を追加（行 85-87）
- 免除 type では追加しない（test-cases.md が存在しない）
- `SPEC_REVIEW_SYSTEM_PROMPT` Contract 入力に test-cases.md を記載、Method Step 5 に TC照合 3 観点を追加:
  - (a) TC カバレッジ: spec.md の全 Scenario が 1 件以上の TC に対応しているか
  - (b) TC 記述水準: TC が実装 API / 内部詳細ではなく振る舞いレベルで記述されているか
  - (c) TC と tasks.md の整合: tasks.md の受け入れ基準と TC の期待結果に矛盾がないか
- initial message template: "test-cases.md" を "Review all spec files" に含む

**Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない**

- `TEST_CASE_GEN_SYSTEM_PROMPT` write-set に以下を追加（test-case-gen-system.ts 行 34-35）:
  - 「振る舞いレベルで記述する: 実装 API・内部クラス名・関数名などの実装詳細を TC に含めない」
  - 「tasks.md と TC の不整合は申し送り注記として記録し、最終判断は spec-review に委ねる」
- `TestCaseGenStep.writes()` は `test-cases.md` のみ（tasks.md を含まない）: 行 77-81 確認
- pipeline 位置コメント doc を `design → test-case-gen → spec-review` に更新済み: 行 41

**Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する**

- `FixTarget` union に `"test-case-gen"` 追加（`src/kernel/report-result.ts` 行 22）
- `writableByFixer` に `["test-case-gen", {test-cases.md}]` 追加（`canon-write-scope.ts` 行 45）
- `testCaseGenEffectiveFixer` を追加・export（`canon-escalation.ts` 行 63）
- `deriveSpecReviewVerdict` の優先順位（D3-4、judge-verdict.ts）:
  - 4a: fixable canon findings が spec-fixer / test-case-gen 両方で unroutable → escalation（request.md、attestation）
  - 4b: TC-routable ≥ 1（任意 severity）→ needs-fix（escalation ではない）
  - 4c: spec-fixer-routable critical|high → needs-fix
- `test-case-gen.ts buildMessage` (行 88-97): 最新 spec-review の TC finding があれば findingsBlock を注入
- **承認後の保護は無変更**:
  - `deriveConformanceVerdict`: conformanceEffectiveFixer（fixTarget ?? implementer）使用 → implementer は test-cases.md を書けない → unroutable → escalation
  - `deriveJudgeVerdict`/`deriveRegressionGateVerdict`: judgeEffectiveFixer（code-fixer）使用 → code-fixer writable=∅ → unroutable → escalation
- request.md finding: spec-fixer も test-case-gen も書けない → 4a で escalation（TC-020 相当の期待が満たされている）

### Design 決定事項（D1〜D7）の追随確認

| 決定 | 内容 | 実装確認 |
|------|------|---------|
| D1 | 遷移組み替え（通常経路 design→test-case-gen→spec-review→test-materialize）| STANDARD_TRANSITIONS 52 行 |
| D2 | specFixerObservationForward（リネーム）、specFixerNeedsFixForward（新規）| spec-observation.ts |
| D3 | FixTarget 拡張、writableByFixer 拡張、testCaseGenEffectiveFixer 追加、deriveSpecReviewVerdict 4a/4b/4c | judge-verdict.ts, canon-write-scope.ts, canon-escalation.ts |
| D4 | specReviewNeedsFixIsTcOnly: TC-only guard | spec-observation.ts |
| D5 | test-case-gen buildMessage に TC finding 注入 | test-case-gen.ts |
| D6 | spec-review reads() 条件付き test-cases.md 追加、prompt TC 照合観点 3 点 | spec-review.ts, spec-review-system.ts |
| D7 | test-case-gen prompt の振る舞いレベル化・責務固定 | test-case-gen-system.ts |

### 遷移表 pin テスト更新の全列挙確認（AC11）

design.md §「遷移表 pin テスト — 更新対象の全列挙」に 11 件（更新必須）+ 3 件（再検証必須）+ 無変更 green 4 件を根拠付きで列挙済み。
`bun run test` 結果: 765 test files passed / 11516 tests passed / 1 skipped。列挙外テストは無変更で green。

### typecheck && test (AC12)

- `bun run typecheck` (tsc --noEmit): exit 0（green）
- `bun run test` (vitest): 765 test files, 11516 passed, 1 skipped（green）

## 検証できなかった項目

- in-flight job（awaiting-resume 中）での遷移表更新後の resume 挙動: production 環境での確認が必要（設計上は design.md §Migration Plan で言及されており回帰影響なしと評価されている）

## Findings 詳細

None — 全 normative 要件（request.md AC 12 項目 + spec.md 6 Requirement / 17 Scenario）が実装済みでテストで固定されている。
