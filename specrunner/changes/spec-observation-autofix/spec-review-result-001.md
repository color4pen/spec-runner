# Spec Review: spec フェーズの observation auto-fix

## 検証した項目

### 既存コード参照の正確性

| 参照 | 確認内容 | 結果 |
|---|---|---|
| `judge-verdict.ts:99-102` | `deriveSpecReviewVerdict` 4b が severity 不問で routable canon fixable → needs-fix | ✓ |
| `types.ts:233-234` | `SPEC_REVIEW approved → TEST_CASE_GEN` / `needs-fix → SPEC_FIXER` | ✓ |
| `types.ts:241-242` | `SPEC_FIXER approved → SPEC_REVIEW`（無条件）/ `error → escalate` | ✓ |
| `types.ts:266` | `CONFORMANCE needs-fix:spec-fixer → SPEC_FIXER` | ✓ |
| `findings-ledger.ts:33` | `collectFindingsLedger` が impl reviewer chain のみ走査（`deriveImplReviewerChain`）| ✓ |
| `compose-reviewers.ts:50` | regression-gate は custom reviewer 存在時のみ注入 | ✓ |
| `fixer-helpers.ts:101-131` | `getConformanceFixContext` の 3 条件（verdict/target match・recency・toolResult）| ✓ |
| `canon-write-scope.ts:51` | spec-fixer writableByFixer = `{spec.md, design.md, tasks.md}` | ✓ |
| `canon-escalation.ts` | `specReviewEffectiveFixer`・`selectRoutableCanonFindings` の存在と動作 | ✓ |
| `state/job-slug.ts:69` | `getJobSlug(state)` の存在と fallback chain | ✓ |
| `registry.ts:63-65` | `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER`（D5 T-03 reroute の前提）| ✓ |

### D1 真理値表の検証

design.md に記載された 9 パターンの真理値表（:74-86）を `judge-verdict.ts` および `canon-escalation.ts` の実コードと突き合わせた。

- medium fixable on spec.md（routable）: 4b が `selectRoutableCanonFindings > 0` で現行 needs-fix → 変更後 low/medium only → approved ✓
- high fixable on spec.md（routable）: D1 変更後も `critical | high` 条件で needs-fix ✓
- medium fixable on request.md（unroutable）: 4a が unroutable → escalation（不変）✓
- medium fixable on src/example.ts（非 canon）: 4b 不問・判定 5 なし → approved（不変）✓
- critical fixable on src/example.ts（非 canon）: 判定 5 で needs-fix（不変）✓

### 3 経路分離（observation / needs-fix / conformance）の論理検証

`specFixerForwardsToTestGen` の 2 条件（`getConformanceFixContext === null` AND 最新 spec-review verdict `"approved"`）を境界ケース別に追跡した。

| ケース | getConformanceFixContext | 最新 spec-review verdict | 結果 |
|---|---|---|---|
| observation pass（spec-review approved + fixables → spec-fixer）| null（conformance 未実行）| approved | true → test-case-gen ✓ |
| needs-fix 起点（spec-review needs-fix → spec-fixer）| null（conformance 未実行 or stale）| needs-fix | false → spec-review ✓ |
| conformance 起点（生産環境: conformance.endedAt > spec-review.endedAt）| non-null（verdict + recency 条件成立）| approved（以前の run）| false → spec-review ✓ |
| reverification 完了後の再 observation pass（spec-review が conformance より新しい）| null（recency 条件否定）| approved | true → test-case-gen ✓（正常）|

生産環境ではタイムスタンプが実際の順序を持つため、recency check は正確に動作する。

### T-07 更新対象テストの確認

tasks.md T-07 で列挙された既存テストの現在の期待値を確認し、D1 変更後に赤くなる箇所を確認した。

