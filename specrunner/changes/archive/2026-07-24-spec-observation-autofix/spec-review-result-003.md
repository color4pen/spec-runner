# Spec Review: spec フェーズの observation auto-fix（iteration 003）

## 検証した項目

### 前回 Finding の反映確認

spec-review-002 Finding 1（spec.md に `critical` fixable finding のシナリオが不足）の修正確認：

```
#### Scenario: critical fixable finding on spec.md remains needs-fix

**Given** a spec-review result with `ok: true` and a single finding
`severity: "critical"`, `resolution: "fixable"`, `file` = `specrunner/changes/<slug>/spec.md`
**When** the spec-review verdict is derived
**Then** the verdict is `needs-fix`
```

spec.md の Requirement 1 に上記シナリオが追加済み ✓。tasks.md T-06 の遷移テスト（needs-fix 往復不変）にも `critical fixable on spec.md` を確認する記述が追加済み ✓。

### spec.md 要件カバレッジ（request.md §要件との対応）

| request.md 要件 | spec.md Requirement | シナリオ数 | 確認 |
|---|---|---|---|
| 1. verdict 導出変更（low/medium → approved、critical/high → needs-fix） | Requirement 1 | 5（medium/low/high/critical/unroutable） | ✓ |
| 2. observation pass 遷移（approved + routable fixable → spec-fixer → test-case-gen 直行） | Requirement 2 + 3 | 3（routable→spec-fixer、no-routable→test-case-gen、obs-pass fixer→test-case-gen） | ✓ |
| 3. 経路分離（needs-fix / conformance 起点は spec-review 再検証） | Requirement 4 | 2（needs-fix path / conformance path） | ✓ |
| 4. findings ledger への spec-review finding 追加 | Requirement 5 | 2（ledger 内包 / regression-gate skip なし） | ✓ |
| 5. observation pass が spec-review ループ予算を消費しない | Requirement 6 | 1 | ✓ |
| 6. impl 側・他 verdict 導出・FAST pipeline 不変 | Requirement 7 | 2（code-review 不変 / FAST 不変） | ✓ |

Requirement 1 の `critical` 明示シナリオが追加されており、002 でのギャップが解消されている。

### D1 verdict 真理値表の論理検証

`judge-verdict.ts` の現行 `deriveSpecReviewVerdict`（4b: `selectRoutableCanonFindings(...).length > 0 → needs-fix`、severity 不問）を確認。

D1 変更後の判定順を追跡した（9 パターン）：

| findings | D1 後ロジック | 期待 verdict | 確認 |
|---|---|---|---|
| medium fixable on spec.md（routable） | 4b: routable あり、critical/high なし → fall-through → 5: critical/high なし → 6: approved | approved | ✓ |
| low fixable on design.md（routable） | 同上 | approved | ✓ |
| high fixable on spec.md（routable） | 4b: routable あり、high あり → needs-fix | needs-fix | ✓ |
| critical fixable on spec.md（routable） | 4b: routable あり、critical あり → needs-fix | needs-fix | ✓ |
| medium fixable on request.md（unroutable） | 4a: unroutable あり → escalation（4b より優先、不変） | escalation | ✓ |
| medium fixable on src/example.ts（非 canon） | 4a/4b: canon でない → pass → 5: critical/high なし → 6: approved | approved | ✓ |
| critical fixable on src/example.ts（非 canon） | 4a/4b: canon でない → pass → 5: critical/high あり → needs-fix | needs-fix | ✓ |
| decision-needed | 判定 3 → escalation（不変） | escalation | ✓ |
| ok:false | 判定 1 → escalation（不変） | escalation | ✓ |

### 3 経路分離（D3 predicate logic）の検証

`specFixerForwardsToTestGen` の 2 条件（`getConformanceFixContext === null` AND 最新 spec-review verdict `"approved"`）を境界ケース別に追跡した。

`getConformanceFixContext`（`fixer-helpers.ts:101`）の recency check：`latestPredecessorRun.endedAt >= latestConformanceRun.endedAt` で predecessor が conformance 以降に実行 → null。predecessor は SPEC_FIXER に対し SPEC_REVIEW。

