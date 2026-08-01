# Regression Gate — Evidence Report

Iteration: 1  
Ledger items: 4  
Checked: 4  

---

## 検証方法

1. `git diff main...HEAD --stat` でブランチ変更ファイルを確認
2. 各 finding に関連するファイルを読み、修正が存在するかを検証
3. cross-boundary-invariants-result-001.md / spec-review-result-001.md / review-feedback-001.md を照合

---

## Finding 別検証結果

### Finding 1: collectRoutedFixerFindings の conformance・coordinator 分岐にシナリオ歯がない

**検証対象**: spec-review-result-001.md 由来。T-04 に conformance / coordinator-loop の executor 統合テストが追加されたか。

**結果**: **STILL FIXED** ✓

- `executor-no-op.test.ts:900-925` に TC-009（conformance 分岐 branch 1）が存在し、`makeStateWithConformanceFinding` で state を構築して `approved` を期待
- `executor-no-op.test.ts:931-957` に TC-010（coordinator-loop 分岐 branch 2）が存在し、`makeStateWithCoordinatorFinding` で state を構築して `approved` を期待
- `routed-findings.test.ts` にも conformance / coordinator-loop branch の unit レベルテストが存在
- ファイルヘッダ（lines 27-28）でも TC-009 / TC-010 が明記されている

---

### Finding 2: branch 3 の collectFixableFindings 適用が design.md に記載されておらず保守リスクがある

**検証対象**: `routed-findings.ts:110` の `collectFixableFindings` 適用が JSDoc または design.md D1 に明記されているか。

**結果**: **STILL FIXED** ✓

`routed-findings.ts:107-110` に意図的な乖離を説明するコメントが存在する:

```typescript
// Branch 3: active reviewer in the standard / non-coordinator path.
// Filter to fixable findings only — non-fixable (informational, decision-needed)
// findings cannot be fixed by the fixer and should not exempt paths from no-op detection.
```

`cross-boundary-invariants-result-001.md:190-202` でも「意図的な設計上の非対称性」として明示的に文書化されており、buildMessage との乖離・理由・帰結が記述されている。保守リスクは解消されている。

---

### Finding 3: informational resolution finding の exemption 非適用が executor 統合レベルで未テスト

**検証対象**: `executor-no-op.test.ts` に `informational` resolution を使う executor 統合テストケースが追加されたか。

**結果**: **NOT FIXED** ✗

- `makeStateWithFinding` の型定義（executor-no-op.test.ts:518）は `resolution: "fixable" | "decision-needed" | "informational"` を受け付けるよう拡張されている（インフラストラクチャは準備済み）
- しかし `executor-no-op.test.ts` 全体（990 行）で `informational` を使うテストケースは存在しない（`informational` の出現は line 518 の型定義のみ）
- 対応するテストは `routed-findings.test.ts` の「TC-005 extended: only fixable findings are included」（unit レベル）にのみ存在し、executor 統合レベルでは依然未検証
- finding の修正案「`makeStateWithFinding("needs-fix", "specrunner/changes/example/implementation-notes.md", "informational")` で構成し、変更ファイルが `implementation-notes.md` のみの場合に `needs-fix` を期待するケース」は未追加

**影響の再評価**: `collectFixableFindings` が branch 3 から除去された場合、unit test（routed-findings.test.ts TC-005 extended）は失敗するが executor 統合テストはそれを検出しない。防護として unit test は有効だが、executor integration の不変固定は依然欠けている。

---

### Finding 4: .specrunner/ 配下の pipelineManaged 外パスが finding 名指しで exempt 候補になりうる

**検証対象**: `pipelineManagedPaths` に `.specrunner/` 配下のパスが追加されたか、または設計認識済みとして文書化されたか。

**結果**: **STILL FIXED（informational 再分類により）** ✓

- `pipelineManagedPaths`（round-git-scope.ts:109-111）は依然として 5 パスのみ（state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md）
- `cross-boundary-invariants-result-001.md:226-253` で当該 finding が明示的に検討され、**Resolution: informational（設計認識済み、対処不要）** と分類されている
- 評価根拠: reviewer（judge）が `.specrunner/` 配下の sidecar ファイルを finding の対象として名指しする動機がなく、fixer の write scope（change folder 限定）との多重防護が有効
- 元の resolution「fixable」は cross-boundary reviewer により「informational（対処不要）」に格下げされており、コード変更は行わないという設計判断が確定している
- この設計認識は spec-review-result-001.md:70 および cross-boundary-invariants-result-001.md:251 に記録されており、現在の codebase にも変更なく維持されている

---

## 総括

| Finding | 元 severity | 元 resolution | 検証結果 |
|---------|------------|--------------|---------|
| F-1: conformance/coordinator シナリオ歯 | LOW | fixable | STILL FIXED ✓ |
| F-2: branch 3 collectFixableFindings 乖離文書化 | LOW | fixable | STILL FIXED ✓ |
| F-3: informational 統合テスト欠如 | LOW | fixable | NOT FIXED — 要追加 |
| F-4: .specrunner/ 非 pipelineManaged パス | LOW | fixable | STILL FIXED（informational 再分類）✓ |