| テスト | TC | 変更内容 | 確認 |
|---|---|---|---|
| `spec-review-fixer-routing.test.ts` | TC-001 | `deriveSpecReviewVerdict(medium fixable, spec.md)` → needs-fix を approved に | ✓ 赤くなる |
| 〃 | TC-002 | `deriveSpecReviewVerdict(low fixable, design.md)` → needs-fix を approved に | ✓ 赤くなる |
| 〃 | TC-005 | `deriveStepCompletion` verdict → needs-fix を approved に | ✓ 赤くなる |
| 〃 | TC-013 | `deriveSpecReviewVerdict(medium fixable, tasks.md)` → needs-fix を approved に | ✓ 赤くなる |
| 〃 | TC-015 | `checked>0 with spec.md fixable` → needs-fix を approved に | ✓ 赤くなる |
| `spec-fixer-tasks-md-writable.test.ts` | TC-003 | 2 サブテスト verdict → needs-fix を approved に | ✓ 赤くなる |
| `pipeline.transitions.test.ts` | TC-030 | `STANDARD_TRANSITIONS.length` → 44 を 46 に | ✓ 赤くなる |

TC-003, TC-006, TC-007, TC-008, TC-010〜012, TC-014, TC-016〜020（spec-review-fixer-routing.test.ts）はすべて不変で green を維持する見込みを確認した。

### セキュリティ観点

- 新 predicate（`specReviewHasRoutableFixables`・`specFixerForwardsToTestGen`）はいずれも pure function で、入力は信頼済みの `JobState` のみ。ユーザー制御入力は処理しない。
- spec-fixer の書込集合（`{spec.md, design.md, tasks.md}`）は不変。observation pass によるスコープ外ファイル書込は発生しない。
- 予算安全性: observation pass は spec-review を再入場しないため loop counter を増やさない。spec-fixer budget 枯渇時は既存 T-03 reroute（`SPEC_REVIEW approved → TEST_CASE_GEN` clean 行）が動作する（`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` 確認済み）。

## 検証できなかった項目

- `src/prompts/spec-review-system.ts`: 全量列挙規律・finding-recency 検出（#925）が変更なしであること（ファイル未読のため）。
- `typecheck && test` の実際の実行結果（ツール利用不可のため）。

## Findings 詳細

### Finding 1: T-07 の「実行で確定させる」対象に pipeline.conformance-routing.test.ts TC-CONFRT-07 を追記する

- file: specrunner/changes/spec-observation-autofix/tasks.md
- severity: low
- resolution: fixable
- title: T-07 確認リストに TC-CONFRT-07 を追記する
- rationale: TC-CONFRT-07 はすべてのステップに同一タイムスタンプ `"2026-01-01T00:00:00.000Z"` を使用する。新 guarded transition 追加後、conformance 起動の spec-fixer#3 において `getConformanceFixContext` が recency check の `>=` 条件（同一タイムスタンプで equal → "predecessor ran at same time as conformance" → null）により null を返す。spec-review の最新 verdict は "approved"（spec-review#3）のため `specFixerForwardsToTestGen = true` となり、spec-fixer#3 が spec-review reverification をスキップして test-case-gen へ直行する。最終アサーション（`specFixerCallCount === 3`・`result.status === "awaiting-archive"`）は通過するため T-07 の "赤くなる" 定義外だが、テストが本来検証していた "conformance → spec-fixer → spec-review reverification" が testing されなくなる。T-06 新規テストが proper timestamps で reverification 不変条件をカバーすることを実装時に確認すること。tasks.md T-07 末尾または implementation-notes に "TC-CONFRT-07 は assertions pass するがフロー変化あり" と記録することを推奨する。

### Finding 2: 上記以外に blocking・high 指摘なし

既存コード参照の正確性・D1 真理値表・経路分離ロジック・T-07 更新リストの完全性・セキュリティ観点のいずれも問題なし。regression-gate が custom reviewer 不在時に注入されない点は design.md:30-32 で明示的に acknowledge され、impl 側の observation auto-fix と対称な設計として受け入れ済み。spec.md の要件と scenarios は request.md 要件 1〜5 を漏れなくカバーし、tasks.md の task は design decisions D1〜D6 と 1:1 対応している。
