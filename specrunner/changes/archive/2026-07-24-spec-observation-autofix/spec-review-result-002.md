# Spec Review: spec フェーズの observation auto-fix（iteration 002）

## 検証した項目

### spec-fixer による spec-review-001 Finding 1 の反映確認

spec-review-001 の Finding 1（tasks.md T-07 確認リストへ TC-CONFRT-07 を追記）が tasks.md に
反映されているかを確認した。

tasks.md T-07 の末尾に以下が存在する：

```
  - `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`
    - TC-CONFRT-07: すべてのステップに同一タイムスタンプ（`'2026-01-01T00:00:00.000Z'`）を使用する。
      ...
      **期待値変更は不要。ただし上記フロー変化をこのリストに記録する（implementation-notes にも転記すること）。**
```

反映済み ✓。期待値変更不要の旨も正確に記録されている。

### spec.md 要件カバレッジの再確認

6 要件（request.md §要件）と spec.md シナリオの対応：

| 要件 | spec.md カバー | 確認 |
|---|---|---|
| 1. verdict 導出変更（low/medium → approved、critical/high → needs-fix） | Requirement 1: low/medium approves、high remains needs-fix、unroutable escalates | ✓ |
| 2. observation pass 遷移（approved + routable fixable → spec-fixer → test-case-gen 直行） | Requirement 2: 承認 + routable → spec-fixer、Requirement 3: spec-fixer → test-case-gen | ✓ |
| 3. 経路分離（needs-fix 起点・conformance 起点は spec-review 再検証） | Requirement 4: needs-fix path / conformance path return to spec-review | ✓ |
| 4. findings ledger への spec-review finding 追加、regression-gate 機械検証 | Requirement 5: ledger contains spec-review finding, gate not skipped | ✓ |
| 5. observation pass が spec-review ループ予算を消費しない | Requirement 6: spec-review executed exactly once | ✓ |
| 6. impl 側・他 verdict 導出・FAST pipeline 不変 | Requirement 7: code-review unchanged, FAST unchanged | ✓ |

### spec.md シナリオ網羅性の確認

各 Requirement の Given/When/Then 形式・SHALL/MUST キーワード・複数シナリオ配置を確認した。

| Requirement | シナリオ数 | SHALL/MUST | 確認 |
|---|---|---|---|
| 1 (verdict derivation) | 4 | SHALL / MUST | ✓ |
| 2 (approval routes to spec-fixer) | 2 | SHALL / MUST | ✓ |
| 3 (spec-fixer forwards to test-case-gen) | 1 | SHALL / MUST NOT | ✓ |
| 4 (needs-fix / conformance return to spec-review) | 2 | SHALL / MAY NOT | ✓ |
| 5 (ledger + regression-gate) | 2 | SHALL / MUST NOT / MUST | ✓ |
| 6 (budget) | 1 | SHALL NOT / MUST | ✓ |
| 7 (unchanged) | 2 | SHALL | ✓ |

**ギャップ**: Requirement 1 の文言は `critical or high` を need-fix の条件とするが、
シナリオは `high fixable on spec.md remains needs-fix`（severity: "high"）のみで
`critical` の明示的シナリオが存在しない。要件文としての記述は完全だが、
シナリオレベルの coverage に不足がある（後述 Finding 1）。

### design.md 主要 Decision の論理検証

**D1（4b 変更）**: judge-verdict.ts:99-102 の現コード（`selectRoutableCanonFindings.length > 0 → needs-fix`、severity 不問）を確認。D1 は critical/high のみ needs-fix、low/medium は fall-through して判定 6（approved）に達する。判定 5（非 canon critical|high → needs-fix）は不変。9 パターン真理値表は論理的に矛盾なし（spec-review-001 の検証を引き継ぎ）。

**D2（buildCanonWriteScopeFromState）**: `getJobSlug(state)` は job-slug.ts:69 に存在、
`state.request.slug`→`branch`→`request.path` の fallback chain で常に文字列を返す。
`changeFolderPath(slug)` で slug から folder path を生成できる。
既存 `buildCanonWriteScope(state, deps)` は `deps.slug` を使うため
`buildCanonWriteScopeFromState(state)` と同一 helper への委譲で一致する ✓。

**D3（spec-observation.ts）**: 2 predicate の論理を境界ケース別に確認。

| ケース | getConformanceFixContext | 最新 spec-review verdict | specFixerForwardsToTestGen | 行先 |
|---|---|---|---|---|
| observation pass（conformance 未実行） | null | approved | true | test-case-gen ✓ |
| needs-fix 起点（conformance 未実行、spec-review needs-fix） | null | needs-fix | false | spec-review ✓ |
| conformance 起点（conformance.endedAt > spec-review.endedAt） | non-null | approved（旧 run） | false | spec-review ✓ |
| reverification 後の再 observation（spec-review が conformance より新しい） | null（recency 条件否定） | approved | true | test-case-gen ✓（正常） |

TC-CONFRT-07 の同一タイムスタンプ問題（`endedAt` の `>=` 判定で equal → null）は tasks.md T-07 で記録済み、テストアサーション自体は pass するため acceptance criteria 上の問題なし。

**D4（STANDARD_TRANSITIONS guarded 行挿入順序）**: `transitions.find(...)` は先頭一致のため guarded 行を unconditional 行の前に置く必要があり、設計は「既存行より前」と明示している。実装上の order の重要性が spec.md・tasks.md に継承されているか: tasks.md T-04 に「順序は既存無条件行より**前**」と明記 ✓。

