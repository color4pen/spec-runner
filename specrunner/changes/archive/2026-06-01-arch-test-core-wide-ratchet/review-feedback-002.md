# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `tests/unit/architecture/arch-allowlist.ts` L145-151 | `preflight.ts` L136 のパターン `"Record<string, string | undefined>,"` はコードのフォーマットに依存したフラジルなパターン。末尾カンマが prettier によって整形されると null ポインタになりうる。現在は正しく L136 を L105/L121 と区別して機能しており実害はない。 | 将来 preflight.ts を修正する burn-down request (B6-preflight) の際に、より安定したパターン（例: `resolveSpecRunnerApiKey` の関数名）に差し替えること。本 change では対応不要。 | no |
| 2 | low | testing | `tests/unit/architecture/core-invariants.test.ts` L224, L244 | iteration 001 から持ち越し: B-3/B-4 テストが `expect(true).toBe(true)` の no-op。設計 (D3/タスク) で src-wide change への意図的な deferral と明記されており、テスト count 上は pass するが実スキャンがゼロ。 | iteration 001 で `Fix: no` 確定済み。後続の src-wide enforcement change で対応される。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.80

## Summary

iteration 001 の唯一のブロッカー（Finding 1 HIGH: B-8 grep が `cfg.runtime` を拾えない穴）が正しく修正されている:

- `core-invariants.test.ts` L348 の B-8 パターンが `"(config|cfg)\\.runtime"` に拡張済み ✓
- `arch-allowlist.ts` に `cfg.runtime ?? "local"` / `cfg.runtime === "managed"` の 2 エントリが追加済み ✓

実ファイル検証で全 B-8 違反（preflight.ts 3 箇所 + executor.ts 4 箇所）が allowlist に網羅されていることを確認。B-6 違反（preflight.ts 3 行 + diagnostic.ts + commands.ts 2 行）も同様に全カバー済み。

検証結果:
- `bun run test` 287 files / 3278 tests all green ✓
- `arch-allowlist.ts` 13 エントリ全て file/invariant/tracking を保持 ✓
- regression guard テスト（T-04: 5 ケース）が detection mechanism を実証 ✓
- delta spec の 4 要件（Core Layer Has No Direct SDK Dependencies / Architecture Enforcement Covers Entire Core / Ratchet Allowlist Documents Known Divergences / Closure Model Prevents Unknown Edges）全て存在 ✓

残存する no-op（B-3/B-4）と B-5 false positive リスクは前回 `Fix: no` 確定であり、本 change の受け入れ基準を満たす範囲で問題なし。
