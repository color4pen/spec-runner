# Code Review Feedback — iteration 001

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
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | maintainability | `src/store/job-state-store.ts` | `fail()` 経由で `transitionJob` が history entry を自動付与するため、呼び出し元が別途 `appendHistory` を呼ぶと二重記録になる。設計 D1 が「forensic ログとして情報増加は許容」と明示しているので blocker ではない。 | 不要。設計済みの trade-off。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.25

## Summary

### 受け入れ基準チェック

- [x] **status 直書き 3 箇所が `transitionJob` 経由に変換済み**
  - `fail()` (`job-state-store.ts`): `transitionJob(state, "failed", { trigger: "store-fail", ... })` ✓
  - exit-guard (`exit-guard.ts`): `transitionJob(state, "awaiting-resume", { trigger: "exit-guard", ... })` ✓
  - signal-handler (`local.ts`): `transitionJob(current, "awaiting-resume", { trigger: "signal-handler", ... })` ✓
- [x] **`arch-allowlist.ts` の B-9 エントリ 0 件**: ARCH_ALLOWLIST に `invariant: "B-9"` エントリなし ✓
- [x] **B-9 arch test green**: 実違反ゼロ（live scan passes）、regression guard は空 allowlist でも synthetic violation を検出 ✓
- [x] **各遷移が VALID_TRANSITIONS で合法**: `running → failed` ✓、`running → awaiting-resume` ✓。race condition（`awaiting-merge → awaiting-resume`）は throw→catch→swallow で state 不変（D3 明記済）✓
- [x] **bypass 対象が grep authoritative に 3 件確定**: T-01 scan で B9-store-fail / B9-exit-guard / B9-signal-handler の 3 件確定。残存マッチはすべてテスト除外対象（create() init / コメント行 / core/verification/）✓
- [x] **verification 4 コマンド green**: build ✓ / typecheck ✓ / lint ✓ / test (287 files, 3284 tests) ✓

### 遷移合法性の独立検証

`VALID_TRANSITIONS` を直接参照して確認:

| 遷移 | 合法か | 備考 |
|------|--------|------|
| `running → failed` (`fail()`) | ✓ | `running` → `{awaiting-resume, awaiting-merge, failed, ...}` |
| `running → awaiting-resume` (exit-guard) | ✓ | guard `status !== "running" → continue` で保証 |
| `running → awaiting-resume` (signal-handler) | ✓ | 通常ケース |
| `awaiting-merge → awaiting-resume` (signal race) | ✗ (throw) | catch → swallow → `process.exit(130)` → state 不変。`managed.ts` と同パターン ✓ |
| `failed → failed` (二重呼び出し) | noop | same-status 判定で state 変更なし ✓ |

### テスト構成の確認

- **suppression test 削除**: `"does not flag status writes that are correctly allowlisted (B-9 allowlist suppression)"` がファイルに存在しないことを確認 ✓
- **regression guard 存在**: `"detects new direct status write not in allowlist (B-9 regression guard)"` (line 666) が残存 ✓
- **live scan 存在**: `"grep finds no direct JobState.status writes ..."` (line 428) が残存 ✓
- B-1 entries（3 件）が allowlist に維持されていることを確認 ✓

### local.ts vs managed.ts パターン一致 (TC-017)

両ファイルとも `canTransition` guard なしで `transitionJob` を直呼び。例外は既存 `catch` で swallow。完全一致 ✓
