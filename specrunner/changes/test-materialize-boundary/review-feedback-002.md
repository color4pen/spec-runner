# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `tests/unit/step/test-materialize-boundary.test.ts` | **TC-001 must 受け入れ基準のテストが欠落**: "test-case-gen 境界で test-cases.md の hash が branch-borne に記録される" ことをテストで固定するという must 基準（AC-1）が未実装。`tasks.md` T-07 freeze ブロックは `[x]` になっているが対応するテストが存在しない。既存の `executor.commit.test.ts` TC-001 は lineage 経路を検証するが、mock runtime（hash:null）を使用しており sha256 非 null・step:test-case-gen・test-cases.md path のアサーションを持たない。 | `test-materialize-boundary.test.ts`（または `executor.commit.test.ts`）に新規 describe を追加する。セットアップ: 実際の `test-cases.md` ファイルを temp dir に書き込み、`digestArtifacts` が実 sha256 を返す runtime（または sha256:xxxx を返す stub）を使って `TestCaseGenStep` 相当のステップを executor で実行する。アサーション: `events.jsonl` を読み parse して `step:"test-case-gen"`、`outputs[*].path.endsWith("test-cases.md")`、`outputs[*].hash` が `/^sha256:/` にマッチすることを確認する。 | yes |
| 2 | low | testing | `tests/prompts/test-case-gen-system.test.ts` | **TC-025（should）: freeze note が未テスト**: `test-case-gen-system.ts` L160-161 に追加された「TC IDs assigned here are frozen scenario IDs — subsequent nodes must NOT renumber or reassign them」の記述が prompt テストで明示的に確認されていない。設計 D2 の核心だが TC-007 の keyword チェックには含まれていない。 | 既存の `test-case-gen-system.test.ts` に 1 アサーションを追加: `expect(TEST_CASE_GEN_SYSTEM_PROMPT).toMatch(/frozen scenario IDs\|must NOT renumber\|再採番/i)` 相当のチェックを足す。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.70

## Summary

実装は設計通り組まれており品質は高い。515 test files / 7112 tests が全 green。新規追加の `TestMaterializeStep`・`evaluateTestCoverage` リファクタ・`test-coverage` output contract・implementer 分岐・pipeline 配線・FAST 保存・needs-fix ループ制御、いずれも設計仕様（Option A）に合致している。

唯一のブロッキング問題は **must 受け入れ基準 AC-1 のテスト欠落**（finding #1）。scenario freeze の実体である「test-case-gen 境界での test-cases.md sha256 hash 記録」をテストで lock する意図が tasks.md T-07 に明示されているが、該当テストが存在しない。コード実装は正しいため fix は局所的（テスト追加のみ）。

### 各 must AC の確認状況

| AC | 確認 |
|----|------|
| test-cases.md hash が events.jsonl に記録される（テスト固定） | ❌ テスト欠落（finding #1） |
| SPEC_REVIEW→TEST_CASE_GEN→TEST_MATERIALIZE→IMPLEMENTER→VERIFICATION 遷移順 | ✅ |
| test-materialize 後に test あり・実装なし commit（git tree 検証） | ✅ TC-F1 |
| implementer は test を書かず実装のみ・TC-ID grep 成立 | ✅ TC-TMB-05〜08 |
| verification/code-review/conformance needs-fix が implementer に戻る | ✅ TC-TMB-18 |
| 既存挙動保存テスト無変更 green | ✅ 7112 tests passed |
| typecheck && test green | ✅ verification-result.md 全 phase passed |

### 観察事項

- **assertion check はファイルレベル**: `evaluateTestCoverage` の assertion 確認は「TC ID を含むファイルにどこかで `expect(` が存在するか」であり、同一テストブロック内での局所確認ではない。設計 D3 で意図された軽量 grep であり現フェーズの許容範囲内。
- **testsMaterialized=true 時の implementer message に spec.md 明示なし**: `reads()` に `spec.md` は含まれるため agent はアクセス可能。実害なし。