| ケース | getConformanceFixContext | 最新 spec-review verdict | specFixerForwardsToTestGen | 行先 |
|---|---|---|---|---|
| observation pass（conformance 未実行） | null | approved | true | test-case-gen ✓ |
| needs-fix 起点（spec-review needs-fix → spec-fixer） | null | needs-fix | false | spec-review ✓ |
| conformance 起点（conformance.endedAt > spec-review.endedAt） | non-null | approved（旧 run） | false | spec-review ✓ |
| reverification 後再 observation（spec-review が conformance より新しい） | null（recency 否定） | approved | true | test-case-gen ✓（正常） |

TC-CONFRT-07 の同一タイムスタンプ問題（`endedAt >= endedAt` → equal → null → specFixerForwardsToTestGen=true）は tasks.md T-07 に正確に記録済み ✓。

### D4 遷移テーブル挿入順序の検証

`transitions.find(...)` は先頭一致。guarded 行は無条件行より前に配置される。

```
{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER,    when: specReviewHasRoutableFixables }  // 前（新）
{ step: SPEC_REVIEW, on: "approved", to: TEST_CASE_GEN }                                        // 後（既存）

{ step: SPEC_FIXER,  on: "approved", to: TEST_CASE_GEN, when: specFixerForwardsToTestGen }      // 前（新）
{ step: SPEC_FIXER,  on: "approved", to: SPEC_REVIEW }                                          // 後（既存）
```

design.md D4 の記述が tasks.md T-04（「順序は既存無条件行より前」）に引き継がれている ✓。
`STANDARD_TRANSITIONS.length` は 44 → 46（+2 guarded rows）。TC-030 の更新指示あり ✓。

### D5 予算安全性の検証

T-03 reroute（`pipeline.ts:445-490`）のロジックを確認：

```
cleanTransition = this.transitions.find(
  (t) =>
    t.step === currentStep &&
    t.on === "approved" &&
    !fixerNamesForReroute.has(t.to) &&  // → SPEC_FIXER を除く
    t.to !== "end" && t.to !== "escalate" &&
    (!t.when || t.when(state)),
)
```

spec-fixer budget 枯渇時：
- `nextStep === SPEC_FIXER`（新 guarded 行の解決結果）
- `fixerNamesForReroute.has("spec-fixer")` → true（`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` 確認済み）→ reroute 発火
- cleanTransition: `SPEC_REVIEW approved → TEST_CASE_GEN`（`t.when` 未定義 → 条件 5 通過）→ test-case-gen へ直行 ✓

observation pass は spec-review を再入場しないため、loop counter の追加消費は発生しない ✓。

### D6 findings ledger 設計の検証

現行 `collectFindingsLedger` は `judgeEffectiveFixer`（常に `code-fixer`）基準でunroutable canon finding を除外する。spec.md は code-fixer の writable set に含まれないため spec.md finding が全て除外される問題を確認。

D6 の `collectSpecReviewLedger`（specReviewEffectiveFixer 基準）により：
- spec.md / design.md / tasks.md: spec-fixer が書ける → routable → ledger に保持 ✓
- request.md / test-cases.md / attestation: spec-fixer が書けない → unroutable → 除外 ✓

`selectRoutableCanonFindings` / `selectUnroutableCanonFindings` + `specReviewEffectiveFixer`（`canon-escalation.ts:56`、常に `"spec-fixer"` を返す）の組み合わせで正確に動作することを確認 ✓。

regression-gate の `skipWhen` に合流後の台帳が空のときのみ skip する条件が追加されることで、spec-review finding のみの場合も gate を走らせる（Requirement 5 Scenario 2）✓。

### T-07 更新対象テスト一覧の検証

