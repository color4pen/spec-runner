# Spec Review Result: exclusion-aware-publish-prediction

**Reviewer**: spec-review  
**Date**: 2026-08-29  
**Scope**: request.md / design.md / tasks.md / spec.md / test-cases.md + security considerations

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

| # | 検証内容 | 結果 |
|---|---|---|
| 1 | request.md ↔ design.md アライメント（要件 1〜9 が Goals / Decisions に写っているか） | ✓ |
| 2 | design.md ↔ tasks.md アライメント（D1〜D5 の各 Decision に実装タスクが対応しているか） | △（TC-024 タスク欠落、後述） |
| 3 | tasks.md ↔ test-cases.md アライメント（各タスクに対応テストケースがあるか） | △（TC-024 タスク欠落、後述） |
| 4 | spec.md のシナリオ網羅性（受け入れ基準の各チェックがシナリオに反映されているか） | ✓ |
| 5 | worktree 成分のみに除外を適用し commit 成分は除外しない設計の正確性 | ✓ |
| 6 | write-scope 保護（除外 pattern が protected canon 検査を迂回しない）の維持確認 | ✓ |
| 7 | DSM 制約: `push-capability.ts`（shared-kernel）が `staging-containment.ts`（domain）をインポートしない設計 | ✓ |
| 8 | `commitRoundArtifacts` ポート型が `unknown` によって拡張可能な設計になっているか | ✓ |
| 9 | `validateStepOutputs` 省略可能引数による後方互換性 | ✓ |
| 10 | Managed runtime の `validateStepOutputs` 実装（managed.ts）が `unpushable-path` を既にスキップする設計確認 | ✓ |
| 11 | reconcile-worktree.ts の `isReconcilableArtifact` が change-folder 以外を対象外とする設計確認（TC-024 の自然な充足） | ✓（実装は安全・テスト欠落） |
| 12 | architecture test が push-capability.ts の上向きインポートを検出するか確認（TC-028） | ✓ |
| 13 | test-cases.md の総カウント整合性 | △（YAML 不一致、後述） |
| 14 | セキュリティ: 除外 pattern による write-scope 迂回の設計封鎖 | ✓ |
| 15 | セキュリティ: commit 済み path の除外免除（実際に push される path がブロックを逃れない） | ✓ |
| 16 | `buildDeliveryExclusionsBlock` による injection が空 patterns 時にゼロ影響となる設計 | ✓ |
| 17 | `resolveStagingExcludePatterns` を単一解決点として再利用する設計（要件 9） | ✓ |
| 18 | `parallel-review-round.ts` の `deps.config` 利用可能性確認（`PipelineDeps extends StepContext { config }`) | ✓ |
| 19 | 並列 review round の Layer 2 backstop が除外を受け取る経路（T-04 → `commitRoundArtifacts`） | ✓ |
| 20 | `commitScopedPaths` に scoped residual check が存在しない確認（residual check は `commitAndPush` scoped 分岐のみ） | ✓ |
| 21 | `findWriteScopeViolations` が `postStatus.stagedOnly` に対して行われ、除外 path は staged に現れない設計 | ✓ |

## 検証できなかった項目

| # | 項目 | 理由 |
|---|---|---|
| 1 | TC-008（E2E ストーリー）の実際の実行パス網羅性 | 複数 step 跨ぎの E2E は静的レビューでは trace 不可 |
| 2 | `halt → resume` 時の `reconcileWorktreeArtifacts` の動的実行確認（TC-024） | integration test が存在しないため静的確認のみ |

## Findings 詳細

### [HIGH] TC-024 を実装するタスクが tasks.md に存在しない

**ファイル**: `specrunner/changes/exclusion-aware-publish-prediction/tasks.md`  
**対応受け入れ基準**: 「halt → resume を挟んでも、worktree が継続している限り除外対象 path が reconcile で破壊されない」  
**TC-024 優先度**: must（integration）

#### 問題

