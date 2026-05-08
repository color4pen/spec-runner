# Spec Review Result — fix-propose-modified-scenarios

- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: needs-fix

## Summary

proposal / design / tasks は request の要件を正確にカバーしており、設計判断（D1-D3）も妥当。ただし delta spec で MODIFIED Requirements の requirement を記述する際、既存 spec にある 3 つの scenario のうち 2 つ（"Agent and environment selection"、"Custom Tool included in session creation"）が脱落している。delta spec の MODIFIED は「変更後の完全な requirement」を表すため、archive 適用時にこれらの scenario が消失する。HIGH 1 件。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | specs/propose-session/spec.md | MODIFIED の `### Requirement: Propose Session Agent Configuration` が既存 spec の scenario 5 つ中 1 つしか保持していない。"Agent and environment selection" と "Custom Tool included in session creation" が欠落。delta spec の MODIFIED は変更後の完全な requirement を表すため、archive 適用時にこれらの scenario が消失する | 既存 spec (`openspec/specs/propose-session/spec.md`) から "Agent and environment selection" と "Custom Tool included in session creation" の scenario を delta spec に含める。新規 2 scenario と合わせて計 5 scenario にする |
| 2 | LOW | consistency | design.md:27 | D2 で「119行目の `<変更後の本文 + Scenario>` を具体例に差し替える」とあるが、tasks.md 1.2 の記述と design.md の記述で例示のフォーマットが微妙に異なる（`- **WHEN**` vs Given/When/Then の表記揺れ）。実害はないが implementer の解釈に揺れが出る可能性 | tasks.md 1.2 の例示を design.md D2 と統一するか、「propose-system.ts 内の既存 scenario フォーマットに合わせる」と明記する |

## Checklist

- [x] proposal.md の Why / What Changes / Capabilities / Impact が揃っている
- [x] design.md の Goals が request の要件をカバーしている
- [x] design.md の Non-Goals が適切にスコープを絞っている
- [x] design.md の Decisions に理由がある
- [x] tasks.md が request の受け入れ基準を全て網羅している
- [x] delta spec のファイル配置が `specs/<capability-name>/spec.md` 形式
- [x] delta spec の capability-name (`propose-session`) が `openspec/specs/` 配下に存在する
- [x] delta spec が `## MODIFIED Requirements` を使用（既存 Requirement の変更のため正しい）
- [x] `### Requirement:` header が既存 spec の header と完全一致している
- [ ] 全 scenario が保持されている — **FAIL**: 既存 scenario 2 件が脱落
- [x] proposal.md の Modified Capabilities と delta spec の対象が一致