| ファイル | TC | 変更内容 | 確認 |
|---|---|---|---|
| `spec-review-fixer-routing.test.ts` | TC-001 | `deriveSpecReviewVerdict(medium fixable, spec.md)` 期待 `needs-fix` → `approved`（2 番目の sub-test は不変） | ✓ 赤くなる |
| 〃 | TC-002 | `deriveSpecReviewVerdict(low fixable, design.md)` 期待 `needs-fix` → `approved` | ✓ 赤くなる |
| 〃 | TC-005 | `deriveStepCompletion` verdict `needs-fix` → `approved`（`escalationReason` 未設定は不変） | ✓ 赤くなる |
| 〃 | TC-013 | first sub-test `tasks.md fixable → needs-fix` → `approved`（2/3 番目の sub-test は不変） | ✓ 赤くなる |
| 〃 | TC-015 | 3rd sub-test `checked>0 with spec.md fixable → needs-fix` → `approved`（1/2 番目は不変） | ✓ 赤くなる |
| `spec-fixer-tasks-md-writable.test.ts` | TC-003 | 2 sub-test verdict `needs-fix` → `approved`（`escalationReason` 未設定は不変） | ✓ 赤くなる |
| `pipeline.transitions.test.ts` | TC-030 | `STANDARD_TRANSITIONS.length` 44 → 46 | ✓ 赤くなる |

TC-CONFRT-07: 同一タイムスタンプ問題により `specFixerForwardsToTestGen=true` となり conformance→spec-fixer→spec-review reverification が検証されなくなる。期待値変更は不要（`specFixerCallCount===3` / `awaiting-archive` アサーションは pass）。tasks.md T-07 に記録済み ✓。

TC-003 / TC-006 / TC-007 / TC-008 / TC-010〜012 / TC-014 / TC-016〜020（spec-review-fixer-routing.test.ts）: 不変で green を維持 ✓。

### セキュリティ観点（OWASP Top 10）

- **Injection (A03)**: 新 predicate（`specReviewHasRoutableFixables` / `specFixerForwardsToTestGen`）は `JobState.steps[stepName]` の `outcome.verdict` 文字列比較と `finding.file` のパスマッチングのみ。ユーザー制御 HTTP 入力を処理せず、コードとして実行されない。injection リスクなし。
- **Broken Access Control (A01)**: spec-fixer の write-set（`{spec.md, design.md, tasks.md}`）は変更なし。observation pass は既存 write-set で動作し、スコープ外ファイルへのアクセスなし。
- **Path traversal**: `buildCanonWriteScopeFromState` は `getJobSlug(state)` → `changeFolderPath(slug)` でパスを生成。slug は job 作成時に確定した内部値（`state.request.slug`）であり、既存 `buildCanonWriteScope` と同一パス生成ロジックを共有する。既存リスクプロファイルと同等で新規リスクなし。
- **Security Misconfiguration (A05)**: `FAST_TRANSITIONS` は明示的に不変扱い（tasks.md T-04 / T-08）。
- **New attack surface**: 新規 I/O・ネットワーク・ファイルシステムアクセスなし。純関数モジュール追加のみ。

### spec.md の SHA/MUST キーワード一貫性

全 Requirement の SHALL / MUST / MAY NOT / MUST NOT を確認した。

- Requirement 1: SHALL return / MUST still be recorded / MUST remain / MUST be unchanged ✓
- Requirement 2: SHALL route / MUST route directly ✓
- Requirement 3: SHALL route / MUST NOT be re-executed ✓
- Requirement 4: SHALL return to spec-review / MAY forward directly to test-case-gen ✓
- Requirement 5: SHALL include / MUST be retained / MUST NOT be dropped / MUST NOT be skipped ✓
- Requirement 6: SHALL NOT increment / MUST execute spec-review exactly once ✓
- Requirement 7: SHALL all remain unchanged ✓

## 検証できなかった項目

- `typecheck && test` の実際の実行結果（ツール利用不可のため）。
- `src/state/job-slug.ts` の `stripJobIdSuffix` / `stripBranchPrefix` 内部実装の完全な検証（`getJobSlug(state)` の呼び出し正確性は確認済みだが、fallback chain の全パスは省略）。

## Findings 詳細

### Finding 1: 指摘なし

前回 Finding（spec.md の `critical` シナリオ欠如）は正確に反映されている。真理値表・3 経路分離ロジック・T-03 reroute との相互作用・D6 ledger 設計・セキュリティ観点・T-07 更新リストの完全性のすべてで問題なし。

spec.md の要件・シナリオ・design.md の Decision 論拠・tasks.md のタスク分解は整合的かつ実装可能。前回までの全 finding が反映済みであることを確認した。
