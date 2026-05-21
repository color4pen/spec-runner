# Spec Review Result: verification-tc-coverage

- **verdict**: approved
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer (round 3)

---

## Summary

spec-review-002 の 2 件の必須修正（C-1 再発: T-02 regex / M-1 残存: T-03 skipped 出力ロジック）が tasks.md に反映済みであることを確認した。design.md / tasks.md / delta specs の 3 者間の整合性に問題なし。承認。

---

## Confirmed Fixed (from round 2)

| 指摘 | 状態 |
|---|---|
| C-1 再発: tasks.md T-02 regex が `###` (h3 only) → section-scan アプローチ未反映 | ✅ 修正済み |
| M-1 残存: tasks.md T-03 に `writeVerificationResult` の skipped 出力ロジック変更が未明記 | ✅ 修正済み |

### C-1 確認詳細

tasks.md T-02 ステップ 2 が以下の section-scan アプローチに差し替えられている:

```
Priority: must の TC ID を section-scan アプローチで抽出する:
  - `^##[#]?\s+(TC-\d+(?:-\d+)*)` で TC section header を全列挙（h2 / h3 両対応）
  - 各 section の後続行群を次の `##` が出現するまで走査し、`\*\*Priority\*\*:\s*must` の行の存在で判定
  - bullet prefix（`- **Priority**: must`）と非 bullet（`**Priority**: must`）の両方を許容
```

design.md の記述と完全に一致している。「常に passed を誤返却する」バグは解消されている。

### M-1 確認詳細

tasks.md T-03 に以下が追記されている:

> `writeVerificationResult` の skipped 出力ロジックを変更: test-coverage phase が skipped かつ `p.stdout` が非空の場合は、hardcoded 文言 `"_(skipped — script not found in package.json)_"` の代わりに `p.stdout` を出力する（skip 理由を human-readable に表示するため）

design.md section 7 の方針と整合している。

---

## Full Spec Review (round 3)

### request.md 受け入れ基準の網羅確認

| 受け入れ基準 | 対応タスク / 設計箇所 |
|---|---|
| verification に test-coverage phase 追加、must TC 未実装で failed | T-01 / T-02 / T-03 / verification-runner delta spec |
| verification-result.md に未実装 TC リスト | T-03 (PhaseResult.stdout + Phase テーブル) |
| test-case-gen / implementer prompt に TC ID 規律 | T-04 / T-05 / delta specs |
| PR #331 同型ケース再現 test | T-10 |
| bun run typecheck && bun run test green | T-08 / T-09 |
| ADR 記録 | design.md ADR-1/2/3 |

全 6 件カバー済み。

### design.md 整合性

- ADR-1 (フラット型正規 + 両形式許容 grep): 合理的。test-case-gen prompt が既に `TC-{NNN}` を例示しておりゼロ変更が最小。
- ADR-2 (案 B: verification 集約): 合理的。implementer の `resultFilePath: null` 問題を回避し、既存の verification ↔ build-fixer ループに自然に統合される。
- ADR-3 (CLI 内部処理): 合理的。target project の package.json に依存しない設計原則と整合。
- `ScriptPhaseName = Exclude<PhaseName, "test-coverage">` の型設計: T-01 と整合し、`phaseName in PHASE_SCRIPTS` が型ガードとして機能する。

### tasks.md 整合性

- T-01: PhaseName / ScriptPhaseName / PHASE_SCRIPTS 型変更が明確 ✅
- T-02: section-scan アプローチが正しく記述 ✅
- T-03: writeVerificationResult の skipped ロジック変更が明記 ✅
- T-04〜T-06: prompt 変更内容が具体的 ✅
- T-07: 4 delta spec の作成対象と Requirement が明確 ✅
- T-08〜T-10: テストケースが受け入れ基準を網羅 ✅

### delta specs 整合性

- `verification-runner/spec.md`: 6 phase fail-fast / test-coverage 処理 / 不在時 skipped の Requirement と Scenario が揃っている ✅
- `implementer-session/spec.md`: TC ID 記載規律 + 暗黙スキップ禁止が明記されている ✅
- `test-case-generator/spec.md`: TC ID 一意性・grep 可能性の規律が明記されている ✅
- `build-fixer-session/spec.md`: test-coverage 失敗時の test 追加対処が明記されている ✅

### Security

file I/O（`node:fs/promises`）と文字列 grep のみ。ネットワーク・認証・外部入力処理なし。`bun:*` / `Bun.*` 禁止が tasks.md T-02 に明記されている。OWASP Top 10 該当なし。セキュリティ懸念なし。
