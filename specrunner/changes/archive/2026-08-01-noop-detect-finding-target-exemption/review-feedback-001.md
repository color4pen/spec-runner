# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更ファイル

- `src/core/step/routed-findings.ts` (新規)
- `src/core/step/code-fixer.ts` (移設 + import 置換)
- `src/core/step/no-op-detect.ts` (params 追加)
- `src/core/step/executor.ts` (呼び出し側変更)
- `src/core/step/__tests__/executor-no-op.test.ts` (既存 + 新規 TC)
- `src/core/step/__tests__/no-op-detect-exemption.test.ts` (新規)
- `src/core/step/__tests__/routed-findings.test.ts` (新規)

### Must TC 照合（test-cases.md）

| TC | Priority | ファイル | 結果 |
|----|----------|---------|------|
| TC-001 | must | executor-no-op.test.ts "TC-001" | ✅ |
| TC-002 | must | executor-no-op.test.ts "TC-002" | ✅ |
| TC-003 | must | executor-no-op.test.ts "TC-003" | ✅ |
| TC-004 | must | executor-no-op.test.ts "TC-004" | ✅ |
| TC-006 | must | executor-no-op.test.ts "TC-006" | ✅ |
| TC-007 | must | executor-no-op.test.ts "TC-007" | ✅ |
| TC-008 | must | executor-no-op.test.ts "TC-008" | ✅ |
| TC-009 | must | executor-no-op.test.ts "TC-009" | ✅ |
| TC-010 | must | executor-no-op.test.ts "TC-010" | ✅ |
| TC-011 | must | no-op-detect-exemption.test.ts | ✅ |
| TC-015 | must | verification-result.md: typecheck passed | ✅ |
| TC-016 | must | verification-result.md: 676 files / 10036 tests passed | ✅ |

Should TC:

| TC | Priority | ファイル | 結果 |
|----|----------|---------|------|
| TC-005 | should | routed-findings.test.ts "TC-005" | ✅ |
| TC-012 | should | executor-no-op.test.ts "TC-012" | ✅ |
| TC-013 | should/manual | 既存 code-fixer テスト全件 green（verification 確認） | ✅ |
| TC-014 | should/manual | ARTIFACT_PREFIXES・pipelineManagedPaths 定義確認（下記） | ✅ |

### 設計確認

**ARTIFACT_PREFIXES 不変**: `no-op-detect.ts:16` — `["specrunner/changes/", ".specrunner/"]` 変更なし。

**pipelineManagedPaths 不変**: `round-git-scope.ts:109-111` — state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md の列挙変更なし。

**3-branch precedence SELECTION 共有**: `isCoordinatorLoopActive` / `getNeedsFixMembers` を routed-findings.ts に移設し code-fixer.ts はそこから import。同一の predicate 関数を両者が共有するため branch SELECTION の drift なし。相互参照コメント付与（code-fixer.ts:18-19 および routed-findings.ts JSDoc）。

**import graph 循環なし**: routed-findings.ts は新規モジュール。インポート先（fixer-helpers / reviewer-chain / findings-ledger / canon-write-scope / pipeline/types / regression-gate / judge-verdict）はすべて routed-findings を import し返さない。

**buildCanonWriteScopeFromState vs buildCanonWriteScope**: `canon-write-scope.ts:81-83` 確認 — `buildCanonWriteScopeFromState(state)` = `buildScopeForSlug(getJobSlug(state))` = `buildCanonWriteScope(state, {slug: getJobSlug(state)})`。deps.slug === getJobSlug(state) は同一 job 内で恒等。branch 2 の canonScope は buildMessage と等価。

**既存挙動の保存**:
- `findingsRoutingApproved` 経路: 不変（TC-008 確認）
- `completionReason !== "success"` 早期 return: 不変（no-op-detect-exemption.test.ts 確認）
- `#734 escalation`（artifact-only + needs-fix）: 不変（TC-007 確認）
- `noOpDetect` 適用スコープ: code-fixer のみ（spec-fixer / build-fixer の noOpDetect 未設定を確認）

## 検証できなかった項目

None。

## Findings 詳細

### F-1: branch 3 で `collectFixableFindings` を適用しているが design.md に根拠が明示されていない

`routed-findings.ts:110-113`:
```typescript
const allFindings = getLatestJudgeFindings(state, active) ?? [];
return collectFixableFindings(allFindings);
```

`code-fixer.buildMessage` の branch 3（`code-fixer.ts:241`）は `getLatestJudgeFindings` の結果をフィルタせず全 findings を使う。設計 D1 は「branch 内の findings MAPPING を buildMessage と一致させ」と述べているが、branch 3 に限り `collectFixableFindings` でフィルタしており乖離している。

**影響の評価**: `informational` 等の non-fixable finding が change folder doc を名指しした場合、buildMessage はそのドキュメントをプロンプトに含めるが exemption は付与されない。mandatory (fixable) finding を修正する通常ケース（fixer が fixable finding のファイルも変更する）では source 変更が sourceFiles に入るため実害なし。ただし fixer が informational finding のドキュメント「のみ」を変更した場合、exemption が適用されず needs-fix が返る——これは意味的には**正しい挙動**（mandatory finding を修正していないのでノーオプ扱いが正当）。

**なぜ low か**: 挙動は意味的に正しく、branch 2 の `collectParallelFixerFindings` も内部で `collectFixableFindings` を呼ぶことと対称的。`routed-findings.test.ts` "TC-005 extended" でテスト固定済み。問題は設計文書との不一致が記録されていないことであり、将来の保守者が「buildMessage mirror」の原則からこの filter を誤りと見なして除去する可能性がある。

**修正案**: `routed-findings.ts` の `collectRoutedFixerFindings` JSDoc、または `design.md` D1 内に「branch 3 は buildMessage と異なり fixable findings のみを返す。理由: informational 等 non-fixable findings を exemption 対象に含めると sabotage で任意 doc への書き込みが "仕事" とみなされる（fail-open 方向）」と明記する。

### F-2: `executor-no-op.test.ts` に informational resolution の統合テストがない

`makeStateWithFinding` は `resolution` 引数を受け取れる（`"fixable" | "decision-needed" | "informational"`、デフォルト `"fixable"`）が、TC-001〜TC-012 のいずれも `informational` を使用していない。F-1 の「informational finding は exemption を付与しない」挙動は `routed-findings.test.ts` ユニットレベルのみで固定されており、executor 統合レベルでは未検証。

**修正案**: executor-no-op.test.ts に「finding が `informational` resolution で implementation-notes.md を名指し、変更が implementation-notes.md のみ → needs-fix」ケースを追加。`makeStateWithFinding("needs-fix", "specrunner/changes/example/implementation-notes.md", "informational")` で構成可能。

### 観察（findings には含めない）

`executor.ts:484`: `pipelineManagedPaths(deps.slug)` が `step.noOpDetect === true` ガードの外で呼ばれている（非 code-fixer step でも計算される）。O(1) 計算のため問題なし。
