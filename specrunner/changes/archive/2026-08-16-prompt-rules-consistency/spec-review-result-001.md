# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. 背景の矛盾箇所 — 実コードとの照合

| 主張 | 確認ファイル・行 | 結果 |
|------|----------------|------|
| `implementer-system.ts:21` に「唯一のインプット」が含まれる | `src/prompts/implementer-system.ts:21` | ✅ `tasks.md — 正典（実装の唯一のインプット）` を確認 |
| `implementer-system.ts:59` に commit message への `test_cases_skipped` 指示が含まれる | 同 :59 | ✅ `commit message に \`test_cases_skipped: [TC-ID — 理由]\`` を確認 |
| `implementer.ts:86` の initial message が `test-cases.md と spec を canon(正)として` | `src/core/step/implementer.ts:86` | ✅ 確認 |
| COMMIT_DISCIPLINE が agent の `git commit` を禁止 | `src/prompts/fragments.ts:16-26` | ✅ 確認。executor commit format は `<step>: <slug>` 固定と明記 |
| `rules.ts:23` が「前の session の文脈を持たない」と断言 | `src/prompts/rules.ts:23` | ✅ 確認 |
| `pipeline-map.ts` が 14 行で bite-evidence 行が欠落 | `src/prompts/pipeline-map.ts` | ✅ 14 行、bite-evidence なし、conformance 行は「4 成果物（request / design / tasks / spec）への適合性を検証する」 |
| `resolve-step.ts:132` の stateStep が LEGACY_STEP_ALIASES を通さない | `src/core/resume/resolve-step.ts:132` | ✅ `allowed.has(stateStep)` の直接判定を確認、alias 適用なし |

### 2. bite-evidence の pipeline wiring 確認

- `src/kernel/step-names.ts:30-34` — `CLI_STEP_NAMES` に `"bite-evidence"` が含まれる ✅
- `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` — `implementer → bite-evidence → verification` の wiring が STANDARD_TRANSITIONS で確認済み ✅
- `LEGACY_STEP_ALIASES` — path 1 (`from`) と path 3 (`resumePoint.step`) には適用済み、path 4 (`stateStep`) にのみ未適用 ✅

### 3. 設計（design.md）の要件対応

| 要件 | 対応 Decision | 結果 |
|------|-------------|------|
| 要件 1: authority 表現統一 | D1 (implementer system prompt 4層化) | ✅ request.md/spec.md → normative、test-cases.md → 検証契約、tasks.md → 作業計画、design.md → read-only |
| 要件 2: test_cases_skipped 実行可能化 | D2 (記録先を completion report に変更) | ✅ COMMIT_DISCIPLINE との矛盾を解消。書式（`test_cases_skipped: [TC-ID — 理由]`）は保持 |
| 要件 3: rules の session 記述更新 | D3 (原則 + 例外構造に更新) | ✅ continuation 経路（`verificationFailedLast + getPreviousSessionId`）が実装済みであることを `implementer.ts:273-300` で確認 |
| 要件 4: PIPELINE_MAP 追随 | D4 (bite-evidence 行追加) + D5 (conformance 行更新) | ✅ 追加位置（implementer と verification の間）は pipeline wiring と一致 |
| 要件 5: stateStep への legacy alias 適用 | D6 (path 4 に alias → coordinator 写像 → allowed 判定) | ✅ path 1/3 と同じ「alias → mapMemberToCoordinator → allowed.has()」の順序で対称性あり |

### 4. タスク分解の網羅性

| 受け入れ基準 | タスク | テスト |
|------------|-------|-------|
| AC-1: 4層 authority、「唯一のインプット」削除 | T-01 | TC-029, TC-030 |
| AC-2: commit message でなく completion report に test_cases_skipped | T-01 | TC-031, TC-032 |
| AC-3: rules に verification continuation 例外記述 | T-02 | TC-033 |
| AC-4: PIPELINE_MAP bite-evidence 行、conformance normative 記述 | T-03 | TC-018 更新, TC-034, TC-035 |
| AC-5: stateStep path-4 alias → implementer に解決 | T-04 | TC-012, TC-013 |
| AC-6: 既存テスト無改変 green | T-05 全体 | 更新対象は TC-018 のみ（enumerated） |
| AC-7: typecheck && test green | 実装完了チェックリスト | — |

### 5. 既存テストへの影響確認

- `prompt-skeleton-drift-guard.test.ts` — TC-018 の `EXPECTED_STEPS` と `toBe(14)` が enumerated update target として T-05-a に明示されている ✅
- TC-018 の `"PIPELINE_MAP does not contain build-fixer"` / `"test-materialize"` は bite-evidence 追加後も通過する（新規行は bite-evidence） ✅
- `resolve-step-test-materialize-alias.test.ts` — TC-009/010/011 は path 1/3 のみをテスト。TC-012/013 の追加は path 4 のみを対象とし干渉なし ✅

### 6. 正確性（correctness）の確認

- D6 の path-4 変更後も `allowed.has(resolvedStateStep)` ガードが維持される設計 — alias 解決後に許可集合外の値は引き続き `throw` に至る ✅
- `resolveResumeStep(undefined, null, "test-materialize")` は現行で `allowed.has("test-materialize")` が false のため throw する（"test-materialize" は `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` から除外済み）。D6 の修正でこれが `"implementer"` に解決される ✅
- D3 の rules 更新文言（「CLI が…として実行する」事実の説明）は agent への continuation 強制にはならない ✅

---

## 検証できなかった項目

- `bun run typecheck && bun run test` の実行結果（実装前のため、実行不可）
- 実装後の IMPLEMENTER_SYSTEM_PROMPT の実際の文字列（T-01 変更前のため）

---

## Findings 詳細

None
