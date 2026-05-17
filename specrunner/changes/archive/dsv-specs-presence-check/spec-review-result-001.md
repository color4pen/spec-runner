# Spec Review Result

- **verdict**: approved
- **reviewer**: spec-reviewer (manual)
- **date**: 2026-05-18
- **iteration**: 1

## Coverage Matrix

| request 要件 | design | tasks | delta spec | 判定 |
|---|---|---|---|---|
| 1. validateDeltaSpecPaths に Step 5 追加 | §2 配置, §3 スキャン | Task 2 (2a/2b/2c) | Req + Scenario 1,2,4 | OK |
| 2. DeltaSpecViolationReason 新メンバー | §4 violation 形式 | Task 1 | Req 本文 | OK |
| 3. dsv step verdict 経路 + fixer hint | §5 step 側, §6 fixer | Task 3, Task 4 | Req 本文 (needs-fix 経路) | OK |
| 4. unit test 5件 + integration test 1件 | — | Task 5 (TC-V-11〜15), Task 6 (TC-DSV-04) | — | OK |
| 5. spec authority 反映 | — | Task 7 | specs/pipeline-orchestrator/spec.md | OK |
| 6. reproduction test (任意) | — | 明示なし | — | OK (request で任意) |

## Source Code Verification

### Step 5 配置の正当性

delta-spec-validator.ts:87-93 で `specs/` 不在時に early return する経路を確認。Step 5 を Step 1 の前に配置する設計判断は正しい。Step 4 の後に置くと `specs/` 不在ケースで到達不能になる。

### `deps.request.type` の到達可能性

- `DeltaSpecValidationStep.run()` は `CliStepDeps` を受ける
- `CliStepDeps` extends `StepDeps` = `StepContext`
- `StepContext.request: ParsedRequest`
- `ParsedRequest.type: string` (src/core/request/types.ts:14)

→ `deps.request.type` は型安全にアクセス可能。

### 後方互換

- `requestType?: string` (optional) → 既存テスト・呼び出しは引数追加不要
- `DeltaSpecViolationReason` union 拡張は additive → 既存 pattern match に影響なし
- `formatViolationsTable` は reason を文字列としてレンダリング → 新 reason をそのまま処理

### makeFsMock との整合

TC-V-11〜15 の mock 構成を検証:
- TC-V-11/12: `design.md` のみ → `readdir(specs/)` が ENOENT → `specsFound = false` → violation ✅
- TC-V-13/14: 同上だが type が対象外 → check スキップ → 既存フロー → `ok: true` ✅
- TC-V-15: `specs/my-cap/spec.md` あり → `specsFound = true` → 既存 Step 1-4 継続 ✅

## Delta Spec vs Baseline

delta spec は `pipeline-orchestrator` capability に ADDED Requirement として配置。既存の transition table / loop guard / event / progress format の Requirement と競合なし。dsv の内部 validation 挙動を定義する Requirement が baseline に存在しなかったため、additive に追加する判断は妥当。

4 Scenario (spec-change→needs-fix, new-feature→needs-fix, bug-fix→approved, spec-change+specs存在→継続) は request の受け入れ基準を網羅。

## Security

- requestType は `ParsedRequest.type` (parser 出力) から取得。ユーザー入力の直接注入経路なし
- fs 操作は DI 経由。changePath はパイプライン制御下で path traversal リスクなし
- OWASP Top 10 該当なし

## Minor Notes (non-blocking)

1. **needs-fix result file の "How to Fix" セクション**: 現行テンプレートは「Move all delta spec files to canonical path」等の既存ガイダンスのみ。`no-specs-for-required-type` 固有の「新規作成」ガイダンスがない。ただし violation の `suggested` フィールドと fixer prompt hint (Task 4) で補完されるため blocking ではない。実装時に "How to Fix" に 1 行追加すると fixer の判断精度が上がる可能性あり。

2. **要件 6 (reproduction test)**: request で「任意」と明記。tasks に含まれていないが受け入れ基準上は問題なし。
