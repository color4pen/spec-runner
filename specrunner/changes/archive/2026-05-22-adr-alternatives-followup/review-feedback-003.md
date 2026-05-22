# Code Review — adr-alternatives-followup — iter 3

## Summary

iter 2 の needs-fix 指摘（F-001: TC-07 THEN 節の誤記 + テスト未実装、F-002: JSDoc 不正確）がいずれも解消されている。全受け入れ基準を満たし、must TC はすべてカバーされており、verification は green。

---

## iter 2 指摘の解消確認

### F-001 (medium) — TC-07 THEN 節修正 + テスト追加

**test-cases.md**: TC-07 のタイトルが「フォールバックしない」→「フォールバックする」に修正され、THEN 節も `"static-value"` を期待する記述に統一された。✅

**executor.test.ts (L1195–L1239)**: 2 件が追加されている。

- `TC-06-new`: `getFollowUpPrompt` が `"dynamic-value"` を返し、静的 `"static-value"` より優先されることを確認 ✅
- `TC-07`: `getFollowUpPrompt` が `undefined` を返したとき、`??` により静的 `"static-value"` にフォールバックすることを確認 ✅

両テストとも `makeCapturingFollowUpRunner` で ctx を捕捉し、`captured.ctx!.followUpPrompt` を直接アサートしており、設計 D2 の `??` 解決式を正確に検証している。

### F-002 (low) — JSDoc 修正

`types.ts` L142–145 の JSDoc から「getMaxTurns と同型」という誤った記述が除去され、機能説明に置き換わっている。✅

---

## Findings

### F-001 [low] JSDoc "undefined を返すと follow turn は実行されない" が部分的に不正確

**場所**: `src/core/step/types.ts` L144

**問題**: `getFollowUpPrompt` が `undefined` を返した場合、`??` 演算子により静的 `followUpPrompt` にフォールバックするため、静的値が設定されているステップでは follow turn が発火しうる。JSDoc の記述は「`getFollowUpPrompt` が `undefined` を返したとき = follow turn が実行されない」と読めるが、これは静的 `followUpPrompt` も未設定の場合にのみ成立する。

**影響**: 現在の唯一の実装消費者 `AdrGenStep` は静的 `followUpPrompt` を持たないため実害はない。ただし将来 `getFollowUpPrompt` と静的 `followUpPrompt` を両方持つステップを追加する実装者が混乱する可能性がある。

**修正方法（任意）**: 例 — `「undefined を返すと静的 followUpPrompt にフォールバックする。どちらも未定義の場合 follow turn は実行されない。」`

---

## Must TC カバレッジ確認

| TC | Priority | カバー |
|----|----------|--------|
| TC-01: adr:true → string 返却 | must | `adr-gen.test.ts` TC-ADR-STEP-05a ✅ |
| TC-02: adr:false → undefined 返却 | must | `adr-gen.test.ts` TC-ADR-STEP-05b ✅ |
| TC-03: prompt に "Alternatives Considered" 含む | must | `adr-gen.test.ts` TC-ADR-STEP-05c ✅ |
| TC-04: 修正専用 (判定なし) | must | `adr-gen.test.ts` TC-ADR-STEP-05d ✅ |
| TC-06: getFollowUpPrompt が静的より優先 | must | `executor.test.ts` TC-06-new ✅ |
| TC-07: undefined 返却時に静的フォールバック | must | `executor.test.ts` TC-07 ✅ |
| TC-08: getFollowUpPrompt 未定義時に静的採用 | must | `executor.test.ts` TC-05 ✅ |
| TC-10: AgentStep に optional method 追加 | must | `types.ts` L145 ✅ |
| TC-12: ADR validator 追加なし | must | diff stat 確認 ✅ |
| TC-13: adr-fixer step 追加なし | must | diff stat 確認 ✅ |
| TC-14: adr:false → followUpPrompt=undefined | must | getFollowUpPrompt 実装 ✅ |
| TC-15: DesignStep 静的 followUpPrompt 後方互換 | must | `executor.test.ts` TC-05 ✅ |
| TC-16: typecheck green | must | verification-result.md ✅ |
| TC-17: test green (2574 passed) | must | verification-result.md ✅ |

---

## 受け入れ基準チェック

| 受け入れ基準 | 判定 |
|---|---|
| `AdrGenStep` に `getFollowUpPrompt` が設定されている | ✅ |
| follow-prompt は「修正」を指示し「判定」を指示しない | ✅ (`追記せよ` あり、`判定せよ` なし) |
| follow-prompt は `adr: true` のみで発火し `adr: false` では undefined | ✅ |
| `adr: false` では adr-gen が no-op で終わる | ✅ |
| 機械 validator / adr-fixer step を追加しない | ✅ |
| `bun run typecheck && bun run test` が green | ✅ |

---

- **verdict**: approved
