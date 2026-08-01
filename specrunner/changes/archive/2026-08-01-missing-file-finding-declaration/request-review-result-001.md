# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証

1. **`src/core/step/step-completion.ts:238-256`** — 確認済み。`(isJudgeStep || isRequestReviewStep) && deps.runtimeStrategy` のゲートで `verifyFindingRefs` を呼び出し、`nonExistent.length > 0` なら `verdict = "escalation"` / `verdictOverriddenByFindingRef = true` に上書きする実装が L237-256 に存在する。

2. **`src/core/step/judge-verdict.ts:25-30`** — 確認済み。`collectVerdictAffectingFindings` = severity critical/high OR resolution decision-needed のフィルタが L26-29 に存在する。

3. **`src/core/step/step-completion.ts:300-321`** — 確認済み。`verdictOverriddenByFindingRef` が true のとき `escalationReason` ブロックがスキップされる実装が L300-321 に存在する（条件: `!verdictOverriddenByFindingRef`）。

4. **`src/kernel/report-result.ts:40-75`** — 確認済み。`Finding` 型に欠落専用フィールドは存在せず、discriminator は `origin?: "scope"` のみ（L66-74）。

5. **`src/core/step/report-tool.ts:108`** — 確認済み。`findingSchema` の `file: string()`（L108）。JUDGE / CODE_REVIEW / CONFORMANCE / REQUEST_REVIEW の各 tool description に欠落表現の規約は無い。

6. **`src/core/runtime/local.ts:752-781`** — 確認済み。filesystem 経由の `verifyFindingRefs` 実装が L752-781 に存在する。

7. **`src/core/runtime/managed.ts:381-422`** — 確認済み。GitHub API 経由の `verifyFindingRefs` 実装が L381-422 に存在する。

8. **`src/core/port/runtime-strategy.ts:428-443`** — 確認済み。「存在しない ref の部分集合を返す」契約が L428-443 に記述されている。

9. **`src/core/runtime/__tests__/managed-verify-finding-refs.test.ts:136-145`** — 確認済み。`getRawFile returns null → finding IS in nonExistent` のテストが L136-145 に存在する。

10. **step-completion の「nonExistent → escalation 上書き + escalationReason 抑止」直接テスト不在** — 確認済み。`verdictOverriddenByFindingRef` を参照するテストファイルは `step-completion.ts` 本体のみ（grep 結果）。

11. **local `verifyFindingRefs` 単体テスト不在** — 確認済み。`src/core/runtime/__tests__/local-*.test.ts` のいずれも `verifyFindingRefs` を参照していない。

### 影響範囲の確認

- `isJudgeStep` = `JUDGE_REPORT_TOOL` または `CODE_REVIEW_REPORT_TOOL` または `CONFORMANCE_REPORT_TOOL`
- spec-review / regression-gate / custom-reviewer は全て `JUDGE_REPORT_TOOL` を `reportTool` に設定（singleton identity）
- request.md の「検証が効く step: regression-gate / spec-review / custom-reviewer / code-review / conformance / request-review」は正確

### 要件・受け入れ基準の評価

- 問題（issue #916）の再現経路が明確で、背景・前提コードの記述が正確
- 要件 1-5 は実装指示として十分に具体的
- スコープ外が明示されており、seam 意味論変更や escalationReason ロジック変更が除外されている
- 受け入れ基準にシナリオ歯（#916 再現 / 虚偽宣言 / 回帰保護 / local + managed 両方）が列挙されている
- architect 評価済み設計判断（採用 2 件 / 却下 3 件）が根拠付きで記述されている

## 検証できなかった項目

None

## Findings 詳細

None
