# Conformance Result — approved-not-overturned-by-fixer-budget — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | T-01〜T-06 全チェックボックス完了。TC-014 は it.skip 更新済み（理由コメント付き） |
| design.md | ✓ | D1〜D4 が実装に正確に反映。transition table は未変更、engine に閉じた修正 |
| spec.md | ✓ | 全 5 要件（SHALL/MUST）と対応シナリオが TC-001〜006 で固定 |
| request.md | ✓ | 受け入れ基準 T1〜T6 すべて満足。538 tests passed, 1 skipped, 全 phase green |

---

## 詳細

### 1. tasks.md — 全タスク完了確認

T-01〜T-06 の全チェックボックスが `[x]`。

- **T-01**: `lastReviewerFixableCount(state, reviewer): number` が `reviewer-chain.ts:134` に export 済み。`lastFindingsOf` + `collectFixableFindings` の再利用、副作用なし。
- **T-02**: `"pipeline:fixer:budget-skipped"` が `src/kernel/event-types.ts` の `DomainEvent` union に追加。`src/core/event/types.ts` の `EventPayloadMap` に `{ step, fixer, omittedFixableFindings, maxIterations }` payload が定義。`PipelineLogger.subscribe` で購読し JSONL に書き込み。`progress.ts` でも購読（任意要件）。
- **T-03**: `pipeline.ts` の `runInternal` で `nextStep` 確定直後（`:366`）かつ episode-reset 前（`:486`）に再 routing ブロックを挿入。3 条件（approved / fixer / budget 枯渇）が揃ったとき clean 遷移先へ差し替え。`nextStep` は `let` に変更済み。
- **T-04**: 発火時に `lastReviewerFixableCount` で件数算出 → event emit → `appendHistoryEntry`（status: "warning"、step 名・件数・fixer 名・遷移先を含む message）。
- **T-05**: TC-001〜006、TC-007〜015 を実装。TC-014 を `it.skip` に更新（T-06 の approved-exhaustion 期待更新指示に準拠）し、スキップ理由と再現手順をコメントで明記。
- **T-06**: `bun run typecheck && bun run test` が 538 passed / 1 skipped で green（verification-result.md 確認済み）。transition table の `approved→code-fixer` 行・verdict 導出規則・`needs-fix` 予算切れ挙動・`LOOP_ERROR_CODES` 文言はいずれも未変更。

### 2. design.md — 設計判断（D1〜D4）照合

**D1（エンジンに閉じた修正、transition table 不変）**
TC-015 が `buildReviewerChainTransitions` の findings-routing 行（`when` ガード付き `to === "code-fixer"`）と `LOOP_ERROR_CODES["code-review"]` 文言の両方を静的固定。`buildParallelReviewerTransitions` の `needs-fix → code-fixer` 行も固定。 ✓

**D2（transition 解決直後・episode-reset 前に再 routing 配置）**
発火条件3の閾値計算は `resolvePairedReviewForFixer` + `resolveMaxIterations` を用い、既存 exhaustion 検査と同値。clean 遷移先フィルタは設計仕様に加えて `t.to !== "end" && t.to !== "escalate"` を追加しているが、実際の clean 行は conformance/coordinator を指すため動作差異なし（防御的実装として妥当）。clean 遷移先が得られない場合の fail-safe は TC-012 が固定。 ✓

**D3（history + event に省略を明示）**
TC-004 が history の `status: "warning"` エントリ（step 名・件数を含む）と `pipeline:fixer:budget-skipped` event の両方を、`result.history` の走査と EventBus 購読の双方で固定。 ✓

**D4（needs-fix 停止挙動・メッセージ不変）**
再 routing は `outcome === "approved"` 限定であり、`needs-fix` は条件1 で排除されて既存 exhaustion 検査に委ねられる。TC-005 が `CODE_REVIEW_RETRIES_EXHAUSTED` / `awaiting-resume` を回帰防止。 ✓

### 3. spec.md — 要件・シナリオ照合

| 要件 | 規範語 | 対応テスト | 判定 |
|------|--------|-----------|------|
| 承認は paired fixer の予算切れで覆らない（standard） | SHALL / MUST NOT | TC-001 | ✓ |
| 承認は paired fixer の予算切れで覆らない（parallel） | SHALL | TC-002 | ✓ |
| 省略された fixable findings を保持する | SHALL / MUST NOT | TC-003 | ✓ |
| 任意修正の省略を明示して次工程へ進む | MUST / SHALL / MUST NOT | TC-004 | ✓ |
| needs-fix の予算切れは従来どおり停止 | SHALL / MUST NOT | TC-005 | ✓ |
| 停止メッセージは verdict と矛盾しない | SHALL / MUST NOT | TC-006 | ✓ |

TC-002 は `buildParallelReviewerTransitions` 経路を TC-001 と独立に検証しており、片方の green を他方の証拠にしていない。

### 4. request.md — 受け入れ基準照合

- **T1**: TC-001 が standard 経路で escalation なく conformance → awaiting-archive を固定。破壊確認手順コメントあり。
- **T2**: TC-002 が `buildParallelReviewerTransitions` 経路を独立に固定。clean approved 行の存在も静的に確認。
- **T3**: TC-004 が history warning（step 名 "code-review"・件数 1）と event（同内容）を EventBus 購読で固定。
- **T4**: TC-005 が needs-fix 全反復 escalation を回帰防止。
- **T5**: TC-003 が last StepRun の verdict "approved" 保持と toolResult.findings 保持を固定。
- **T6**: 538 tests passed / 1 skipped（TC-014 skip）、typecheck / build / lint / coverage 全 phase 通過。
