# Cross-Boundary Invariants Review — anthropic-step-model-refresh
## Iteration 001

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

Diff は `src/config/model-registry.ts`・`src/core/step/*.ts` 14 ファイル・`src/cli/init.ts`・`src/core/command/reviewers-new.ts` および対応テストへの値差し替えで構成される。変更していないコードのうち、新既定値（`claude-sonnet-5` / `claude-opus-5`）に依存する境界を優先的に検証した。

---

## Verified Invariants

### 1. Registry prerequisite — `resolveProvider` が CONFIG_INVALID を throw しない

`BUILTIN_MODEL_REGISTRY` 内に `"claude-sonnet-5"` および `"claude-opus-5"` が存在する（model-registry.ts 行 23–24）。`DispatchingAgentRunner.run` は `resolveProvider(resolvedConfig.model, merged)` を呼び出すが、両モデルとも `provider: "anthropic"` として解決される。新既定による `CONFIG_INVALID` throw は発生しない。

`TC-007` がこれを機械的に assert している。

### 2. 旧モデル key の backward-compat — user config ピンは引き続き動作する

`claude-sonnet-4-6` / `claude-opus-4-6[1m]` / `claude-sonnet-4-5` はいずれも `BUILTIN_MODEL_REGISTRY` に残存（削除されていない）。project local config（`.specrunner/config.json`）に `"steps": { "design": { "model": "claude-opus-4-8[1m]" } }` の明示ピンがあるが、`claude-opus-4-8[1m]` も registry に存在するため、dispatch 時の `resolveProvider` は問題なく解決する。

### 3. `designModel` 省略の invariant — scaffold 構造が変わらない

`PROVIDER_DEFAULTS.anthropic.designModel` は引き続き `undefined`。`init.ts:119` の `if (defaults.designModel !== undefined)` ゲートが `steps.design` ブロックを書き出さないパスを維持する。`init.test.ts` の `expect(config.steps?.design).toBeUndefined()` は変更なし（fresh scaffold ケースが `toBeUndefined` を通す）。

### 4. preserve-existing-config invariant — 既存 config は上書きされない

`init.ts:108` の `let steps = existingConfig.steps;` → `if (!steps) { ... }` ガードが変更されていない。`existingConfig.steps` が truthy なら新 `defaultModel` は使われない。`tests/init.test.ts` 行 527（fixture `claude-sonnet-4-6`）と行 539（期待値 `claude-sonnet-4-6`）がともに未変更であり、preserve test が内部矛盾しない。

### 5. `[1m]` suffix の不在 — `claude-opus-5[1m]` は registry に存在しない

`BUILTIN_MODEL_REGISTRY` に `claude-opus-5[1m]` のエントリは無い。`DESIGN_AGENT_MODEL` を `"claude-opus-5"` にした（サフィックスなし）ことで、registry 未登録 SKU を参照する risk は無い。

### 6. `queryOneShot` モデル解決 — registry validation を経由しない

`query-one-shot.ts` は `DEFAULT_ONE_SHOT_MODEL` を `getStepExecutionConfig` のデフォルトに渡すが、その後 `resolveProvider` を呼ばず SDK に直接渡す。`claude-sonnet-4-5` → `claude-sonnet-5` の変更は `CONFIG_INVALID` を発生させる経路を持たない。

### 7. pricing table — 新モデルのコスト計算が可能

`src/core/usage/pricing.ts` に `"claude-opus-5"` および `"claude-sonnet-5"` のエントリが存在する（行 113–129）。usage accumulation・attestation comment の cost 計算が新既定モデルで機能する。

### 8. test preserve lines の整合性（D7 の核心）

`tests/init.test.ts` の更新内容を確認した。

| 行 | 内容 | 変更有無 |
|----|------|---------|
| 40 | fresh scaffold 期待値 | `claude-sonnet-5` に更新 ✓ |
| 102 | fresh scaffold 期待値 | `claude-sonnet-5` に更新 ✓ |
| 159 | input fixture | `claude-sonnet-4-6` のまま ✓ |
| 236 | input fixture | `claude-sonnet-4-6` のまま ✓ |
| 363 | input fixture | `claude-sonnet-4-6` のまま ✓ |
| 499 | fresh scaffold 期待値 | `claude-sonnet-5` に更新 ✓ |
| 514 | fresh scaffold 期待値 | `claude-sonnet-5` に更新 ✓ |
| 527 | preserve test input fixture | `claude-sonnet-4-6` のまま ✓ |
| 539 | preserve test 期待値 | `claude-sonnet-4-6` のまま ✓ |

行 527（fixture）と行 539（期待値）が同一値を保つことで「上書きしない」検証が内部矛盾しない。D7 の核心的注意点が正しく実装されている。

---

## Finding

### F-001: `specrunner/project.md` の config 例が更新後の既定と乖離する

**Severity**: medium  
**File**: `specrunner/project.md`  
**Lines**: 103–118（`byRequestType` config 例）

`specrunner/project.md` の `byRequestType` 設定例が `claude-sonnet-4-6`（`steps.defaults.model`）および `claude-opus-4-6[1m]`（`byRequestType.spec-change.model` 等）を示している。このファイルは `needsProjectContext: true` を宣言する step（design / implementer / code-review / spec-review / conformance / request-review / custom-reviewer / regression-gate / test-materialize — 計 9 step）の initial message に `step-context-builder.ts:71` 経由で注入される。

更新後は実コードの既定（`claude-sonnet-5` / `claude-opus-5`）と docs 例が乖離する。pipeline agent がこの例を参照して config を生成・提案すると旧世代のモデル名が書き出される。runtime は旧名を registry で解決できる（backward-compat）ため即時障害は起きないが、将来 config 生成 step や design step が例を参照して「推奨設定」を書き出す際に旧世代が混入する。

**なぜ cross-boundary か**: 本変更のスコープは `src/core/step/`, `src/config/`, `src/core/command/`, テスト期待値。`specrunner/project.md` はスコープ外だが、pipeline agent の knowledge-injection 機構（`needsProjectContext`）を介して新既定値の伝達に影響する。「project.md の config 例がコードの既定と同期している」という暗黙の前提を本変更が黙って破った形になる。

**Mitigation**: `specrunner/project.md` の `byRequestType` 例内のモデル名を `claude-sonnet-5` / `claude-opus-5` に追随させる（例: 設定例の意図を変えず、モデル名のみ更新）。

---

## Evidence Summary

| 検証項目 | 結果 |
|---------|------|
| registry に claude-sonnet-5 / claude-opus-5 が存在する | ✓ |
| resolveProvider が新モデル名で CONFIG_INVALID を throw しない | ✓ |
| claude-opus-5[1m] が registry に無い → [1m] 省略は正しい | ✓ |
| 旧モデル key が backward-compat のまま残る | ✓ |
| designModel 省略 → anthropic scaffold に steps.design が出ない | ✓ |
| preserve-existing-config ガードが変更されていない | ✓ |
| init.test.ts 行 527/539 の整合（fixture == expectation == 旧モデル） | ✓ |
| pricing table に claude-sonnet-5 / claude-opus-5 が存在する | ✓ |
| queryOneShot が resolveProvider を経由しない（safe） | ✓ |
| .specrunner/config.json の claude-opus-4-8[1m] が registry に存在する | ✓ |
| specrunner/project.md の config 例が新既定と乖離している | ⚠ F-001 |
