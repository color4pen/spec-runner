# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. implementer authority 表現の矛盾（要件 1・2）

**`src/prompts/implementer-system.ts:21`**
- verified: `specrunner/changes/<slug>/tasks.md` — 正典（実装の唯一のインプット）` が line 21 に存在する
- verified: line 22 に `spec.md / design.md / test-cases.md — 参照情報（read-only）` が存在し、spec/test-cases を副次扱いにしている

**`src/core/step/implementer.ts:86`**
- verified: `test-cases.md と spec を canon(正)として、テストと実装の両方を整合させてください。` が line 86 に存在する
- verified: system prompt は tasks.md を唯一正典とし、initial message は test-cases.md / spec を canon とする — 内部矛盾を確認

**`src/prompts/conformance-system.ts`**
- verified: conformance は既に二層化済み（`request.md / spec.md` = normative、`design.md / tasks.md` = plan/rationale）
- git log にて #992「conformance の正典に格差を付ける」が 2026-08-14 commit 済みを確認

### 2. test_cases_skipped の実行不能指示（要件 2）

**`src/prompts/implementer-system.ts:59`**
- verified: `commit message に \`test_cases_skipped: [TC-ID — 理由]\` の形式で明示的に記録する` が line 59 に存在する

**`src/prompts/fragments.ts:16-19`**
- verified: COMMIT_DISCIPLINE に `git add / git commit / git push の実行は禁止です` が存在する
- verified: `commit message format が pipeline 規定 (<step>: <slug>) から外れて` と executor が一括 commit する旨が記載されている
- 矛盾: agent には commit 禁止、かつ executor の commit format は固定 (`<step>: <slug>`) — `test_cases_skipped` を commit message に橋渡しする機構は存在しない ✅

### 3. rules の session 独立性の断言（要件 3）

**`src/prompts/rules.ts`（RULES_MD_CONTENT 内）**
- verified: `各 step は独立した agent session として実行される。前の session の文脈を持たない（各 step は新規セッションで実行される）。` が存在する（テンプレート文字列 line 23 相当）

**`src/core/step/implementer.ts`**
- verified: `verificationFailedLast(state)` 判定後、`getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) !== null` のとき `buildImplementerRecoveryMessage` を使い continuation 経路があることを確認
- 矛盾: rules.ts は "常に新規 session" と断言するが、implementer には continuation 経路が存在する ✅（#998 absorb-build-fixer 導入済み）

### 4. PIPELINE_MAP の drift（要件 4）

**`src/prompts/pipeline-map.ts`**
- verified: テーブル 14 行（request-review / design / spec-review / spec-fixer / test-case-gen / implementer / verification / code-review / code-fixer / custom-reviewer / regression-gate / conformance / adr-gen / pr-create）
- verified: `bite-evidence` 行が存在しない
- verified: conformance 行が `4 成果物（request / design / tasks / spec）への適合性を検証する` のまま（二層化前）

**`src/kernel/step-names.ts`**
- verified: `CLI_STEP_NAMES` に `"bite-evidence"` が存在する（verification / bite-evidence / pr-create）
- verified: `STEP_NAMES.BITE_EVIDENCE = "bite-evidence"` が存在する

**pipeline test**
- verified: `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` の TC-026 に `implementer → bite-evidence → verification` のパイプライン配線テストが存在する

**実行順における bite-evidence の位置**: implementer の後、verification の前

**implementer 行**
- verified: `verification 失敗時は再入して修正する` が既に含まれており、#999 で更新済み ✅

### 5. stateStep への legacy alias 未適用（要件 5）

**`src/core/resume/resolve-step.ts`**
- verified: `LEGACY_STEP_ALIASES` は path 1（`from`、line 101）と path 3（`resumePoint.step`、line 121）に適用される
- verified: path 4（`stateStep`、line 132）では `LEGACY_STEP_ALIASES` を通さず `allowed.has(stateStep)` を直接判定する
- verified: `stateStep = "test-materialize"` または `"build-fixer"` かつ `resumePoint = null`・`--from` なしの場合、`allowed.has()` 不成立で throw に至ることを確認

### 6. 既存テストのピン確認

**`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`**
- verified: TC-003・TC-009 はともに `toContain(PIPELINE_MAP)` による参照埋め込みで、PIPELINE_MAP の内容変化に自動追随する
- verified: 「唯一のインプット」「test_cases_skipped」「前の session の文脈を持たない」を個別にピンするテストは存在しない

**TC-018（prompt-skeleton-drift-guard.test.ts）**
- verified: `expect(rows.length).toBe(14)` が現在の行数をピンしている
- bite-evidence 追加後は 15 行になるため、TC-018 の更新（EXPECTED_STEPS への追加 + 行数 14→15）が必要
- これは受け入れ基準「PIPELINE_MAP に bite-evidence 行が存在し...ことをテストで固定する」の範囲内（更新対象として明示的に含まれる）

**`src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts`**
- verified: --from path（TC-009）と resumePoint path（TC-010）の alias テストが存在する
- verified: stateStep path（path 4）の `"test-materialize"` / `"build-fixer"` ケースのテストが存在しない
  → 要件 5 の受け入れ基準「state.step = "test-materialize" / "build-fixer"、resumePoint = null、--from なしの resume が implementer に解決されることをテストで固定する」は新規テストが必要

## 検証できなかった項目

None — 全 code assertion を直接確認済み。

## Findings 詳細

None（blocking findings なし）。

- 全 5 要件のコード前提が実測で確認された
- 要件の記述は正確で、スコープ外明示も適切
- 受け入れ基準は検証可能で、TC-018 の更新（14→15）は更新対象として暗黙的に含まれており、問題ない
