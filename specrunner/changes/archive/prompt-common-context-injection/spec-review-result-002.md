# Spec Review Result — prompt-common-context-injection (iteration 2)

- **reviewer**: spec-reviewer
- **date**: 2026-05-20
- **verdict**: approved

---

## Summary

spec-review-result-001 の HIGH 3 件・MEDIUM 6 件・LOW 3 件の指摘に対して spec-fixer が適切に対応済み。delta spec と tasks.md の整合性ギャップはすべて解消されており、実装段で implementer が躓く要因は残っていない。

---

## H1/H2/H3 修正確認

| # | 修正状況 |
|---|----------|
| H1 (AUTHORITY_SPEC_GUARD 縮小方針) | delta spec §"Fragment 集約 export" 本文に「4 セクション → 2 セクション縮小。旧 MUST NOT / 正規経路 セクションは廃止する (MUST)」が明記済み ✅ |
| H2 (T-06g 削除後期待形) | tasks.md T-06g に「削除後の期待形: Security セクション本文は 1 文のみ」が明示済み ✅ |
| H3 (Scenario vs tasks 範囲ズレ) | delta spec §"System prompt の builder 経由構成" 本文に「全 11 prompt の Scenario 網羅は fragment-coverage.test.ts の構造的検証で代替する」が明記済み ✅ |

## MEDIUM 修正確認

| # | 修正状況 |
|---|----------|
| M1 (T-06g code-review 文構造注記) | T-06g に「機械的削除ではなく段落を再構成する必要がある」が追記済み ✅ |
| M2 (T-06a stage 番号誤り注記) | T-06a に「"stage 3" は元々誤り（実際は stage 5）だが本タスクで削除されるため修正不要」が追記済み ✅ |
| M3 (T-09 negative assertion 脆弱性) | T-09 に「`あなたは` および `あなたの` を含まないことを negative assertion で検証する (いずれか一方でも含む場合は test 失敗)」が明記済み ✅ |
| M4 (build-fixer / adr-gen 副作用) | T-11 の `bun run test green` で構造的にカバー。adr-gen step が ADR に副作用を記録することは pipeline 自動動作に委ねる設計として許容 ✅ |
| M5 (T-10 test 名の意図ズレ) | T-10 が「PR #339 同型ケースの予防: ADR 正規 path が全 agent prompt に注入されていることの構造保証」に書き直し済み ✅ |
| M6 (T-05a named export 制約) | T-05a に「`TEST_CASE_GEN_SYSTEM_PROMPT` の export symbol 名と他の named export は変更しないこと」が追記済み ✅ |

## LOW 修正確認

| # | 修正状況 |
|---|----------|
| L1 (T-07 拡張数の不明示) | T-07 冒頭に「既存 8 prompt から全 11 prompt (追加: test-case-gen / request-generate / request-review) に拡張する」が明示済み ✅ |
| L2 (ADR への `<user-request>` 防御記録) | adr-gen step の自動生成に委ねる設計として許容 ✅ |
| L3 (受け入れ基準の文字数測定が曖昧) | request.md の受け入れ基準は「各 agent prompt の文字数が削減されることを目安に確認」のまま。実装上は tasks.md T-06 の個別削除指示が具体的なので影響なし。実装者は T-06 の checkbox を根拠にする ✅ |

---

## Findings (新規)

### LOW

| # | Category | File | Description | Fix |
|---|----------|------|-------------|-----|
| L1 | completeness | `tasks.md` | spec-review-system.ts が design.md の Affected Files に「規律記述削除（該当があれば）」と記載されているが、tasks.md T-06 には対応エントリがない | 実装者への注意事項として許容範囲。design.md に「該当があれば」の qualifier があるため implementer が判断可能。ブロッカーでなし |
| L2 | completeness | `tasks.md` | request-review-system.ts は T-05c で buildSystemPrompt 経由に移行するが、T-06 に規律記述削除エントリがない（CLI one-shot なので影響は限定的） | 同上、許容範囲 |

---

## Requirements Coverage

| # | request.md の要件 | Status |
|---|-----------------|--------|
| 1 | SPEC_RUNNER_COMMON_CONTEXT 新設 (4 層) | ✅ covered |
| 2 | buildSystemPrompt 改修 (自動 prepend) | ✅ covered |
| 3 | 既存個別 prompt から規律記述を削除 | ✅ covered |
| 4 | 既存 fragment との重複整理 | ✅ covered |
| 5 | fragment-coverage.test.ts の更新 | ✅ covered |
| 6 | PR #339 同型ケース再現 test | ✅ covered (構造保証として再定義済み) |
| 7 | SPEC_RUNNER_COMMON_CONTEXT の 3 人称文体 | ✅ covered |
| 8 | builder.test.ts の更新 | ✅ covered |
| 9 | bun run typecheck && bun run test green | ✅ covered |
| 10 | ADR への 5 項目記録 | ✅ covered (adr-gen step 自動生成、design.md に設計根拠が充実) |

---

## Delta Spec Format Check

- path: `specs/prompt-fragment-registry/spec.md` — 正規 path 準拠 ✓
- 形式: 新形式 `## Requirements` 単一セクション ✓
- header 一致: 全 5 Requirement が baseline と一致 (AUTHORITY_SPEC_GUARD 縮小方針が本文に明記) ✓
- Scenario 必須: 全 Requirement に 1 つ以上あり ✓
- normative keyword: 全 Requirement 本文に MUST/SHALL あり ✓
- Delta spec validation result: approved ✓
- 違反: なし
