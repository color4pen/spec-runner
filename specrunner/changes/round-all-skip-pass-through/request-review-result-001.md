# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

**executor.ts:270-294 — 活性化ゲート**

`src/core/step/executor.ts` の 270–295 行で確認。`if (step.activation)` ブロックが activation 評価を行い、`!decision.activated` なら `{ kind: "skipped", skipReason: decision.reason }` を返す。diff 導出不能時（`changedFilesDerivable: false`）は `evaluateActivation` がパス条件付きレビュワーを活性化に倒す fail-closed 動作も確認。行番号は ±1 程度のズレがあるが内容は正確。

**parallel-review-round.ts:353-354 — allMembersSkipped 判定**

353–354 行で確認。`memberVerdicts.size > 0 && [...memberVerdicts.values()].every((v) => v === "skipped")` という判定で all-skip を検出している。

**parallel-review-round.ts:468-478 — allMembersSkipped 時の applyRoundResults スキップ + roundError 設定**

468–483 行で確認。`!inspectionEscalated && !allMembersSkipped` のガードで `applyRoundResults` を skip し、`allMembersSkipped && !inspectionEscalated` のとき `roundError = { code: "ROUND_ALL_MEMBERS_SKIPPED", ... }` を設定。

**pipeline.ts:395-413 — 終端 seam の ROUND_ALL_MEMBERS_SKIPPED 検出**

395–413 行で確認。`nextStep === "end" && state.status === "running"` のとき `state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED"` を検出し `awaiting-resume` に遷移する。

**reviewer-chain.ts:446-464 — all-members-skipped escalation routing**

445–466 行で確認。`{ step: coordinator, on: "escalation", to: REGRESSION_GATE_STEP_NAME, when: s => last?.outcome?.error?.code === "ROUND_ALL_MEMBERS_SKIPPED" }` の遷移が定義されている。

### 関連する補助事実

**member error → halt → "escalation" verdict の分離**

`src/core/pipeline/reviewer-status.ts` の `verdictOfResult` を確認。`result.kind === "halt"` → `"escalation"` を返し、`"skipped"` とは別 verdict。error と skip の区別は現コードで維持されている。

**commitRound での state.error 上書き**

`src/core/step/commit-orchestrator.ts` の `commitRound` 実装（行 594）で `error: roundError` とセットされる。`roundError = null` を渡せば `state.error` が null にクリアされる。これは後方回復経路（要件 6）が自然に成立する根拠：resume 後に新コードが `roundError = null` で `commitRound` を呼ぶと、以前の sticky な ROUND_ALL_MEMBERS_SKIPPED エラーが消え、終端 seam が発火しなくなる。

**既存の fail-closed テスト**

`src/core/reviewers/__tests__/activation.test.ts` に `changedFilesDerivable: false` のシナリオ（paths 条件付きレビュワーを強制活性化する）が複数存在。executor.ts の活性化ゲートは変更しない、というスコープ外宣言と整合する。

**更新が必要な既存テスト**

`src/core/pipeline/__tests__/parallel-review-round-canon.test.ts` に以下が存在し、現在 ROUND_ALL_MEMBERS_SKIPPED が設定されることを期待している:
- TC-038: "roundError is set to ROUND_ALL_MEMBERS_SKIPPED"
- TC-009/TC-038: "members stay pending (not skipped) after all-skip escalation"（members stay pending の部分は新設計でも変わらないが、error.code の期待を外す必要がある）
- TC-038 (single-member): "single-member all-skip round triggers ROUND_ALL_MEMBERS_SKIPPED"

受け入れ基準が「更新対象を implementation-notes に列挙する」と明示しており、これらが対象になる。

**TC-ACT テスト群は未存在**

コードコメント（pipeline.ts:394、reviewer-chain.ts:454）に TC-ACT-01/TC-ACT-02/TC-ACT-04 が参照されているが、テストファイルには存在しない。実装時に新規作成される新テストである。

## 検証できなかった項目

- issue #911 の実測内容（「全員 skip → 再停止」のサイクルが実際のジョブで観測された、という記述の独立検証）— 現行コードを読む限り起こり得る挙動であり矛盾はない。
- ジョブ journal event の現行 schema（per-member skip 理由を記録する新 event type の設計は実装時に決める必要がある）— 要件 2 の実装詳細は request では未規定（仕様として問題ない：design step で決める）。

## Findings 詳細

None — ブロッカーなし。request の内容・根拠・受け入れ基準はいずれも正確で実装可能。

補足事項（情報提供、non-blocking）:

1. **reviewer-chain.ts の ROUND_ALL_MEMBERS_SKIPPED 遷移は新設計で dead code になる**  
   coordinator が "escalation" でなく "approved" 相当を返すようになれば、`when: s => error.code === "ROUND_ALL_MEMBERS_SKIPPED"` の条件分岐は発火しない。実装時に削除または保守注記を入れることを推奨するが、要件の範囲内で判断してよい。

2. **`applyRoundResults` の非呼び出しガードは新設計でも維持が必要**  
   要件 5（skip が恒久 free-pass にならない）を満たすには、all-skip のとき `applyRoundResults` を呼ばず members を "pending" のままにする現行ガード (`!allMembersSkipped`) を維持する必要がある。roundError をなくしても このガードは残す。
