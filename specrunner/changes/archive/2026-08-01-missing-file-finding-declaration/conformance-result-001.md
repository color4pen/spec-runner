# Conformance Result — missing-file-finding-declaration — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| # | 項目 | 根拠 | 結果 |
|---|------|------|------|
| 1 | `Finding` 型に `fileMissing?: boolean` が追加、JSDoc に意味論が明記されている | D1 / spec Req-1 / T-01 | ✅ |
| 2 | `parseFindings` が `fileMissing === true` のみ捕捉。absent/false/非 boolean は非宣言扱い | D1 / T-01 / TC-001, TC-002 | ✅ |
| 3 | `findingSchema`（JUDGE/CODE_REVIEW/REQUEST_REVIEW）に `fileMissing: optional(boolean())` 追加 | D2 / T-02 / TC-009 | ✅ |
| 4 | `conformanceFindingSchema`（CONFORMANCE）に `fileMissing: optional(boolean())` 追加 | D2 / T-02 / TC-009b | ✅ |
| 5 | 4 tool description に fileMissing 用途（欠落指摘で true、file に欠落 path を書く）が明記されている | D2 / T-02 / TC-010a-d | ✅ |
| 6 | step-completion.ts: affectingFindings を missingDecl / regular に分割して独立検証 | D3 / T-03 | ✅ |
| 7 | 非宣言群: `{file, line}` で verifyFindingRefs → nonExistent ≥1 → override（従来挙動）| D3 / spec Req-2 | ✅ |
| 8 | 欠落宣言群: `{file}` のみ（line なし）で verifyFindingRefs → 実在 file あれば虚偽宣言 → override | D3/D4 / spec Req-2/3 | ✅ |
| 9 | シナリオ歯 #916: fileMissing:true + file 不在 → override なし、routing 付き verdict 保持 | 受け入れ基準-1 / TC-003 | ✅ |
| 10 | 虚偽宣言: fileMissing:true + file 実在（seam が空を返す）→ verdict === escalation | 受け入れ基準-2 / TC-004 | ✅ |
| 11 | 回帰保護: 非宣言 + file 不在 → verdict === escalation かつ escalationReason === undefined（TC-005 が両方 assert） | 受け入れ基準-3 / TC-005 | ✅ |
| 12 | local runtime（実 filesystem）と managed runtime（mock GitHub API）で分岐挙動が一致 | 受け入れ基準-4 / D6 / TC-006 | ✅ |
| 13 | 欠落宣言群 ref に `line` が含まれない（TC-007 が capturedRefs を直接検証） | D4 / spec Req-3 / TC-007 | ✅ |
| 14 | 既存テスト（managed-verify-finding-refs.test.ts, verify-finding-refs.test.ts 等）は無変更 | 受け入れ基準-5 | ✅ |
| 15 | `bun run typecheck`: exit 0（verification-result.md Phase typecheck 確認）| 受け入れ基準-6 / T-06 | ✅ |
| 16 | `bun run test`: 675 test files / 10032 tests pass, 1 skip（verification-result.md Phase test 確認）| 受け入れ基準-6 / T-06 | ✅ |
| 17 | seam `verifyFindingRefs` のシグネチャ・意味論は不変（呼び出し側のみ変更）| D3 / Non-Goal | ✅ |
| 18 | escalationReason 抑止ロジック（step-completion.ts:300-321）は無変更 | D5 / Non-Goal | ✅ |

## 検証できなかった項目

None

## Findings 詳細

指摘なし。

## 実装上の観察（非ブロッキング）

### branch=null ガードの追加（design リスクへの形式的対応）

design.md の Risk 節は「managed runtime で branch=null のとき seam が全 ref を非実在として返す → 欠落宣言群で全て非実在 = 宣言正しい = 上書きなし → fail-open」を識別し、緩和策として「pipeline 順序不変条件（judge step 到達時は必ず branch 確定済み）」を掲げている。

実装は非公式な不変条件に頼る代わりに、`missingDecl.length > 0 && branch === null` のとき明示的に `override = true`（fail-closed）とするガードを追加した（TC-006b で固定）。このガードは seam を呼ばず短絡するため、tasks.md の擬似コードとは分岐構造が異なるが、設計が識別したリスクを形式的に閉じる conservative な追加であり、安全方向の逸脱である。

