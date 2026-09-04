# Review Feedback — provider-lifecycle-parity-contract — iteration 4

## Summary

全テスト通過（parity driver 64 tests, ratchet 23 tests）、production コード変更なし、SDK 封じ込め維持。
設計の意図と構造は正確に実現されている。

以下 5 件を指摘する。高: 1、中: 2、低: 2。

---

## Findings

### F-01 [HIGH / fixable] tasks.md 実測値 の shared/provider-specific 件数と absent 内訳が実装と乖離している

**File**: `specrunner/changes/provider-lifecycle-parity-contract/tasks.md` (lines 401–417)

**問題**:
tasks.md の「実測値」節には以下が記載されている:

```
| shared（両 provider とも supported） | 20 |
| provider-specific | 11 |
| absent 期待値 | 8（codex 6、claude-code 2）
```

しかし実際の実装は:

- `shared` = **19** / `provider-specific` = **12**  
  （contract-ratchet.test.ts line 161–163 が `shared === 19` および `provider-specific === 12` をアサートし、全テスト green）
- absent 期待値 = **8**（codex **7**、claude-code **1**）

**原因**: `transient.budget-exhausted` が design.md では `shared` 4件のひとつとして設計されたが、実装時に Claude と Codex の error code が異なる（`CLAUDE_CODE_QUERY_FAILED` vs `CODEX_SDK_ERROR`）ことが判明し `provider-specific` に変更された。この変更は case-table.ts ヘッダーコメントと ratchet には反映されているが、tasks.md 実測値には反映されていない。

また absent 内訳についても:
- claude-code absent は `report.parse-failure-diagnostics` の 1 件のみ（tasks.md は 2 と誤記）
- codex absent は `report.settle` / `context.rollover` 系 3 件 + `metrics` 系 4 件 = 7 件（tasks.md は 6 と誤記）
  
  タスクの合計 passed 計算式 `29+25=54` は `30+24=54` が正しい。

**修正**: tasks.md 実測値の shared/provider-specific 件数を 19/12 に、absent 内訳を「codex 7、claude-code 1」、passed 計算を `30+24=54` に修正する。

---

### F-02 [MEDIUM / fixable] `REQUIRED_CASE_IDS` 内部の重複チェックが ratchet に存在しない

**File**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`

**問題**:
T-01 受け入れ条件に「`REQUIRED_CASE_IDS` に重複がない（`new Set(...).size === 31`）」と明記されているが、`contract-ratchet.test.ts` の `ratchet:duplicate` (line 101–109) は `CONTRACT_CASES` の重複チェックしか行っていない。`REQUIRED_CASE_IDS` 自身の重複は検査されない。

現在の `REQUIRED_CASE_IDS` に重複はないため即時の影響はないが、誰かが誤って ID をコピーして追加した場合、ID 集合の set-comparison は重複を吸収するため `ratchet:id` を抜けてしまう。

具体的失敗シナリオ: `REQUIRED_CASE_IDS` に `"main-work.success-minimal"` を 2 回書く（合計 32 件）。case-table.ts に同じ名前の case が 31 件ならば、`REQUIRED_CASE_IDS.filter((id) => !caseIds.has(id))` は 1 件（重複コピー分）を返し ID ratchet が fail するが、`new Set(REQUIRED_CASE_IDS).size === 30 !== 31` の検査がなければ ratchet:duplicate では検出されない。

**修正**: `ratchet:duplicate` describeブロック（または `ratchet:id` ブロック）に以下を追加する:
```typescript
test("no duplicate IDs in REQUIRED_CASE_IDS", () => {
  const unique = new Set(REQUIRED_CASE_IDS);
  expect(unique.size, `REQUIRED_CASE_IDS has duplicates`).toBe(REQUIRED_CASE_IDS.length);
});
```

---

### F-03 [MEDIUM / fixable] universal invariant に `completionReason` の値域チェックが存在しない

**File**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` (lines 194–200)

**問題**:
設計 D7 は「`completionReason` は `success` / `error` / `timeout` のいずれかであること」をユニバーサル invariant として明記しているが、`assertExpectations()` 内に対応するアサーションが存在しない。

現在実装されているのは:
- `result.completionReason === "success"` のとき `error` が undefined
- それ以外のとき `error` が defined

しかし `completionReason` が `"partial"` や `"aborted"` などの想定外の値を返した場合でも、`completionReason` を per-case で宣言していない absent ケース（例: `metrics.invocation-metrics-presence` の codex 側）ではこの不正値を検出できない。

**修正**: `assertExpectations()` 内のユニバーサル invariant セクションに以下を追加する:
```typescript
expect(
  ["success", "error", "timeout"],
  `${tag} [universal]: completionReason must be one of success|error|timeout`
).toContain(result.completionReason);
```

---

### F-04 [LOW / fixable] `zod/v4-mini` サブパスインポートの使用（脆弱なパス）

**File**: `tests/unit/contract/provider-lifecycle/harness/_scenario-helpers.ts` (line 13)

**問題**:
```typescript
import { boolean } from "zod/v4-mini";
```

このインポートは Zod 内部のサブパスエクスポート (`zod/v4-mini`) を直接参照している。本プロジェクトの production コードおよび他のテストファイルは `import { z } from "zod"` を使用しており、サブパスには依存していない。`zod/v4-mini` は Zod の実装詳細であり、Zod のバージョンアップ・パッケージ再構成で破損するリスクがある。

