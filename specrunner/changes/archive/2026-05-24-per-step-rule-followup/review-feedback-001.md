# Review Feedback — per-step-rule-followup — iter 1

## Verdict

- **verdict**: needs-fix

---

## Findings

### F-01: ADR 未追加（重大度: critical / must）

**TC-13-1 未充足。受け入れ基準「ADR D2 refine の新 ADR が追加される」に違反。**

`specrunner/adr/` に本 change 向けの新 ADR が存在しない。
`2026-05-23-managed-agent-runner-stage-extraction.md` が最新であり、それ以降のファイルがない。

- tasks.md の依存チャートに `T-10` が記載されているが、タスク本体が定義されていない（T-09 の次が T-11 に飛んでいる）。実装者がタスク未定義のため見落とした可能性が高い。
- design.md D10 には「新 ADR を起票」と明記されており、要件 9 / TC-13-1 (must) の充足が必要。

**修正内容:**

```
specrunner/adr/2026-05-24-per-step-rule-followup.md
```

ADR に記載すべき内容（design.md D10 準拠）:

1. ADR `2026-05-22-intra-step-follow-up-prompt` D2「follow プロンプトは 1 本」を「ファイル数で bounded な N 段」に一般化（supersede ではなく refine）
2. 既存の design step follow-up（`followUpPrompt: string`）は `followUpPrompts[0]` として引き続き有効
3. wrap 文言の 3 要素制約（修正範囲 / stop 条件 / 意図解釈）を ADR レベルで記録
4. wrap 文言の拡張には新 ADR が必要な旨を明記

---

## 合格項目（変更不要）

以下はすべて設計・要件を正しく充足している。

| 項目 | 判定 | 根拠 |
|------|------|------|
| T-01: `stepRulesDirRel` | ✅ | `src/util/paths.ts` 正しく実装、TC-01 テスト済み |
| T-02: `rules-resolve.ts` | ✅ | ソート・ENOENT・拡張子フィルタ・worktree パスすべてテスト済み |
| T-03: `rules-followup-prompts.ts` | ✅ | 3 要素 wrap・pure function・空配列 テスト済み |
| T-04: port 契約変更 | ✅ | `AgentRunContext.followUpPrompts?: string[]` に正しく移行、`followUpPrompt` 削除済み |
| T-05: `shouldRunFollowUp` N 段判定 | ✅ | 空配列 / undefined / error 各ケース テスト済み |
| T-06: executor rules 解決 | ✅ | 既存 followUpPrompt が先頭、rules が後続、正しく結合 |
| T-07: ClaudeCodeRunner N 段 loop | ✅ | queryFn 3 回・abort・usage 累積 テスト済み |
| T-08: CodexAgentRunner N 段 + Thread.id null 修正 | ✅ | `id: string \| null`・follow 3 回・null → sessionId undefined テスト済み |
| T-09: ManagedAgentRunner N 段 + graceful degradation | ✅ | SSE・polling 両経路で 2 件 follow、1 件失敗時残り続行 テスト済み |
| T-11: worktree パスでの rules 解決 | ✅ | mock で worktree cwd 正しく解決を確認 |
| requirement 4: RULES_MD_CONTENT 現状維持 | ✅ | 変更なし |
| requirement 10: project.md inline 注入維持 | ✅ | `needsProjectContext` パスは変更なし |
| requirement 11: AgentStep interface 不変 | ✅ | `followUpPrompt` / `getFollowUpPrompt` は AgentStep に残存 |
| AbortController が全 follow turn を覆う | ✅ | 1 本の controller で N 段を覆うことを abort テストで確認 |
| typecheck && test green | ✅ | verification-result: 2712 tests passed、型エラー 0 |

---

## 低優先度メモ（fix 不要）

- **TC-06-5 (should) 未テスト**: CLI step (verification / pr-create / delta-spec-validation) の rules が無視されることは、executor の `runCliStep` / `runAgentStep` の dispatch で実装上保証されているが、明示的なテストがない。should 優先度のため今 iteration は skip 可。
- **Codex usage 累積で `reasoning_output_tokens` が欠落**: `ModelUsage` 自体に `reasoning_output_tokens` フィールドがないため、このドメイン全体の既存制約。本 change の regression ではない。
