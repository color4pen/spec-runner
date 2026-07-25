# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

**diff 範囲**: 21 files changed, 2298 insertions(+), 5 deletions(-)  
**読んだファイル**: `output-contract.ts`、`local.ts`（lines 1317-1343）、`step-halt.ts`、`output-verify.ts`、`test-materialize.ts`、`test-coverage-violation-detail.test.ts`（798 lines）、`test-materialize-boundary.test.ts`（TC-TMB-04）、`design.md`、`tasks.md`、`test-cases.md`

**TC-ID 対応確認**（test-cases.md の 16 TC 全件）:

| TC-ID | Priority | Category | テストで固定 | 実行結果 |
|-------|----------|----------|-------------|---------|
| TC-001 | must | unit | ✅ | green |
| TC-002 | must | unit | ✅ | green |
| TC-003 | must | unit | ✅ | green |
| TC-004 | must | unit | ✅ | green |
| TC-005 | must | unit | ✅ | green |
| TC-006 | must | unit | ✅ | green |
| TC-007 | must | unit | ✅ | green |
| TC-008 | must | unit | ✅ | green |
| TC-009 | must | unit | ✅ | green |
| TC-010 | must | unit | ✅ | green（TC-TMB-04 も green）|
| TC-011 | must | unit | ✅ | green |
| TC-012 | must | unit | ✅ | green |
| TC-013 | must | manual | ✅ | `bun run typecheck && bun run test` green |
| TC-014 | should | unit | ✅ | green |
| TC-015 | should | unit | ✅ | green |
| TC-016 | could | unit | ✅ | green |

`bun run typecheck` — 型エラーなし。  
`bun run test` — 9637 passed / 1 skipped (9638 total)。TC-TMB-04 以外の既存テストは無変更で green。

**実装の正確性確認**:

- `output-contract.ts`: `coverage?: { missingTcIds: string[]; assertionlessTcIds: string[] }` が optional フィールドとして追加。`detail` は従来の union を維持し後方互換。
- `local.ts` (lines 1330-1342): `evaluateTestCoverage` の `result.missingTcIds` / `result.assertionlessTcIds` を `coverage` フィールドに格納する単一箇所。`detail` も同時に設定し二重管理なし。
- `step-halt.ts`: `formatTestCoverageViolationPath` が module-local 純関数として分離。`coverage` undefined・両カテゴリ空の fall-back が正確。`; ` 連結で非空条件を使用。
- `output-verify.ts`: `testCoverageViolations` を集約し missing / assertionless を別節として展開。両カテゴリ空かつ `coverage` undefined のとき fallback path に分岐。
- `test-materialize.ts`: `policy: "follow-up"` への変更が 1 行。コメントで T-05 との対応を明記。

**スコープ外の侵犯なし**:  
coverage 判定ロジック（`evaluateTestCoverage` / `extractMustTcIds` / `tcIdBoundaryRe` / assertion 判定）に変更なし。`managed.ts` の test-coverage best-effort skip に変更なし。`OUTPUT_FOLLOWUP_MAX_ATTEMPTS` は参照のみ。他 step の契約 policy に変更なし。

## 検証できなかった項目

None（全 must TC はテストで固定済み、typecheck + test とも green で確認）

## Findings 詳細

### F-01 [nit] tasks.md の stale な "operator 確認要" 注記

**対象**: `specrunner/changes/test-coverage-violation-detail/tasks.md` lines 106-117

T-07 注記に「TC-001 / TC-008 の RED（operator 確認要）」と記載されているが、実際のテストフィクスチャは実装完了時に修正済み（`"// TC-002 placeholder — no assertion here\n"` / `"// TC-002 placeholder — no assertion call\n"` と `expect(` を含まない文字列を使用）。全 19 テストが green であり、注記は中間状態の記録である。動作への影響なし。

### F-02 [nit] TC-011 の config フィールドが PipelineDeps を完全に満たさない

**対象**: `tests/unit/step/test-coverage-violation-detail.test.ts` lines 632-644

`depsWithStrategy.config` が `{ version: 1, agents: {} }` で `environment` を省略し `as unknown as PipelineDeps` でキャスト。現在の `buildStepContext` はこのパスで `config.environment` を使用しないため green だが、将来のシグネチャ変更で壊れる可能性がある。現状リスクは低い。
