# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Meta

- **slug**: prompt-rules-consistency
- **iteration**: 1
- **spec**: SPEC-EXEMPT (chore — normative Requirement / Scenario なし)
- **normative gates**: request.md 受け入れ基準 AC-1〜AC-7

---

## 検証した項目

### AC-1: implementer system prompt に 4 層 authority 表現が含まれ、「唯一のインプット」が含まれない

- **実装**: `src/prompts/implementer-system.ts` lines 20–24
  `**入力（4 層）**:` ブロックに `request.md / spec.md — 依頼意図の正典（normative）`、`test-cases.md — レビュー済みの検証契約`、`tasks.md — 実装の作業計画`、`design.md — 設計根拠・文脈（read-only）` が揃っている。
- **「唯一のインプット」撤去**: ファイル中に当該文言が存在しないことを実コードリードで確認。
- **テスト固定**: TC-029（3 アサーション）、TC-030（1 アサーション）が drift-guard に追加されており全 pass。
- **判定**: ✅ 合格

### AC-2: commit message への test_cases_skipped 指示が含まれず、完了報告への記録指示が含まれる

- **実装**: `src/prompts/implementer-system.ts` line 61
  `完了報告（completion report）に \`test_cases_skipped: [TC-ID — 理由]\` の形式で明示的に記録する。`
- **「commit message に \`test_cases_skipped」**: ファイル中に存在しない。
- **テスト固定**: TC-031（not.toContain）、TC-032（toContain）が drift-guard に追加されており全 pass。
- **判定**: ✅ 合格

### AC-3: rules 出力に verification 失敗 → implementer continuation の例外記述が含まれる

- **実装**: `src/prompts/rules.ts` lines 23–24
  - 原則: 各 step は独立した新規 session（前の session の文脈を持たない）として実行される。
  - 例外: verification 失敗後の implementer 再入は、直前の implementer session の continuation として実行される（session が無い場合は fresh session に fallback）。
- **テスト固定**: TC-033（3 アサーション: `verification 失敗後の implementer 再入` / `continuation` / `fresh session に fallback`）が drift-guard に追加されており全 pass。
- **判定**: ✅ 合格

### AC-4: PIPELINE_MAP に bite-evidence 行が存在し、conformance 行に normative/plan 二層記述が含まれる

- **実装**: `src/prompts/pipeline-map.ts`
  - line 18: `| bite-evidence | Evidence Base（job 開始時点の実装 + candidate のテスト）上で red→green を機械実行し、テストが変更に噛むことを証明する（CLI step） |`
  - line 24: `| conformance | request / spec を規範（normative）、design / tasks を計画（plan）として適合性を検証する |`
  - データ行数: 15（`bite-evidence` 追加前は 14）。
- **位置順序**: `implementer`(line 17) → `bite-evidence`(line 18) → `verification`(line 19)。設計上の `implementer → bite-evidence → verification` と一致。
- **テスト固定**:
  - TC-018: `EXPECTED_STEPS` に `"bite-evidence"` 追加、`toBe(15)` に更新、describe description を "全 15 step" に更新。
  - TC-034（3 アサーション: bite-evidence 存在 / 順序 / Evidence Base 文言）。
  - TC-035（3 アサーション: normative 含む / plan 含む / 4 成果物 不含）。
  - 全 pass。
- **判定**: ✅ 合格

### AC-5: stateStep="test-materialize"/"build-fixer"、resumePoint=null、--from なしの resume が implementer に解決される

- **実装**: `src/core/resume/resolve-step.ts` lines 132–144（path 4 ブロック）
  `allowed.has(stateStep)` の前段で `LEGACY_STEP_ALIASES[stateStep]` を引き、`mapMemberToCoordinator` を通してから `allowed.has(resolvedStateStep)` で判定するよう変更済み。`allowed.has()` ガードは維持（alias 解決後に許可集合外なら throw に至る）。
- **テスト固定**: `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts` に TC-012、TC-013 を追加。
  - TC-012: `resolveResumeStep(undefined, null, "test-materialize")` → `"implementer"` かつ不投げ。
  - TC-013: `resolveResumeStep(undefined, null, "build-fixer")` → `"implementer"` かつ不投げ。
  - 全 pass。
- **判定**: ✅ 合格

### AC-6: 既存テストは列挙した更新対象を除き無改変で green

- `src/prompts/__tests__/tc-source-contract.test.ts`: diff なし（無改変）。
- `src/core/resume/__tests__/resolve-step.test.ts` / `tests/unit/core/resume/resolve-step.test.ts`: diff なし（無改変）。
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`: TC-018 の行数・`EXPECTED_STEPS`・describe description の更新（design 列挙済み更新対象）のみ。TC-001〜TC-028 のアサーション本体は無改変。
- テスト全体: 774 test files / 11,404 tests pass（1 skipped / 2 todo）。
- **判定**: ✅ 合格

### AC-7: `typecheck && test` が green

- `bun run typecheck`: exit 0（stdout 出力なし）。
- `bun run test`: 774 test files passed, 11,404 tests passed。
- **判定**: ✅ 合格

---

## 検証できなかった項目

None。

---

## Findings 詳細

None。指摘なし。
