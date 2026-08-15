# Test Cases: test-materialize step の廃止 — テスト実体化を implementer に統合する

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 21, should: 4, could: 0

---

## パイプライン遷移

### TC-001: 非免除 type は spec-review 承認から implementer へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 非免除 type は spec-review 承認から implementer へ直行する

### TC-002: 免除 type も spec-review 承認から implementer へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 免除 type も spec-review 承認から implementer へ直行する

### TC-003: 遷移表に test-materialize 行が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 遷移表に test-materialize 行が存在しない

### TC-004: spec-fixer の観測 auto-fix は implementer へ forward する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: spec-fixer の観測 auto-fix は implementer へ forward する

### TC-005: step 名定数と agent union に test-materialize が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `AGENT_STEP_NAMES`（kernel/step-names.ts）と `AgentStepName` union（kernel/agent-definition.ts）
**WHEN** それぞれの値を走査する
**THEN** いずれにも `"test-materialize"` が含まれない。`STEP_NAMES.TEST_MATERIALIZE` 定数が存在しない

### TC-006: test-materialize step 資産が production に存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** production ソースツリー（`src/**`）
**WHEN** `TestMaterializeStep` / `TEST_MATERIALIZE_SYSTEM_PROMPT` への import 参照、`STANDARD_DESCRIPTOR.steps`/`roles`、`PIPELINE_MAP`、rules 責任範囲表を検査する
**THEN** `test-materialize.ts` / `test-materialize-system.ts` が存在せず、registry・pipeline-map・rules に test-materialize エントリが無い

### TC-007: specFixerForwardsToImplementer 述語が export されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `src/core/pipeline/test-gen-exemption.ts` の export 一覧
**WHEN** module の名前付き export を確認する
**THEN** `specFixerForwardsToImplementer` が export されていない

---

## implementer 単一 mode

### TC-008: implementer prompt が全 must TC の実体化責務を明示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う > Scenario: implementer prompt が全 must TC の実体化責務を明示する

### TC-009: implementer message は test-materialize 実行歴に依存しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う > Scenario: implementer message は test-materialize 実行歴に依存しない

### TC-010: fast/exempt job で implementer が contract 違反を起こさない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** test-cases.md が存在しない fast / exempt job state
**WHEN** implementer の initial message を構築する
**THEN** 例外が発生せず、output contract 違反にならない（verification の test-coverage phase は skipped になる）

---

## file-set 同定 — Evidence Base ネイティブ

### TC-011: gate は test-materialize run 無しで red→green 判定に到達する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う > Scenario: gate は test-materialize run 無しで red→green 判定に到達する

### TC-012: archive floor は baseOid 無しで判定に到達する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う > Scenario: archive floor は baseOid 無しで判定に到達する

### TC-013: gate が EB diff から空選択のとき strategy-deferred を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-06

**GIVEN** forward type の job state で、`listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` がテストパターンに合致するファイルを返さない
**WHEN** bite-evidence gate を実行する
**THEN** gate は strategy-deferred を返す（baseOid 不在ではなく空選択による deferred）

### TC-014: listChangedFilesBetweenCommits が LocalRuntime に実装され path フィルタなしで動作する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `LocalRuntime` の `listChangedFilesBetweenCommits(baseOid, headOid, cwd)` 実装
**WHEN** 2 つの commit OID を渡す
**THEN** `git diff --name-only <baseOid> <headOid>` に相当する全変更ファイルを paths フィルタなしで返す。exit 0 → success、非 0 / spawn error → unavailable

---

## testDerivation — scenario 凍結

### TC-015: scenario 凍結が intact なら testDerivation は frozen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation は scenario 凍結として判定される > Scenario: scenario 凍結が intact なら testDerivation は frozen

### TC-016: scenario がすり替えられたら testDerivation は absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation は scenario 凍結として判定される > Scenario: scenario がすり替えられたら testDerivation は absent

### TC-017: STANDARD_PROFILE の testDerivation floor が frozen のまま

**Category**: unit
**Priority**: must
**Source**: design.md > D4

**GIVEN** `src/state/profile.ts` の `STANDARD_PROFILE`
**WHEN** `assurance.testDerivation` の値を確認する
**THEN** 値は `"frozen"` のまま変更されていない（`"coupled"` に下がっていない）

---

## resume 互換

### TC-018: --from test-materialize は implementer に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: --from test-materialize は implementer に解決される

### TC-019: resumePoint.step が test-materialize でも implementer に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: resumePoint.step が test-materialize でも implementer に解決される

### TC-020: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない

---

## exemption 縮退

### TC-021: 免除 type は test-case-gen と bite-evidence を通らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-gen 免除の制御対象は 2 箇所に縮退する > Scenario: 免除 type は test-case-gen と bite-evidence を通らない

---

## prompt / template 整合

### TC-022: prompt-skeleton-drift-guard が test-materialize 除去後カウントで pass する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` の定数配列と数値アサート
**WHEN** テストを実行する
**THEN** `ALL_AGENT_PROMPTS` が 12 本（14→13→12）、`PRODUCER_AND_FIXER_PROMPTS` が 6 本（7→6）、`PIPELINE_MAP` が 14 行、`EXPECTED_STEPS` / `PREVIOUSLY_MISSING_STEPS` に test-materialize が無い状態で全アサートが通る

### TC-023: tc-source-contract の consumer が implementer のみに縮退する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-10

**GIVEN** `src/prompts/__tests__/tc-source-contract.test.ts` の consumer 列挙
**WHEN** TC Source Contract の consumer 一覧を確認する
**THEN** consumer は `implementer` のみであり `test-materialize` が含まれない

---

## gate（機械検証）

### TC-024: typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11

`bun run typecheck`

### TC-025: test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11

`bun run test`

---

## Result

```yaml
result: completed
total: 25
automated: 23
manual: 0
must: 21
should: 4
could: 0
blocked_reasons: []
```
