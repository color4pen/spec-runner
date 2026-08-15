# Cross-Boundary Invariants Review — absorb-test-materialize
## Reviewer: cross-boundary-invariants | Iteration: 1

---

## Review Scope

変更の中心は 5 つの境界:
1. **Pipeline 遷移境界** — SPEC_REVIEW/SPEC_FIXER → (TEST_MATERIALIZE 廃止) → IMPLEMENTER
2. **file-set 同定境界** — test-materialize commitOid → EB↔HEAD diff (`listChangedFilesBetweenCommits`)
3. **testDerivation 意味論境界** — blob freeze + scenario freeze → scenario freeze のみ
4. **resume 境界** — `--from test-materialize` / `resumePoint.step="test-materialize"` → implementer alias
5. **exemption 境界** — isTestGenExempt の制御箇所が 3 → 2 に縮退

---

## Invariant Analysis

### 1. Pipeline 遷移 (D1)

`specFixerObservationForward` と `specFixerNeedsFixForward` は mutual exclusive (spec-review verdict が "approved" か "needs-fix" のいずれか)。first-match-wins で順序も正しい。非 exempt type の observation pass が IMPLEMENTER に直行することは設計意図通り。✓

`isTestGenExempt` の残存箇所: `DESIGN → SPEC_REVIEW` 分岐 と `IMPLEMENTER → VERIFICATION` 分岐の 2 箇所のみ。D1 要件通りに縮退した。✓

### 2. EB-native file-set 同定 (D3)

`gate.ts` と `achieved-assurance.ts` の両者が `listChangedFilesBetweenCommits(evidenceBaseRev, headOid/finalHeadOid)` + `selectMaterializedTestFiles` でファイル集合を同定するよう一貫して更新されている。`resolveEvidenceBaseRev` は両者で共用されており無変更。✓

Archive floor が gate より後に `finalHeadOid` (archive 時点の HEAD) で再評価することで、code-review/code-fixer が test を変更した場合も archive floor が最終状態を評価する。これは旧設計 (test-materialize commit の固定 baseOid) より正確な評価となる。✓

### 3. testDerivation の独立評価 (D4)

`achieved-assurance.ts` で `scenarioFreezeIntact` を設定した後、P2 (evidenceBaseRev) チェックより前に `testDerivation = "frozen"` をセットする構造になっている。`materializedTestFiles.length === 0` でも `testDerivation` は設定済みのまま biteEvidence だけ absent になる。これは D4 設計「testDerivation は materializedTestFiles 独立」と一致する。✓

### 4. resume 境界 (D5)

`LEGACY_STEP_ALIASES["test-materialize"] = STEP_NAMES.IMPLEMENTER` が `resolve-step.ts` に追加されており、`--from test-materialize` と `resumePoint.step="test-materialize"` の 2 経路を implementer へ写す。`state.step = "test-materialize"` の hard-crash fallback (priority 4) は alias 非適用 — build-fixer と同一挙動。✓

### 5. Legacy state の fold

`event-journal.ts` の fold は `step: string` の passthrough 構造。`state.steps["test-materialize"]` は fold で保持されるが、gate/archive floor のどちらも参照しないため無害。✓

### 6. exempt type の archive floor

exempt type は test-case-gen を通らない → `testCaseGenOid` = undefined → `scenarioFreezeIntact = false` → `testDerivation` absent。旧設計では baseOid null (test-materialize 非実行) で both absent。新設計では testCaseGenOid undefined で both absent。挙動変化なし。✓

---

## Findings

### F-1: `diffPathsBetweenCommits` が RealRuntimeStrategy に required のまま残存し doc が stale

**重要度**: MEDIUM | **対処**: fixable

`src/core/port/runtime-strategy.ts` の `RealRuntimeStrategy` (line 868) に `diffPathsBetweenCommits` が required として残っている。`RuntimeStrategy` の optional 宣言 (line 695)・`LocalRuntime` の実装 (local.ts:1036)・`ManagedRuntime` の実装 (managed.ts:670) も残存。

T-05 の受け入れ基準に「`diffPathsBetweenCommits` が production から消え」と明記されているが、満たされていない。

