# Spec Review Result: exclusion-aware-publish-prediction

**Reviewer**: spec-review  
**Date**: 2026-08-29  
**Scope**: request.md / design.md / tasks.md / spec.md / test-cases.md + security considerations  
**Iteration**: 2（前周 2 件の findings への対応を再検証）

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

| # | 検証内容 | 結果 |
|---|---|---|
| 1 | 前周 [HIGH] finding: TC-024 タスクが tasks.md に追加されたか | ✓ 解消（T-15 追加済み） |
| 2 | 前周 [LOW] finding: test-cases.md YAML の `gate: 1` 追加 | ✓ 解消（gate: 1 追加済み） |
| 3 | T-15 タスク内容の正確性 — 実装根拠・Acceptance Criteria の整合確認 | △（引数順序エラー、後述） |
| 4 | T-15 acceptance criteria の `isReconcilableArtifact` 呼び出し形式が実際の関数シグネチャと一致するか | ✗（引数順序逆転、後述） |
| 5 | test-cases.md Summary セクションと YAML result ブロックのカウント整合性 | △（Summary 行に gate 不記載、後述） |
| 6 | T-15 の実装注記における `quarantineAndRemoveMatching` 参照の妥当性確認 | △（unexported 関数を直接テストする表現が誤誘導、後述） |
| 7 | tasks.md T-01〜T-14 の内容（前周から変更なし） | ✓ |
| 8 | request.md ↔ design.md アライメント（要件 1〜9 が Goals / Decisions に写っているか） | ✓ |
| 9 | design.md ↔ tasks.md アライメント（D1〜D5 の各 Decision に実装タスクが対応しているか） | ✓ |
| 10 | spec.md シナリオ網羅性（受け入れ基準の各チェックがシナリオに反映されているか） | ✓ |
| 11 | write-scope 保護（除外 pattern が protected canon 検査を迂回しない設計） | ✓ |
| 12 | DSM 制約: `push-capability.ts`（shared-kernel）が `staging-containment.ts` をインポートしない設計 | ✓ |
| 13 | `collectPublishablePaths` の worktree/commit 成分分離設計の正確性 | ✓ |
| 14 | 後方互換性: 新規引数が省略可能設計になっているか（各 call site） | ✓ |
| 15 | `isReconcilableArtifact` の実際の動作（change-folder 外パスを自然に除外）確認 | ✓（実装は正しい） |
| 16 | TC-028 カテゴリ（DSM アーキテクチャ検査の unit 分類）の妥当性 | ✓（architecture test または静的 import 検査のどちらでも実現可能） |
| 17 | セキュリティ: commit 成分の除外免除（push される path がブロックを逃れない）設計 | ✓ |
| 18 | セキュリティ: write-scope 違反検査が除外前の全 path に対して行われる設計 | ✓ |

## 検証できなかった項目

| # | 項目 | 理由 |
|---|---|---|
| 1 | TC-008（E2E ストーリー）の実際の実行パス網羅性 | 複数 step 跨ぎの E2E は静的レビューでは trace 不可 |
| 2 | `halt → resume` 時の `reconcileWorktreeArtifacts` の動的実行確認（TC-024） | integration test が存在しないため静的確認のみ |

## Findings 詳細

### [MEDIUM] T-15: `isReconcilableArtifact` の引数順序が逆になっている

**ファイル**: `specrunner/changes/exclusion-aware-publish-prediction/tasks.md`  
**箇所**:
- タスク本文 L293: `isReconcilableArtifact("some-slug", ".github/workflows/ci.yml")` が `false` を返すことを unit test で確認する
- Acceptance Criteria L311: `isReconcilableArtifact("<slug>", ".github/workflows/ci.yml")` → `false` が unit test で確認されている

#### 問題

`isReconcilableArtifact` の実際のシグネチャは:

```typescript
export function isReconcilableArtifact(path: string, slug: string): boolean
```

第 1 引数が `path`、第 2 引数が `slug` であるため、T-15 の記述通りに実装すると引数が逆転した呼び出しになる:

- T-15 が指定: `isReconcilableArtifact("some-slug", ".github/workflows/ci.yml")`
- 正しい呼び出し: `isReconcilableArtifact(".github/workflows/ci.yml", "some-slug")`

GIVEN/THEN の日本語説明（「`.github/workflows/ci.yml`（change-folder 外パス）、slug `"some-slug"`」）はインテントを正確に記述しているが、コード例が逆転している。

#### 影響

実装者がコード例を copy-paste した場合、`path="some-slug"`, `slug=".github/workflows/ci.yml"` でテストが書かれる。この呼び出しも `false` を返す（"some-slug" が `changeFolderPath(".github/workflows/ci.yml")` = "specrunner/changes/.github/workflows/ci.yml" 配下でないため）が、**テストの意図（change-folder 外パスを path として渡した時に false が返ること）を正確に検証しない**。将来 `isReconcilableArtifact` のロジックが改修された際に回帰を検出できない可能性がある。

#### 修正箇所

```
# タスク本文 L293
- 誤: isReconcilableArtifact("some-slug", ".github/workflows/ci.yml")
+ 正: isReconcilableArtifact(".github/workflows/ci.yml", "some-slug")

# Acceptance Criteria L311
- 誤: isReconcilableArtifact("<slug>", ".github/workflows/ci.yml") → false
+ 正: isReconcilableArtifact(".github/workflows/ci.yml", "<slug>") → false
```

---

### [LOW] test-cases.md Summary セクションが gate カテゴリを含めていない

**ファイル**: `specrunner/changes/exclusion-aware-publish-prediction/test-cases.md`  
**箇所**: ファイル冒頭 Summary セクション（L5-8）

```markdown
## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 26
- **Manual**: 2
- **Priority**: must: 22, should: 7, could: 0
```

YAML result ブロックには前周の修正で `gate: 1` が追加され、`26 + 2 + 1 = 29 = total` で整合している。しかし Summary セクションでは `26 + 2 = 28 ≠ 29` のままであり、TC-027（category: gate）が集計に含まれていない。

#### 推奨対処

Summary セクションに `- **Gate**: 1` を追加する（または Automated に含める形で `27` に変更し、TC-027 の category を `unit` に変更する）。

---

### [観察] T-15 の `quarantineAndRemoveMatching` 参照はテスト実装で直接使えない

T-15 の実装注記（L303）:

> テストでは `quarantineAndRemoveMatching` への入力（`git status` の mock 出力）に除外 path が含まれることを確認した上で、`reconcileWorktreeArtifacts` の戻り値 `reconciled` が空であることをアサートする

`quarantineAndRemoveMatching` は unexported の内部関数であり、テストから直接参照できない。実際のテストは `SpawnFn` を mock して `git status` の出力に除外 path を含め、`reconcileWorktreeArtifacts` の戻り値 `reconciled` が空であることをアサートする形で実現する。注記の意図は正しいが、`quarantineAndRemoveMatching への入力を確認` という表現が直接 mock できるかのように誤読される可能性がある。

実装への実質的影響は低い（`SpawnFn` mock で同等の検証が可能）ため、finding ではなく観察として記録する。

---

### [観察] 前周 findings の解消確認

**前周 [HIGH]**: TC-024 を実装するタスクが存在しない → **解消済み**  
tasks.md に T-15「integration test — reconcile が除外 path を破壊しない（TC-024 対応）」が追加され、`isReconcilableArtifact` のユニットテストと `reconcileWorktreeArtifacts` の integration シナリオが明示された。

**前周 [LOW]**: YAML result ブロックのカウント不整合（automated:26 + manual:2 = 28 ≠ total:29） → **解消済み**  
test-cases.md の YAML result ブロックに `gate: 1` フィールドが追加され、`26 + 2 + 1 = 29 = total` で整合した。

---

### [観察] セキュリティ: write-scope 迂回の設計封鎖（前周から変更なし）

設計 D3 の Invariant（`findWriteScopeViolations` は `postStatus.stagedOnly` に対して実行され、除外 path は staging されないため現れない）は変更なし。TC-007 がこれをテストで固定する。設計・実装・テストとも整合している。
