# Review Feedback — absorb-test-materialize — iter 3

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

- `git diff main...HEAD --stat`（98 files, 4923 ins / 4155 del）
- 前回 review-feedback-001 の全 findings（F-001〜F-003）と regression-gate-result-003 の全 9 件の修正を確認済み
- **遷移表**: `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` に `step === "test-materialize"` / `to === "test-materialize"` 行が 0 件。`SPEC_REVIEW approved → IMPLEMENTER`（unconditional）を確認。✅
- **exemption 縮退**: `src/core/pipeline/test-gen-exemption.ts` — `specFixerForwardsToImplementer` 削除済み、`isTestGenExempt` 使用が design→spec-review / implementer→verification の 2 箇所のみ。✅
- **spec-observation.ts**: 4 箇所の doc が全て implementer に更新済み（F3 修正確認）。✅
- **type-config.ts**: `testGenRequired` doc が「test-case-gen / bite-evidence」の 2 箇所表記に更新済み（F4 修正確認）。✅
- **step 資産削除**: `test-materialize.ts` / `test-materialize-system.ts` 不在。registry / write-scope / pipeline-map / rules 等の test-materialize 参照が除去済み。✅
- **implementer 単一化**: `src/core/step/implementer.ts` — `testsMaterialized` 分岐・`TEST_MATERIALIZE` 参照なし。✅
- **implementer prompt**: `src/prompts/implementer-system.ts` — 実体化責務が単一 mode で記述済み、旧分岐記述なし。✅
- **bite-evidence gate**: `src/core/step/bite-evidence/gate.ts` — `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` で file-set 同定。`resolveBaseCandidateOids` 参照なし。✅
- **oids.ts**: `resolveBaseCandidateOids` 削除済み、`resolveEvidenceBaseRev` は残存。✅
- **archive floor**: `src/core/archive/achieved-assurance.ts` — testDerivation がシナリオ凍結のみで判定。blob freeze 廃止済み。`AssuranceProvenanceRuntime` に `listChangedFilesBetweenCommits` を含む。✅
- **runtime primitive**: `src/core/runtime/local.ts` の `listChangedFilesBetweenCommits` — `git diff --name-only --diff-filter=d <base> <head>`（pathspec なし）。ManagedRuntime は unavailable を返す。✅
- **resume alias**: `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES["test-materialize"] = STEP_NAMES.IMPLEMENTER` 追加済み。✅
- **"Currently FAILS because" コメント**: `grep -r "Currently FAILS because" src/` → マッチなし（F5 修正確認）。✅
- **diffPathsBetweenCommits**: 実装から除去済み。残存は achieved-assurance.ts の doc comment（廃止説明）とテストファイルの説明コメントのみ（意図的）。✅

## テストカバレッジ（test-cases.md 全 19 TC）

| TC | 内容 | テストファイル | 状態 |
|----|------|--------------|------|
| TC-001 | 非免除 type spec-review approved → implementer | absorb-test-materialize-transitions.test.ts | ✅ |
| TC-002 | 免除 type も spec-review approved → implementer | absorb-test-materialize-transitions.test.ts | ✅ |
| TC-003 | 遷移表に test-materialize 行なし | absorb-test-materialize-transitions.test.ts | ✅ |
| TC-004 | spec-fixer 観測 auto-fix → implementer | absorb-test-materialize-transitions.test.ts | ✅ |
| TC-005 | implementer prompt に実体化責務含む | implementer-materialize.test.ts | ✅ |
| TC-006 | implementer message が test-materialize 実行歴に非依存 | implementer-materialize.test.ts | ✅ |
| TC-007 | gate が test-materialize run なし state で red→green に到達 | gate-no-test-materialize.test.ts | ✅ |
| TC-008 | archive floor が baseOid なしで判定に到達 | achieved-assurance-no-base-oid.test.ts | ✅ |
| TC-009 | --from test-materialize → implementer | resolve-step-test-materialize-alias.test.ts | ✅ |
| TC-010 | resumePoint.step=test-materialize → implementer | resolve-step-test-materialize-alias.test.ts | ✅ |
| TC-011 | legacy state の読み込み・fold が壊れない | resolve-step-test-materialize-alias.test.ts | ✅ |
| TC-012 | 免除 type が test-case-gen / bite-evidence を通らない | absorb-test-materialize-transitions.test.ts | ✅ |
| TC-013 | listChangedFilesBetweenCommits が LocalRuntime に実装 | list-changed-files-between-commits.test.ts | ✅ |
| TC-014 | ManagedRuntime は unavailable を返す | list-changed-files-between-commits.test.ts | ✅ |
| TC-015 | scenario 凍結 intact → testDerivation frozen | achieved-assurance-no-base-oid.test.ts | ✅ |
| TC-015a | materializedTestFiles 空でも testDerivation frozen | achieved-assurance-no-base-oid.test.ts | ✅ |
| TC-016 | scenario すり替え → testDerivation absent | achieved-assurance-no-base-oid.test.ts | ✅ |
| TC-017 | bun run typecheck が green | verification-result.md（gate） | ✅ |
| TC-018 | bun run test が green | verification-result.md（gate） | ✅ |

## Findings 詳細

### F-001: `local.ts:1501` の stale comment（low）

**ファイル**: `src/core/runtime/local.ts` (line 1501)

```ts
// File absent → violation (test-materialize must produce test files after reading test-cases.md).
```

`test-coverage` kind チェック分岐内の doc comment が test-materialize を主語としたまま残っている。廃止後は implementer が実体化責務を担う。動作への影響はゼロ。regression-gate-result-003 でも観察事項として記録されているが未修正。

**修正案**: `test-materialize must produce` → `implementer must materialize`（または同等の表現）

---

## 検証できなかった項目

- e2e テスト（`evidence-base-e2e.test.ts` / `bite-evidence-e2e-gate.test.ts`）の git commit fixture の正確性: 静的レビューの範囲外。typecheck + test が green であり機能的問題はない。
