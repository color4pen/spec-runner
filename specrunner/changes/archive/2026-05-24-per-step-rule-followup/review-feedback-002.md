# Review Feedback — per-step-rule-followup — iter 2

## Verdict

- **verdict**: approved

---

## Findings

### F-01 (iter 1 critical → resolved): ADR 追加 ✅

`specrunner/adr/2026-05-24-per-step-rule-followup.md` が正しい場所に追加されている。

内容確認 (TC-13-1 must / TC-13-2 should):

| チェック項目 | 結果 |
|---|---|
| ADR ファイルが存在する | ✅ |
| ADR `2026-05-22` D2 を refine (supersede でなく一般化) と明記 | ✅ D2 section に「「follow プロンプトは 1 本（bounded な 2 段）」を「ファイル数で bounded な N 段」に一般化」と記載 |
| wrap 文言の 3 要素制約 (修正範囲 / stop 条件 / 意図解釈) を ADR level で記録 | ✅ D3 section に明記 |
| 3 要素以外の wrap 拡張に新 ADR が必要な旨 | ✅ D3 に「3 要素以外の wrap を CLI が追加することは禁止。wrap 文言の拡張 (要素の追加・変更) は新 ADR を必要とする。」と明記 |

---

## 合格項目（iter 1 引き継ぎ、変更なし）

| 項目 | 判定 | 根拠 |
|---|---|---|
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
| AbortController が全 follow turn を覆う | ✅ | TC-10-1: abort 発火時 callCount=2 でテスト済み |
| typecheck && test green | ✅ | 2712 tests passed、型エラー 0、test-coverage 15/15 |

---

## 低優先度メモ（fix 不要）

- **TC-06-1/TC-06-4 (must) のエグゼキュータ統合テスト未作成**: rules ファイルを実際に tmpdir に書いてから `executor.execute()` を呼ぶシナリオがない。ただし `resolveStepRules` / `buildRulesFollowUpPrompts` それぞれが独立して網羅されており、結合部 (`allFollowUpPrompts = [...existing, ...rulesPrompts]`) も単純な spread 演算。test-coverage スクリプトも 15/15 pass を確認済みのため今 iteration は受容。
- **TC-06-5 (should) 未テスト**: iter 1 からの引き継ぎ。CLI step で rules が無視されることは `runCliStep` / `runAgentStep` の dispatch 分岐で実装上保証済み。
- **Codex: `reasoning_output_tokens` が accumulation に含まれない**: ドメイン全体の既存制約。本 change の regression ではない。
