# Spec Review Result — record-model-usage-in-step-result

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-07
- **verdict**: approved

## Summary

request.md の 5 要件すべてが proposal.md / design.md / tasks.md で網羅されている。設計判断は既存コードと整合しており、SDK 型の検証でも `SDKResultSuccess.modelUsage: Record<string, ModelUsage>` の存在と 4 フィールドサブセット（inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens）の妥当性を確認した。後方互換性も optional フィールド追加のため問題ない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | design.md:28-29 | request.md では `modelUsage?: Record<string, { inputTokens: number; outputTokens: number }>` と 2 フィールドで記述しているが、design.md D1 では `cacheReadInputTokens`, `cacheCreationInputTokens` を加えた 4 フィールドに拡張している。意図的な設計拡張であり正当だが、request.md との差分が存在する | request.md は要件レベルの記述なので問題ないが、受け入れ基準に cache 系フィールドの存在確認を追加すると明確になる |
| 2 | LOW | completeness | tasks.md:15-16 | Task 3.2 で `ModelUsage` の配置について「循環 import 回避のため state 層に独自定義が望ましい」と記載しているが、design.md D1 では port 層（`agent-runner.ts`）に定義する設計。tasks.md が設計と異なる選択肢を示唆している | design.md D1 に従い port 層に定義する方針で統一する。state 層は `import type` で参照すれば循環 import は発生しない |

## Checklist

- [x] request.md 要件 1: AgentRunResult に modelUsage フィールド追加 → proposal.md, design.md D1 で定義済み
- [x] request.md 要件 2: ClaudeCodeRunner が SDK の modelUsage を格納 → design.md D2 で抽出・マッピングロジック定義済み
- [x] request.md 要件 3: executor が step result に記録 → design.md D3, tasks.md Task 4-5 でカバー
- [x] request.md 要件 4: specrunner ps への表示不要 → design.md Non-Goals に明記
- [x] request.md 要件 5: ManagedAgentRunner は undefined → design.md D4 で明記
- [x] 後方互換性: normalizeSteps への影響 → design.md D5 で明記。optional のため破壊的変更なし
- [x] SDK 型との整合: `SDKResultSuccess.modelUsage` の存在を SDK 型定義で確認済み
- [x] SDK `ModelUsage` の 8 フィールドから 4 フィールドサブセットの選定根拠が明記されている（D1）
- [x] Impact セクションの対象ファイルが実在し、変更箇所が正確