**D5（予算非消費）**: observation pass 経路（spec-review → spec-fixer → test-case-gen）は spec-review を再入場しない。ループ予算は `enterLoopStep(SPEC_REVIEW)` の呼び出し回数に紐づくため、直行遷移のみでは追加消費は発生しない。spec-fixer budget 枯渇時の T-03 reroute（`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` 確認済み）も working ✓。

**D6（collectSpecReviewLedger）**: regression-gate.ts の `buildMessage`・`skipWhen` を読み、どちらも既に `canonScope = buildCanonWriteScope(state, deps)` を計算している。T-05 は `collectSpecReviewLedger(state, canonScope)` を同関数内でそこに合流させる形であり、構造的に self-consistent ✓。`judgeEffectiveFixer` 基準では spec.md finding が unroutable（code-fixer は spec.md を書けない）になるため、専用収集関数で `specReviewEffectiveFixer` 基準に切り替える設計の必然性を確認 ✓。

### tasks.md タスク網羅性の確認

design decisions D1〜D6 と tasks T-01〜T-08 の対応：

| Decision | Task | 確認 |
|---|---|---|
| D1: 4b 変更 | T-01 | ✓ |
| D2: buildCanonWriteScopeFromState | T-02 | ✓ |
| D3: spec-observation.ts | T-03 | ✓ |
| D4: STANDARD_TRANSITIONS guarded 行 | T-04 | ✓ |
| D5: 予算安全性（実装不要、構造で満足） | T-04・D5 明記 | ✓ |
| D6: collectSpecReviewLedger | T-05 | ✓ |
| D7: ADR | adr-gen step 委任（task 不要） | ✓ |

T-06（新規テスト）: request.md 受け入れ基準の各 AC と 1:1 対応 ✓  
T-07（既存テスト更新）: TC-CONFRT-07 記録済み ✓  
T-08（スコープ検証）: 変更範囲を列挙し、変更禁止範囲を明示 ✓

### セキュリティ観点の確認（OWASP Top 10）

- **Injection (A03)**: 新 predicate は `JobState.steps[stepName]` の `outcome.verdict` 文字列比較と `finding.file` のパスマッチングのみ。ユーザー制御 HTTP 入力を処理せず、コードとして実行されない。injection リスクなし。
- **Broken Access Control (A01)**: spec-fixer の write-set（`{spec.md, design.md, tasks.md}`）は変更なし。observation pass は既存の write-set で動作し、スコープ外ファイルへのアクセスなし。
- **Security Misconfiguration (A05)**: `FAST_TRANSITIONS` は明示的に不変扱い（tasks.md T-04、spec.md Requirement 7）。
- **Path traversal**: `buildCanonWriteScopeFromState` は `getJobSlug(state)` → `changeFolderPath(slug)` でパスを生成。slug は CLI 内部で job 作成時に確定した値（`state.request.slug`）であり、既存 `buildCanonWriteScope` と同一のパス生成ロジックを共有する。既存リスクプロファイルと同等で新規リスクなし。
- **New attack surface**: 新規 I/O・ネットワーク・ファイルシステムアクセスパスなし。純関数モジュール追加のみ。

### spec-review-system.ts 全量列挙規律・finding-recency 検出の不変確認

`src/prompts/spec-review-system.ts` の Method 節 step 5 を確認：

> 5. **全量列挙の規律**: この round の revision で確認できる finding は、severity を問わずすべて今回の findings に含める。1 件ずつ**小出し**にしない。前 round から存在した記述への新規 finding は**後出し**として機械記録される。

spec.md Requirement 7（impl 側・prompt・FAST 不変）と整合 ✓。finding-recency 検出ロジックは iteration ≥ 2 で発火する記述が同ファイルにあり、本 change で変更されないことを確認（request.md §6）。

## 検証できなかった項目

- `typecheck && test` の実際の実行結果（ツール利用不可のため）。
- `src/state/job-slug.ts` の `stripJobIdSuffix`・`stripBranchPrefix` の実装詳細（getJobSlug 呼び出しの正確性は確認済みだが内部実装の完全な検証は省略）。

## Findings 詳細

### Finding 1: spec.md に `critical` fixable finding のシナリオが不足

- file: specrunner/changes/spec-observation-autofix/spec.md
- severity: low
- resolution: fixable
- title: Requirement 1 の `critical` severity シナリオが存在しない
- rationale: Requirement 1 の文言は「When the routable canon fixable findings include a `critical` or `high` severity finding, the verdict MUST remain `needs-fix`」と `critical` と `high` の両方を明示する。しかし対応するシナリオは `#### Scenario: high fixable finding on spec.md remains needs-fix` のみで `critical` のシナリオが存在しない。T-06 の遷移テスト（needs-fix 往復不変）も `high fixable on spec.md` に限定している。実装（D1）では `severity === "critical" || severity === "high"` の両方を needs-fix に倒すため実装の正しさは確保されるが、spec レベルでの `critical` シナリオ欠如は受け入れ基準の検証可能性を下げる。修正: `#### Scenario: critical fixable finding on spec.md remains needs-fix` を Requirement 1 に追加し、T-06 の needs-fix 往復テストにも `critical` ケースを含める。

### Finding 2: 上記以外に blocking 指摘なし

- tasks.md の TC-CONFRT-07 記録は適切に反映されている（spec-fixer 修正を確認）
- 3 経路分離のロジック・D1 真理値表・D6 ledger 設計・セキュリティ観点のすべてで問題なし
- spec.md の要件網羅・design.md の decision 論拠・tasks.md のタスク分解は整合的で実装可能