TC-024 は "must" 優先度の integration test だが、tasks.md の T-01〜T-14 のいずれにも「reconcile が除外 path を削除しない」ことをテストする実装タスクが存在しない。実装者は TC-024 を書く根拠を tasks.md から得られない。

#### 現状実装の安全性（静的検証）

`src/core/resume/reconcile-worktree.ts` の `isReconcilableArtifact` を確認した。reconcile 対象は "change-folder 内、かつ canon でも managed でもないパス" に限定される:

```typescript
// 1. Must be inside the change folder
if (path !== folder && !path.startsWith(folder + "/")) {
  return false;  // ← .github/workflows/**, vendor/** はここで即 false → 削除されない
}
```

`.github/workflows/**` や `vendor/**` 等の除外対象 path は `specrunner/changes/<slug>/` 外であるため、`isReconcilableArtifact` は `false` を返し `git clean -f` されない。**既存実装は要件を自然に充足している**。しかしこの充足は仕様書に記録されておらず、テストもない。受け入れ基準が "must" であるため、tasks.md へのタスク追加と対応テストが必要。

#### 推奨対処

tasks.md に T-15 を追加する:

```
## T-15: TC-024 ユニットテスト — reconcile が除外 path を削除しない

対象ファイル: src/core/resume/__tests__/reconcile-exclusion.test.ts (新規)

- [ ] isReconcilableArtifact(".github/workflows/ci.yml", slug) が false を返すことをユニットテストする
      （change-folder 外パスは reconcile 対象外であることを固定）
- [ ] reconcileWorktreeArtifacts を git-mock 付きでテストし、
      change-folder 外 untracked（exclude pattern 一致 path）が
      reconciled に含まれず git clean -f も呼ばれないことを確認する

Acceptance Criteria:
- TC-024 の GIVEN/WHEN/THEN が unit test で固定される
- 既存 isReconcilableArtifact テストが非退行
```

---

### [LOW] test-cases.md YAML result ブロックのカウント不整合

**ファイル**: `specrunner/changes/exclusion-aware-publish-prediction/test-cases.md`  
**場所**: ファイル末尾 Result ブロック

```yaml
result: completed
total: 29
automated: 26
manual: 2
```

`automated(26) + manual(2) = 28 ≠ total(29)`。TC-027 は category `gate` であり unit/integration でも manual でもないが、YAML に `gate` フィールドが存在しないため 1 ケースが計上されていない。ヘッダーのサマリーテキストは正確（Automated: 26 / Manual: 2 で gate 1 件は別扱い）。

**推奨対処**: `gate: 1` フィールドを追加するか `automated: 27` に変更する。

---

### [観察] セキュリティ: write-scope 迂回の設計封鎖

`stagingExcludePatterns` に protected canon path と重複する pattern を設定しても、設計 D3 の Invariant 維持により `findWriteScopeViolations` は `postStatus.stagedOnly`（除外 path は staging されないため現れない）に対して行われ、write-scope 検査を迂回できない。TC-007 がこれをテストで固定する。設計・実装・テストとも整合している。

---

### [観察] managed runtime の `validateStepOutputs` 互換性

`managed.ts:validateStepOutputs` は既に `unpushable-path` contract を `continue` でスキップしており、4 番目省略可能引数なしでも機能的に安全。TypeScript の省略可能引数はインターフェース側追加後も実装が未宣言であっても型エラーにならない。T-05「実装は引数を無視してよい」は正確。

---

### [観察] `commitScopedPaths` 8 番目引数位置の整合確認

現状の `commitScopedPaths` は 7 引数（stagePaths, cwd, branch, commitMessage, infra, egress?, pushCapability?）。T-03 の「8 番目の省略可能引数」追加は位置として正確。

---

### [観察] reconcile ライフサイクルとスコープ外の整合

request.md「スコープ外: 除外された変更を job worktree 撤去後も保全する仕組み」は非ゴール。worktree 撤去（archive 時の worktree 削除）で除外 path も失われる現行ライフサイクルは維持される。design.md Non-Goals に明記されており整合している。
