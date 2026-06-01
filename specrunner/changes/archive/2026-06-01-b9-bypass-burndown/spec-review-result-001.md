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
| 1 | LOW | correctness | `src/core/step/executor.ts` | `executor.ts:218-219` では `store.fail()` が `transitionJob` 経由になった後、同じ catch ブロック内で `store.appendHistory()` を呼ぶため、history に遷移 entry が 2 件追加される（transitionJob 由来 + appendHistory 由来）。design の Risk 欄で「forensic ログの重複は情報増加として許容」と明示されており blocking ではない。ただし将来的に history を解析するコードが重複を前提としない場合に混乱の余地がある。 | 本 change では対応不要。将来 `fail()` 呼び出し元の `appendHistory` と `transitionJob` 付与 entry の統合が必要であれば別 request で対処する。 |

## Summary

### Architecture
- **依存方向**: `store/ → state/lifecycle.ts` の import 追加は persistence → shared-kernel の下方向であり、既存の `schema.ts` import と同層。B-3 違反なし。
- **責務分離**: status mutation を `transitionJob` に集約するのは B-9 invariant の趣旨に合致。純粋関数への委譲であり副作用の所在が明確。

### Correctness

**D1 (`fail()`)**: 10 call-site 全てを検証した。`runner.ts:191` は `diskState.status === "running"` ガード付き、`executor.ts` / `executor-helpers.ts` は step 実行中エラーハンドラ（prior state は `running`）、`runner.ts:118,169` は job create 直後（`create()` が `running` で初期化）。`running → failed` は `VALID_TRANSITIONS` で合法。`failed → failed` の noop 保護も `transitionJob` が担う。

**D2 (`exit-guard.ts`)**: `if (state.status !== "running") continue;` が先行ガードとして機能。`running → awaiting-resume` は合法。

**D3 (`local.ts` signal-handler)**: race condition（`awaiting-merge` 時の SIGINT）で `transitionJob` が throw しても既存の `catch {}` が swallow し `process.exit(130)` へ進む。state は変更されず正しい挙動。`managed.ts` との一貫性も担保。

**D4 (suppression test 削除)**: B-9 regression guard（空 allowlist で synthetic violation を検出）と live B-9 scan test（bypass 解消後は violation ゼロ）はいずれも B-9 エントリ空でも機能する。suppression test は空 allowlist で fail するため削除は必然。`filterViolations` の suppression 動作は B-1 エントリ（3 件残存）でカバー継続。

### Completeness
T-01〜T-07 が全受け入れ基準をカバー。T-01 の grep scan による全件確定、T-02〜T-04 の各 bypass 修正、T-05 の allowlist 全削除、T-06 の suppression test 削除、T-07 の verification green 確認まで抜け漏れなし。
