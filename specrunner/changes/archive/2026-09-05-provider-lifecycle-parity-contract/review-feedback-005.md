# Review Feedback — provider-lifecycle-parity-contract — iteration 5

## Summary

前回 iteration 4 の HIGH finding (F-01: tasks.md 実測値の乖離) が修正されたことを確認した。  
その他 4 件（F-02〜F-05）は未修正のまま残存している。

全テスト green（12785 passed）、production コード変更なし（`git diff main...HEAD -- src/` = 0 行）。

以下 4 件を指摘する。中: 2、低: 2。

---

## F-01 のステータス（iteration 4 HIGH finding）

**FIXED** — `tasks.md` 実測値が以下のように修正されていることを確認した。

- `shared`: 19（旧: 20）
- `provider-specific`: 12（旧: 11）
- `absent 期待値`: `codex 7、claude-code 1`（旧: `codex 6、claude-code 2`）

---

## Findings

### F-02 [MEDIUM / fixable] `REQUIRED_CASE_IDS` 内部の重複チェックが ratchet に存在しない

**File**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts`

**問題**:  
T-01 受け入れ条件に「`REQUIRED_CASE_IDS` に重複がない（`new Set(...).size === 31`）」と明記されているが、`ratchet:duplicate` describe ブロック（line 100–110）は `CONTRACT_CASES` の重複のみを検査する。`REQUIRED_CASE_IDS` 自体の重複は検査されない。

具体的失敗シナリオ: 誰かが `"main-work.success-minimal"` を 2 回書いて `REQUIRED_CASE_IDS` が 32 件になった場合、`ratchet:id` は set 比較のため重複を吸収し fail しない。`REQUIRED_CASE_IDS` 内部の重複チェックが存在しないため検出されない。

**修正**: `ratchet:duplicate` ブロック（または `ratchet:id` ブロック）に以下のテストを追加する:

```typescript
test("no duplicate IDs in REQUIRED_CASE_IDS", () => {
  const unique = new Set(REQUIRED_CASE_IDS);
  expect(unique.size, `REQUIRED_CASE_IDS has duplicates`).toBe(REQUIRED_CASE_IDS.length);
});
```

---

### F-03 [MEDIUM / fixable] universal invariant に `completionReason` の値域チェックが存在しない

**File**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` (lines 192–200)

**問題**:  
設計 D7 は「`completionReason` は `success` / `error` / `timeout` のいずれかであること」をユニバーサル invariant として明記しているが、`assertExpectations()` 内に対応するアサーションが存在しない。

実装されているのは:
- `completionReason === "success"` → `error` が undefined
- それ以外 → `error` が defined

しかし `completionReason` が `"partial"` や `"aborted"` などの想定外の値を返した場合、per-case で `completionReason` を宣言していない absent ケース（例: `metrics.invocation-metrics-presence` の codex 側）ではこの不正値を検出できない。

**修正**: `assertExpectations()` 内のユニバーサル invariant セクションに以下を追加する:

```typescript
expect(
  ["success", "error", "timeout"],
  `${tag} [universal]: completionReason must be one of success|error|timeout`,
).toContain(result.completionReason);
```

---

### F-04 [LOW / fixable] `zod/v4-mini` サブパスインポートの使用（脆弱なパス）

**File**: `tests/unit/contract/provider-lifecycle/harness/_scenario-helpers.ts` (line 13)

**問題**:

```typescript
import { boolean } from "zod/v4-mini";
```

このインポートは Zod 内部のサブパスエクスポートを直接参照している。本プロジェクトの production コードおよび他のテストファイルは `import { z } from "zod"` を使用しており、サブパスには依存していない。`zod/v4-mini` は Zod の実装詳細であり、Zod のバージョンアップ・パッケージ再構成で破損するリスクがある。

**修正**: 以下のように変更する:

```typescript
import { z } from "zod";
// ...
zodSchema: { ok: z.boolean() },
```

---

### F-05 [LOW / fixable] `errorHintPresent` フィールドが `ProviderExpectation` インターフェースに存在しない

**File**: `tests/unit/contract/provider-lifecycle/case-table.ts`

**問題**:  
設計 D3 および tasks.md T-05 は観測項目として `errorHintPresent?` を明示している（「error の code と hint の有無」）。しかし実装された `ProviderExpectation` インターフェースには `errorHintPresent` フィールドが存在せず、`error.hint` の有無をケース別にアサートする手段がない。

`timeout.*` ケースでは `tracker.timeoutHint()` が hint を設定することが port doc comment で保証されているが、それを contract table で検証できない状態になっている。

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
| TC-042 (≥64 tests) | ✓ 64 tests confirmed |

未カバー箇所:
- `errorHintPresent` に相当する hint アサーション（F-05）
- `REQUIRED_CASE_IDS` 自身の重複チェック（F-02）
- `completionReason` 値域チェック（F-03）

## 検証した項目

- `git diff main...HEAD -- src/` の出力が 0 行であることを確認（production 無変更）
- `tasks.md` 実測値が iteration 4 F-01 の修正内容（19/12、codex 7、claude-code 1）と一致することを確認
- `contract-ratchet.test.ts` の `ratchet:duplicate` が `REQUIRED_CASE_IDS` 内部重複を検査していないことを確認（F-02）
- `provider-lifecycle-parity.test.ts` の `assertExpectations()` に `completionReason` 値域チェックがないことを確認（F-03）
- `harness/_scenario-helpers.ts` line 13 に `import { boolean } from "zod/v4-mini"` が残存することを確認（F-04）
- `case-table.ts` の `ProviderExpectation` に `errorHintPresent` フィールドが存在しないことを確認（F-05）
- `verification-result.md`: build / typecheck / test (12785 passed) / lint すべて green
- `UNEXPLAINED:` prefix を含む reason が 0 件であることをコード検索で確認

## 検証できなかった項目

- `REQUIRED_CASE_IDS` に重複 ID を 1 件追加した場合に ratchet:id が fail すること（手動操作が必要。ratchet の set 比較ロジックから重複を検出しないことは設計上明らか）
- `completionReason` に `"partial"` 等の想定外の値を返すプロバイダー実装を注入した場合にユニバーサル invariant が fail すること（production コード変更が必要なため未実施）
- `zod/v4-mini` → `z.boolean()` への修正後に全テストが green を維持すること（production コード変更を要しないが、実行環境での確認未実施）
- `errorHintPresent: true` を宣言した場合に `timeout.inactivity-watchdog` の両プロバイダーで hint が実際に設定されることの直接確認（port doc comment の保証に基づく）
