# Conformance Result — custom-reviewer-canon-binding — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

Change: `specrunner/changes/custom-reviewer-canon-binding`
Branch: `change/custom-reviewer-canon-binding-65199b12`
Diff stat: 34 files changed, 4864 insertions(+), 56 deletions(−)

---

## 検証した項目

### Judgment Item 1: tasks.md — 全チェックボックスが [x]

T-01 〜 T-09 の全タスクについて、すべての `[ ]` が `[x]` に更新されている。

| Task | 状態 |
|------|------|
| T-01 正典文書パスヘルパ追加 | 全 [x] |
| T-02 除外を pipeline 出力に限定 | 全 [x] |
| T-03 ReviewerStatus に canonHash 追加 | 全 [x] |
| T-04 reviewer-status.ts 純粋関数拡張 | 全 [x] |
| T-05 ParallelReviewRound に canon 束縛組み込み | 全 [x] |
| T-06 unit テスト追加・更新 | 全 [x] |
| T-07 reviewer-activation-e2e 期待更新 | 全 [x] |
| T-08 E2E（fabricated state + 実 git）| 全 [x] |
| T-09 破壊確認記録・検証ゲート | 全 [x] |

### Judgment Item 2: spec の SHALL/MUST → 実装対応

**Requirement 1: 承認済み custom reviewer の skip は canonical 入力 hash に束縛される（SHALL）**

`src/core/pipeline/reviewer-status.ts` の `selectPendingMembers`（L142–185）が以下の判定順序を実装する。

- `baselineCommit == null` → managed short-circuit で skip（canon チェックに到達しない）
- revision 一致後、`currentCanonHash === undefined` → skip（3-arg 後方互換）
- `currentCanonHash === null` → pending（fail-closed）
- `rec.canonHash` 欠落/null → pending（legacy fail-closed）
- `rec.canonHash !== currentCanonHash` → pending（正典変更）
- 一致 → skip

SHALL 要件「いずれかが不一致・欠落・検証不能の場合 pending に戻す（fail-closed）」を満たす。

**Requirement 2: round の変更判定は正典文書を pipeline 出力と区別する（SHALL）**

`src/core/pipeline/round-git-scope.ts` の `excludePipelineManagedChangePaths`（L77–86）が `isCanonicalDocPath` を allowlist として使用し、正典文書は保持・pipeline 出力は除外する。`parallel-review-round.ts` L161 でのみ使用（production 呼び出し箇所はここ 1 箇所）。旧 `excludeChangeFolderPaths` は `@deprecated` JSDoc 付きでテスト後方互換用に残存（production 呼び出しなし）。

**Requirement 3: reviewer が構成された round の全 skip は非 green とする（SHALL）**

`aggregateVerdict`（L270–288）が `memberVerdicts.length > 0 && !hasNonSkipped` の場合に `"escalation"` を返す。`parallel-review-round.ts` L303 の `allMembersSkipped` フラグにより `applyRoundResults` を抑止し、member を pending のまま残す。`ROUND_ALL_MEMBERS_SKIPPED` roundError を設定（L393–396）。member 0 件（空配列）は `"approved"` のまま。

**Requirement 4: 新規承認は現在の revision と canonHash に束縛される（SHALL）**

`applyRoundResults`（L211–244）の approved 分岐が `approvedAtCommit: headSha` と `canonHash: currentCanonHash ?? null` を記録する。

### Judgment Item 3: design の設計判断 → 実装対応

| Decision | 実装箇所 | 確認内容 |
|----------|---------|---------|
| D1: revision + canonHash 二重束縛 | `reviewer-status.ts` L165–183 | AND 条件。revision 一致後に canon チェックが続く |
| D2: round 境界で 1 回計算、判定は純粋関数 | `parallel-review-round.ts` L108–116 | `digestArtifacts` を 1 回呼び `currentCanonHash` を算出。純粋関数は引数で受け取る |
| D3: path 昇順ソート + "path:hash\|..." serialize | `reviewer-status.ts` L50–55 | `computeCanonHash`: null 除去 → `localeCompare` ソート → join |
| D4: managed short-circuit → revision → undefined → null → legacy → 比較 | `reviewer-status.ts` L158–183 | 判定順序がコードと一致 |
| D5: allowlist 方式（正典 5 種のみ保持） | `paths.ts` L409–419, `round-git-scope.ts` L77–86 | `isCanonicalDocPath` が basename 集合とパス深さで判定 |
| D6: allMembersSkipped で applyRoundResults 抑止、ROUND_ALL_MEMBERS_SKIPPED error | `parallel-review-round.ts` L303, L386–401 | guard 実装あり。inspection error が優先される order も維持 |
| D7: `ReviewerStatus.canonHash?: string \| null`、operations.ts 無変更 | `reviewer-snapshot.ts` L78–79 | フィールド追加確認。operations.ts の検証は name/status のみで後方互換維持 |

補足: `parallel-review-round.ts` L175–184 の canon-binding guard（`sourceTouched.length === 0 && currentCanonHash !== undefined`）は、pipeline 出力のみの変更で always-activate reviewer が誤 invalidation されないよう computeInvalidations をスキップし、revision を re-anchor する。この経路では `canonHash` は spread でそのまま保持され、正典変更は `selectPendingMembers` での `canonHash` 比較が検出するため、設計意図と一致する。

### Judgment Item 4: acceptance criteria → テストで固定（typecheck && test が green）

| 受け入れ基準 | テスト識別子 | ファイル |
|------------|-------------|--------|
| 正典変更 → reviewer pending | TC-001, TC-043 | `parallel-review-round-canon.test.ts`, `canon-binding-e2e.test.ts` |
| 正典・activation 不変 → skip 維持 | TC-002, TC-044 | 同上 |
| 全 skip → escalation、0 件 → approved | TC-006, TC-007, TC-009, TC-038 | `parallel-review-round-canon.test.ts` |
| legacy record → pending | TC-003, TC-029 | `parallel-review-round-canon.test.ts`, `reviewer-status-canon.test.ts` |
| findings-only commit → 誤 invalidation なし | TC-004, TC-045 | `round-git-scope-pipeline-managed.test.ts`, `canon-binding-e2e.test.ts` |
| E2E: fabricated state + 実 git | TC-043 | `canon-binding-e2e.test.ts` |
| 破壊確認記録 | TC-046, TC-047, TC-048, TC-049 | コメント + `design.md「破壊確認」節` |
| typecheck && test green | — | `verification-result.md`: passed（595 test files, 8739 tests passed） |

`reviewer-activation-e2e.test.ts` の TC-ACT-01/TC-ACT-02/TC-ACT-04（単一 skip）は `"awaiting-resume"` に更新済み（D6 blast radius）。TC-ACT-04 第 2 テスト（mixed: skip + approved）は `"awaiting-archive"` のまま変更なし。

---

## 検証できなかった項目

None

---

## Findings 詳細

None