**修正**: 以下のように変更する:
```typescript
import { z } from "zod";
// ...
zodSchema: { ok: z.boolean() },
```

または既存の `parseBaseReportInput` が使用する Zod ユーティリティと同じ import 元に揃える。

---

### F-05 [LOW / fixable] `errorHintPresent` フィールドが `ProviderExpectation` インターフェースに存在しない

**File**: `tests/unit/contract/provider-lifecycle/case-table.ts`

**問題**:
設計 D3 および tasks.md T-05 は観測項目として `errorHintPresent?` を明示している（「error の code と hint の有無」）。しかし、実装された `ProviderExpectation` インターフェース（lines 38–172）には `errorHintPresent` フィールドが存在せず、`error.hint` の有無をケース別にアサートする手段がない。

現在のケース（特に `timeout.*`）では `tracker.timeoutHint()` が hint を設定することが port doc comment で保証されているが、それを contract table で検証できない。

**修正**: `ProviderExpectation` インターフェースに以下を追加する:
```typescript
/** When true: result.error must have a non-empty hint string */
errorHintPresent?: boolean;
```
あわせて `assertExpectations()` で対応するアサーションを追加し、少なくとも `timeout.inactivity-watchdog` の両 provider 期待値に `errorHintPresent: true` を宣言する。

---

## Coverage Check

| テストケース ID (test-cases.md) | カバー状況 |
|---|---|
| TC-001〜TC-004 (ID ratchet / duplicate / area) | ✓ ratchet:id / ratchet:duplicate / ratchet:area |
| TC-007 / TC-008 (one-scenario both harnesses / no real SDK) | ✓ parity driver + SDK containment ratchet |
| TC-009 (timeout without wall-clock) | ✓ fake timer + stall-until-abort pattern |
| TC-010〜TC-012 (shared / reason / absent) | ✓ ratchet:shared / ratchet:reason / driver absent-as-assertion |
| TC-015 (matrix absent fields never set) | ✓ matrix universal check in assertExpectations |
| TC-016 (supported fields observed ≥1) | ✓ execution ledger in provider-lifecycle-parity.test.ts |
| TC-023 / TC-024 (no-skip / pair coverage) | ✓ ratchet:no-skip / ledger pair check |
| TC-028〜TC-031 (SDK containment / D5 isolation) | ✓ ratchet:sdk-containment / ratchet:d5-isolation |
| TC-040 (case-table does not import case-ids) | ✓ ratchet:d5-isolation |
| TC-042 (≥64 tests) | ✓ 64 tests confirmed by verification |

未カバー箇所:
- `errorHintPresent` に相当する hint アサーション（F-05）
- `REQUIRED_CASE_IDS` 自身の重複チェック（F-02）

## 検証した項目

- `git diff main...HEAD -- src/` の出力が空であることを確認（production 無変更）
- 既存テストファイル（`src/adapter/*/__tests__/`、`tests/unit/adapter/`、`tests/unit/contract/agent-runner-contracts.test.ts`）に追加・変更・削除がないことを確認（T-10 条件満足）
- `UNEXPLAINED:` prefix を含む reason が 0 件であることをコード検索で確認（D11 / T-09 条件満足）
- 全 31 件の case ID が `REQUIRED_CASE_IDS` と集合一致することを ratchet 構造から確認
- `verification-result.md`: build / typecheck / test / lint すべて green
- `contract-ratchet.test.ts` の ratchet 項目（ID / duplicate / area / shared / reason / UNEXPLAINED / skip / registry / field-matrix / no-skip / SDK-containment / D5-isolation の 13 項目）が全通過していることを確認
- `provider-lifecycle-parity.test.ts` が 64 tests（62 case×provider + ledger 2 件）で全通過していることを確認
- case-table.ts の全 31 件について classification / expectations / reason の内容をレビュー
- result-field-matrix.ts の 15 フィールドエントリを確認し、port doc comment との整合を検証
- `harness/claude-code.ts` と `harness/codex.ts` が実 SDK loader（`loadClaudeAgentSdk` / `loadCodexSdk`）を呼ばず DI 注入のみで動作することを確認
- SDK containment ratchet により `src/adapter/claude-code/` と `src/adapter/codex/` のみが provider SDK を import していることを確認
- ratchet が `shared === 19` / `provider-specific === 12` をアサートし green であることを確認し、tasks.md 実測値（20/11）との乖離を特定

## 検証できなかった項目

- `REQUIRED_CASE_IDS` から 1 件削除したときの ratchet:id fail（手動操作が必要な確認。ratchet 構造上 fail することは設計から明らか）
- `it.skip` を 1 箇所挿入したときの ratchet:no-skip fail（同上）
- `AgentRunResult` に field を追加したときの field matrix ratchet fail（production コード変更を要するため未実施。設計上 fail することは `ts.createSourceFile` による抽出ロジックから確認済み）
- 同コマンドを 3 回連続実行して timeout case が flaky でないことの直接確認（verification 環境でのシングル実行 green のみ確認。fake timer + stall-until-abort パターンの安定性は設計 D10 および既存テスト実績から根拠づけ）
