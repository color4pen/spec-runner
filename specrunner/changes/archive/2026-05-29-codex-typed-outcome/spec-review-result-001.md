# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Design | design.md (D4) | retry prompt に `reason: "no-tool-call"` を流用しているため、プロンプト文面が「tool を呼べ」という内容になるが、実際の仕組みは outputSchema による JSON 強制。agent が「tool 呼び出し」指示を受けても Codex CLI 側の outputSchema 制約が優先するため実害はなく、design でも "文面は tool 呼び出し名義だが意味的に同等" と明記されている。将来 prompt を outputSchema 向けに調整する余地はある。 | 許容可。実装時に outputSchema 専用の retry prompt を別途 `buildPrompt` に追加するか、既存 `no-tool-call` メッセージに outputSchema 文脈での補足を入れることで改善できる。現状のままでも動作に支障なし。 |
| 2 | LOW | Design | design.md (Risk: outputSchema 時の agent 挙動変化) | `resultFilePath === null` の step では `resultContent` に JSON 文字列が入る。executor は `toolResult` populated 時に `resultContent` を verdict 確定に使わないため verdict への影響はないが、job state / log の可読性が低下する。 | 許容可。tasks.md に "resultContent が JSON 文字列になる step がある場合は history 記録上の制約として注記する" レベルの対応で十分。verdict / pipeline 挙動への影響なし。 |

## Summary

### 構造・形式チェック

- **request.md**: type = spec-change（frozen behavior が baseline spec の MUST 要件として明文化されているため適切）、スコープ境界・受け入れ基準・escalation パスが明確。✅
- **design.md**: SDK 調査テーブルで `in-process MCP tool API 無 / outputSchema 有` を確認。D1–D7 で決定理由・alternatives・risks を網羅。Open Questions なし。✅
- **tasks.md**: T-01（interface 拡張）→ T-08（delta spec）まで acceptance criteria 付きで完結。実装者が迷わない粒度。✅
- **delta spec**: 正規パス `specrunner/changes/codex-typed-outcome/specs/tool-driven-step-completion/spec.md` に配置。`## Requirements` に新要件（MUST / SHALL 含む）、`## Removed` に `"Codex adapter の frozen behavior"` でベースライン名と完全一致。4 つの Scenario（Given/When/Then）を含む。✅

### コントラクト整合性

- `AgentRunContext.policy.reportTool` / `AgentRunResult.toolResult` / `followUpAttempts` は既に `src/core/port/agent-runner.ts` に定義済み（R2/R3 実装済み）。codex adapter が同契約に乗るだけで port 変更なし。✅
- `outputSchema` = `TurnOptions.outputSchema` は SDK の documented API（README に記載）。追加依存なし。✅
- degrade path（`toolResult: null` + `reason: "no-tool-call"`）は baseline spec の "halt は invalid-input reason のみ" 規則と整合。✅

### セキュリティ

- 変更範囲は `src/adapter/codex/` 配下のみ。新しい外部入力・ネットワーク経路・認証境界なし。
- `JSON.parse(turn.finalResponse)` はモデル出力のパース。ユーザー入力を直接 parse する経路ではないため injection リスクなし。
- `buildOutputSchema` は code-defined zodSchema から生成するため、ユーザー制御データは介在しない。
- OWASP Top 10 観点で新規リスクなし。✅
