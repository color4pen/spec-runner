# Regression Gate — Evidence Report

Iteration: 2  
Ledger items: 4  
Checked: 4  

---

## 検証方法

1. `git diff main...HEAD --stat` でブランチ変更ファイルを確認
2. 各 finding に関連するファイルを読み、修正が存在するかを検証
3. iteration 1 の regression-gate-result-001.md との照合

---

## Finding 別検証結果

### Finding 1: collectRoutedFixerFindings の conformance・coordinator 分岐にシナリオ歯がない

**検証対象**: executor 統合レベルで conformance branch (branch 1) と coordinator-loop branch (branch 2) のシナリオテストが存在するか。

**結果**: **STILL FIXED** ✓

- `executor-no-op.test.ts:939-964` に TC-009（conformance 分岐 branch 1）が存在。`makeStateWithConformanceFinding("specrunner/changes/example/implementation-notes.md")` で state を構築し、`approved` を期待している
- `executor-no-op.test.ts:970-996` に TC-010（coordinator-loop 分岐 branch 2）が存在。`makeStateWithCoordinatorFinding("doc-reviewer", "specrunner/changes/example/implementation-notes.md")` で state を構築し、`approved` を期待している
- `routed-findings.test.ts:261-282` に conformance branch unit test、`routed-findings.test.ts:288-346` に coordinator-loop branch unit test が存在
- iteration 1 から変化なし

---

### Finding 2: branch 3 の collectFixableFindings 適用が design.md に記載されておらず保守リスクがある

**検証対象**: `routed-findings.ts:107-110` の `collectFixableFindings` 適用が JSDoc または design.md D1 に明記されているか。

**結果**: **STILL FIXED** ✓

`routed-findings.ts:107-109` に意図的な乖離を説明するコメントが存在する:

```typescript
// Branch 3: active reviewer in the standard / non-coordinator path.
// Filter to fixable findings only — non-fixable (informational, decision-needed)
// findings cannot be fixed by the fixer and should not exempt paths from no-op detection.
```

iteration 1 から変化なし。

---

### Finding 3: informational resolution finding の exemption 非適用が executor 統合レベルで未テスト

**検証対象**: `executor-no-op.test.ts` に `informational` resolution を使う executor 統合テストケースが追加されたか。

**結果**: **FIXED** ✓ (iteration 1 では NOT FIXED であった)

`executor-no-op.test.ts:806-834` に TC-005 が追加された:

```typescript
it("TC-005: informational finding names implementation-notes.md, change is implementation-notes.md only → needs-fix (non-fixable excluded from exemption)", async () => {
    // ...
    const state = makeStateWithFinding(
      "needs-fix",
      "specrunner/changes/example/implementation-notes.md",
      "informational",
    );
    // ...
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
});
```

- `makeStateWithFinding` の第3引数 `"informational"` を使用（iteration 1 では型定義のみで実際のテストケースはなかった）
- 変更ファイルが `implementation-notes.md` のみで finding が `informational` の場合、exemption が適用されずに `needs-fix` を期待
- コメントに「informational finding → not in exemption set → implementation-notes.md not exempt → artifact-only change → needs-fix」と明記
- テストファイルヘッダ（line 24）にも `TC-005: informational finding が doc を名指しし変更もその doc のみ → needs-fix (non-fixable は免除対象外)` と記載

---

### Finding 4: .specrunner/ 配下の pipelineManaged 外パスが finding 名指しで exempt 候補になりうる

**検証対象**: `pipelineManagedPaths` に `.specrunner/` 配下のパスが追加されたか、または設計認識済みとして文書化されているか。

**結果**: **STILL FIXED（informational 再分類を維持）** ✓

- `pipelineManagedPaths`（round-git-scope.ts）は依然として 5 パスのみ（state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md）— コード変更なし
- `cross-boundary-invariants-result-001.md:226-253` で当該 finding が検討済み。Resolution: informational（設計認識済み、対処不要）
- 評価根拠の多重防護は変化なし: (1) reviewer が `.specrunner/` sidecar を finding として名指しする動機なし、(2) fixer の write scope は change folder 限定のため `.specrunner/` 配下への書き込み自体が発生しない
- iteration 1 から変化なし

---

## 総括

| Finding | 元 severity | 元 resolution | 検証結果 |
|---------|------------|--------------|---------|
| F-1: conformance/coordinator シナリオ歯 | LOW | fixable | STILL FIXED ✓ |
| F-2: branch 3 collectFixableFindings 乖離文書化 | LOW | fixable | STILL FIXED ✓ |
| F-3: informational 統合テスト欠如 | LOW | fixable | FIXED ✓ (iteration 1 では NOT FIXED) |
| F-4: .specrunner/ 非 pipelineManaged パス | LOW | fixable | STILL FIXED（informational 再分類）✓ |