`local.ts` の doc comment (line 1025–1028):
```
Used by the archive floor gate (assurance-provenance-floor) to verify freeze integrity.
```
これは現在 **false**。archive floor gate は `diffPathsBetweenCommits` を使わず `listChangedFilesBetweenCommits` を使う。この stale doc が生む cross-boundary 上の偽不変条件:「archive floor gate は blob freeze のために diffPathsBetweenCommits を呼ぶ」← 呼ばない。

ランタイム動作には影響なし(production caller ゼロ)だが、`RealRuntimeStrategy` の required 制約が新規 runtime 実装者に dead method の実装を強制する。

---

### F-2: `bite-evidence-e2e-gate.test.ts` と `evidence-base-e2e.test.ts` が旧 test-materialize 命名を維持

**重要度**: LOW | **対処**: fixable

T-10 の設計列挙で「evidence-base-e2e.test.ts / bite-evidence-e2e-gate.test.ts（base commit を implementer-materialized テストへ、primitive 名更新）」と明記されているが、両ファイルは未更新のまま。

`bite-evidence-e2e-gate.test.ts`:
- git commit メッセージ: `"test-materialize: add feature test (impl absent → red)"`
- state に `"test-materialize": [makeStepRun(baseOid)]` を保持
- コメント: `"The freeze check (diffPathsBetweenCommits) sees no diff..."` (廃止された機構への言及)
- `baseOid` 変数名が test-materialize commit を指すが gate は test-materialize に依存しない

`evidence-base-e2e.test.ts`:
- コメント: `"# mat1 → feature.test.ts added (first test-materialize, impl absent → red)"`
- state に `"test-materialize": [mat1Run(T1), mat2Run(T3)]`

テスト自体は `listChangedFilesBetweenCommits` / `resolveEvidenceBaseRev` を経由した新しい挙動を実質的に検証しているため green のまま。ただし命名・コメントが旧機構を指しており、gate が test-materialize state に依存しないという新しい不変条件が読み取れない。

---

### F-3: `diff-paths-between-commits.test.ts` が dead method を引き続きテスト

**重要度**: LOW | **対処**: fixable

T-10 の設計列挙:「diff-paths-between-commits.test.ts（listChangedFilesBetweenCommits へ書換・paths 引数廃止）」。
実際の対応: 新規 `list-changed-files-between-commits.test.ts` を追加したが、旧テストは削除・更新されていない。

旧テストは依然として `diffPathsBetweenCommits` (production caller ゼロの dead method) を直接呼んでいる。green 信号を維持するが、「このメソッドは使用されている」という誤った印象を与える。設計列挙の「列挙外は無変更で green」原則に照らすと、列挙内のテストは更新が期待されていたことになる。

---

### F-4: `test-coverage.ts` line 182 に削除済み step への doc 参照

**重要度**: LOW | **対処**: fixable

```
 * - test-materialize output contract (LocalRuntime.validateStepOutputs "test-coverage" branch)
```

T-02 では `output-contract.ts` の doc scrub が対象だったが、`test-coverage.ts` の同 doc は更新対象に含まれていなかった。現在 `test-coverage` output contract を宣言するステップは存在せず、`validateStepOutputs` の当該コードパスは dead。doc の stale 化によって「test-materialize が test-coverage contract を使用していた」という旧不変条件が残存する。

---

## Confirmed-Correct Invariants

| 確認項目 | 判定 |
|---|---|
| 遷移表に TEST_MATERIALIZE 行なし | ✓ |
| 全 type で SPEC_REVIEW approved → IMPLEMENTER unconditional | ✓ |
| specFixerObservationForward / specFixerNeedsFixForward が mutual exclusive | ✓ |
| isTestGenExempt の使用が 2 箇所に縮退 | ✓ |
| gate が baseOid (test-materialize run) に依存しない | ✓ |
| archive floor が baseOid (test-materialize run) に依存しない | ✓ |
| testDerivation が materializedTestFiles 独立で評価 | ✓ |
| biteEvidence が floorConstrainsBite=false 時に I/O をスキップ | ✓ |
| legacy state fold が test-materialize 実行歴を passthrough | ✓ |
| legacy resume alias (--from test-materialize → implementer) | ✓ |
| exempt type の archive floor 挙動 (both absent) が変化なし | ✓ |
| IMPL_CODE_MUTATOR_STEPS に test-materialize なし | ✓ |
| FAST_TRANSITIONS 無変更 | ✓ |
| STANDARD_PROFILE assurance floor 値 ("frozen") 維持 | ✓ |
