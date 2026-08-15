# Review Feedback — absorb-test-materialize — iter 1

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

- `git diff main...HEAD --stat`（85 files, 3925 ins / 3874 del）
- **遷移表**: `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` の全行を確認。TEST_MATERIALIZE 行が存在しないこと、spec-review/approved が unconditional に IMPLEMENTER へ向くことを確認。
- **exemption 縮退**: `src/core/pipeline/test-gen-exemption.ts` — `specFixerForwardsToImplementer` 削除済み、`isTestGenExempt` の使用が 2 箇所（design→spec-review / implementer→verification）に縮退していることを確認。
- **step 資産削除**: `test-materialize.ts` / `test-materialize-system.ts` の不在を確認。registry / write-scope / staging-containment / pipeline-map 等の test-materialize 参照が除去されていることを確認。
- **implementer 単一化**: `src/core/step/implementer.ts` — `testsMaterialized` 分岐、`TEST_MATERIALIZE` 参照が存在しないことを確認。`buildImplementerInitialMessage` は単一 mode。
- **implementer prompt**: `src/prompts/implementer-system.ts` — `テストの扱い（実体化責務）` 節に「test-cases.md の全 must TC をテストコードに実体化」責務が明示されていることを確認。旧 implement-only mode 分岐の記述が削除されていることを確認。
- **bite-evidence gate**: `src/core/step/bite-evidence/gate.ts` — step 6 が `listChangedFilesBetweenCommits(evidenceBaseRev, headOid)` を使用。`resolveBaseCandidateOids` 参照なし。Deferral order コメントも正しく更新済み。
- **oids.ts**: `resolveBaseCandidateOids` が削除され、`resolveEvidenceBaseRev` のみ残存することを確認。
- **archive floor**: `src/core/archive/achieved-assurance.ts` — P2 が EB ref 解決のみ（baseOid 不要）。testDerivation はシナリオ凍結のみで判定。blob freeze 廃止済み。`AssuranceProvenanceRuntime` Pick 型が `listChangedFilesBetweenCommits` を含む。
- **runtime primitive**: `src/core/runtime/local.ts` の `listChangedFilesBetweenCommits` — `git diff --name-only <base> <head>`（pathspec なし）の実装を確認。ManagedRuntime も同メソッドで unavailable を返すことを確認。
- **resume alias**: `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES["test-materialize"] = STEP_NAMES.IMPLEMENTER` 追加済み。`--from` / `resumePoint.step` 両経路で alias 適用されることをコードで確認。`state.step` hard-crash 経路は alias 非適用（build-fixer と同一挙動）。
- **テストカバレッジ** (test-cases.md 全 18 must TC):
  - TC-001〜004, TC-012: `absorb-test-materialize-transitions.test.ts` ✅
  - TC-005〜006: `implementer-materialize.test.ts` ✅
  - TC-007: `gate-no-test-materialize.test.ts` ✅
  - TC-008, TC-015, TC-015a, TC-016: `achieved-assurance-no-base-oid.test.ts` ✅
  - TC-009〜011: `resolve-step-test-materialize-alias.test.ts` ✅
  - TC-013〜014: `list-changed-files-between-commits.test.ts` ✅
  - TC-017/018 (gate): verification-result.md で typecheck/test ともに passed ✅
- **verification result**: build / typecheck / test / lint 全 passed を確認。

## 検証できなかった項目

- e2e テスト（`evidence-base-e2e.test.ts` / `bite-evidence-e2e-gate.test.ts`）の内容: diff stat に現れるが実際の git commit fixture 更新の正確性は静的レビューの範囲外。ただし typecheck + test が green であるため機能的には問題なし。

## Findings 詳細

### F-001: `spec-observation.ts` の `specFixerObservationForward` doc が test-materialize を指したまま（medium）

**ファイル**: `src/core/pipeline/spec-observation.ts`

T-03 で「`specFixerObservationForward` の doc/コメントの routing 先を test-materialize → implementer に更新する」が明示されており、tasks.md では `[x]` にマークされているが、実ファイルは更新されていない。

未更新箇所（4 行）:

| 行 | 現状テキスト | 正しい内容 |
|----|------------|-----------|
| 7 | `"proceeds directly to test-materialize without re-running spec-review"` | `"...implementer without re-running spec-review"` |
| 57 | `"observation pass goes directly to test-materialize"` | `"...directly to implementer"` |
| 60 | `"@returns true when spec-fixer should forward directly to test-materialize"` | `"...to implementer"` |
| 75 | `"routing incorrectly to test-materialize"` | `"routing incorrectly to implementer"` |

動作は正しい（遷移表は IMPLEMENTER を指す）。doc のみ stale。

---

### F-002: `type-config.ts` の `testGenRequired` doc に test-materialize 残存（low）

**ファイル**: `src/config/type-config.ts` (lines 27–28)

```ts
// Whether this request type requires test generation (test-case-gen / test-materialize / bite-evidence).
// false → test-gen-exempt: pipeline bypasses test-case-gen, test-materialize, and bite-evidence.
```

廃止後は「test-case-gen / bite-evidence」の 2 箇所が正しい。T-02 の明示対象ではなかったが、要件6「exemption 2 箇所に縮退」の意図と矛盾する stale doc。

---

### F-003: 新規テストの "Currently FAILS because" コメントが残存（low）

**ファイル**（6 箇所）:
- `src/core/archive/__tests__/achieved-assurance-no-base-oid.test.ts` (3 箇所)
- `src/core/resume/__tests__/resolve-step-test-materialize-alias.test.ts` (2 箇所)
- `src/core/step/bite-evidence/__tests__/gate-no-test-materialize.test.ts` (1 箇所)

テスト RED 時に書かれた「Currently FAILS because: ...」コメントが、実装完了後も削除されていない。全テストは GREEN（verification passed）であり、コメントが事実と反する。動作への影響はゼロだが、次の読者が誤解する可能性がある。

---

## Observations（非指摘事項）

- `local.ts` line 1533 の `"test-materialize must produce test files"` コメントは D5 で意図的に未変更とした箇所（`test-coverage` kind の local.ts 分岐は汎用機構として残す判断）。修正対象外で正しい。
- `diffPathsBetweenCommits` は runtime port と LocalRuntime に残るが `AssuranceProvenanceRuntime` Pick から除去済み。D5「汎用機構・触れない」判断と一致。
- TC-015a の検証パスは `floor: { testDerivation: "frozen" }` のみ設定（biteEvidence 非拘束）で early return を経由。biteEvidence も拘束した場合のパスは直接カバーされていないが、コード実装は `materializedTestFiles === []` → early return 時に `testDerivation` を achieved に保持する正しい実装になっている（D4 独立性が実装レベルでも正しい）。
