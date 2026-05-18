# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-18
- **iteration**: 1

## Summary

design.md と tasks.md は request.md の要件を正確に反映しており、技術的に健全。delta spec のフォーマット・path も正しい。ただし delta spec の MODIFIED セクションで **既存 baseline scenario が欠落** しており、spec-merge 時に 4 件の scenario が消失するリスクがある。

## Findings

### F-01 [MUST-FIX] MODIFIED セクションが既存 scenario を含んでいない

**場所**: `specs/propose-session/spec.md` — `## MODIFIED Requirements`

**問題**: "Propose Instruction Message Content (Updated)" を MODIFIED しているが、delta spec に含まれるのは新規追加の 2 scenario のみ:
- "Request type is injected into initial message"
- "Request type omitted for backward compatibility"

Baseline には以下 4 scenario が存在する:
1. "Propose instruction message content"
2. "openspec CLI workflow in system prompt"
3. "Delta spec generation is schema-driven"
4. "buildProposeMessage signature unchanged"

MODIFIED は requirement 全体の置換として解釈されるため、merge 後にこれら 4 scenario が消失する。

**修正案**: 以下のいずれか:
- (A) 既存 4 scenario + 新規 2 scenario の計 6 scenario を MODIFIED セクションに全て記載する
- (B) "buildProposeMessage signature unchanged" は現実と乖離しているため REMOVED (or 修正して更新)、残り 3 scenario は維持して合計 5 scenario とする

### F-02 [SHOULD-FIX] "buildProposeMessage signature unchanged" scenario が現実と乖離

**場所**: Baseline `propose-session/spec.md` — Scenario: buildProposeMessage signature unchanged

**問題**: 現行のシグネチャは既に `(requestContent, slug, branch?, dynamicContext?)` の 4 引数だが、このシナリオは「`requestContent` and `slug` parameters (with optional `branch`), consistent with the current signature」と述べており陳腐化している。本変更で第 5 引数 `requestType?` を追加するとさらに乖離が拡大する。

**修正案**: このシナリオを現行シグネチャ + 新規引数を反映した内容に更新する。例:

```
#### Scenario: buildInitialMessage signature
- **WHEN** `buildInitialMessage()` is called
- **THEN** the function accepts `requestContent`, `slug`, optional `branch`, optional `dynamicContext`, and optional `requestType` parameters
```

## Positive Observations

- design.md の D1-D5 は全て技術的に妥当。ソースコード（L141-148、buildInitialMessage の現行シグネチャ）との整合性を確認済み
- tasks.md の粒度・順序・受け入れ基準が明確
- `{{REQUEST_TYPE}}` パターンは spec-review-system.ts:85/189 の前例に準拠しており一貫性がある
- ADDED Requirement のシナリオ（type=spec-change / new-feature / bug-fix の 3 パターン）は request.md の要件を正確にカバー
- セキュリティ: `requestType` は `ParsedRequest.type`（ローカル request.md から parse）→ テンプレート replace。注入リスクなし

## Alignment Check

| request.md 要件 | design/tasks カバレッジ | delta spec カバレッジ |
|---|---|---|
| §1 Completion Checklist 追加 | D1, T-01 ✓ | ADDED Requirement ✓ |
| §2 `{{REQUEST_TYPE}}` 注入 | D2/D3/D4, T-02/T-03/T-04 ✓ | MODIFIED Requirement ✓ |
| §3 テスト | D5, T-05/T-06 ✓ | (テストは spec 対象外) |
| §4 spec authority 反映 | — | `specs/propose-session/spec.md` に作成 ✓ |

## Required Actions

1. **F-01**: MODIFIED セクションに既存 baseline scenario を含める（消失防止）
2. **F-02**: "buildProposeMessage signature unchanged" scenario を現行 + 新規シグネチャに更新
