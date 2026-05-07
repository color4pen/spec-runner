# Spec Review Result: finish-phase2-merge-state-polling

- **iteration**: 1
- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-07

## Summary

request の 4 要件すべてが delta spec・design・tasks に過不足なく反映されている。既存 `fetchPrViewWithRetry` との責務分離（Design D1）は妥当であり、retry 条件拡大（D2）・exhaustion 時の非 escalation（D3）も request の意図に合致する。delta spec の 4 Scenario は境界条件を網羅しており、tasks の TC マッピングも AC に対応している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:64 | exhaustion 時に `{ mergeStateStatus: "" }` を返すが、design.md D3 は「現在の mergeStateStatus で Phase 3 に進む」と記述。空文字は orchestrator の fallback で prViewData に解決されるため動作上は問題ないが、design の意図（最後の observed status を保持）と task コードに微妙な乖離がある | tasks.md の注記（L67）で implementer 裁量と明記済みなので許容。実装時に最後の observed status を返す設計にしても可 |
| 2 | LOW | completeness | specs/cli-finish-command/spec.md:38-39 | gh pr view の transient failure（network blip）時に即座に polling 中断する設計。retry しない理由が spec に明示されていない | spec の Scenario 4 に「gh pr view 失敗は transient retry の対象外とする（Phase 0 の mergeStateStatus で fallback するため）」の一文を追加すると明確になる |
| 3 | LOW | maintainability | tasks.md:54-59 | 最終 attempt（attempt === POST_PUSH_RETRY_COUNT）では progress メッセージが出力されないため、ユーザーが最後に観測された status を知る手段がない | 最終 attempt でも status を stdout に出力するか、exhaustion 時に summary メッセージを出す |

## Requirement Coverage

| Request Requirement | Spec Coverage | Status |
|---|---|---|
| 1. Phase 2 push 後 CLEAN まで polling | delta spec Requirement + Scenario 1-4 | covered |
| 2. retry 条件 !== CLEAN、max 5、3s | delta spec polling 仕様テーブル | covered |
| 3. 上限到達時は escalation せず続行 | delta spec Scenario 3 + design D3 | covered |
| 4. cli-finish-command spec に delta 追加 | specs/cli-finish-command/spec.md | covered |

## Acceptance Criteria Traceability

| AC | Verification | Status |
|---|---|---|
| AC1: CLEAN まで polling | TC-POST-PUSH-001, TC-POST-PUSH-002 | covered |
| AC2: push 直後の merge 失敗防止 | orchestrator 統合（tasks Phase 2） | covered |
| AC3: delta spec が validate pass | tasks Phase 4 (4.3) | covered |
| AC4: typecheck + test green | tasks Phase 4 (4.1, 4.2) | covered |

## Design Decision Assessment

| Decision | Assessment |
|---|---|
| D1: 専用関数分離 | 妥当。Phase 0 と要件が異なり SRP を保てる |
| D2: !== CLEAN で retry | 妥当。push 後の中間状態が予測不能なため最も安全 |
| D3: exhaustion 時に続行 | 妥当。Phase 3 の merge が fallback として機能する |
| D4: preflight.ts に配置 | 妥当。polling ロジックの凝集度を維持 |
| D5: モジュールスコープ定数 | 妥当。既存パターンと一致 |
