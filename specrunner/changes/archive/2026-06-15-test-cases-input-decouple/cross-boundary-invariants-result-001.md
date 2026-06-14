# Cross-Boundary Invariants Review — test-cases-input-decouple — iter 1

## Meta

- **reviewer**: cross-boundary-invariants
- **verdict**: approved
- **scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | observation | `src/core/command/pipeline-run.ts` | ResumeCommand は input-completeness 検算を行わないが、これは設計通り | 不要（設計上の意図） | no |

---

## Detailed Analysis

### 検査観点と結果

#### 1. `required: false` — executor の `required !== false` フィルタとの整合（✅ 問題なし）

`executor.ts:156` は `reads.filter(r => r.required !== false)` で必須集合を作る。
`code-review.ts` と `custom-reviewer.ts` の `test-cases.md` read に `required: false` を付けたことで、
この集合から除外され `STEP_INPUT_MISSING` が発火しなくなる。

`IoRef.verify` は **writes 専用**（`step-types.ts` の JSDoc で明記: "writes only; ignored for reads"）。
request.md が "verify: false" と表現していた点を design.md が D1 で正しく修正し、
実装も `required: false` を使っている。**既存の executor の implicit contract を破っていない。**

#### 2. producer 保証（output gate）— `test-case-gen.writes()` 未変更による継続（✅ 問題なし）

`output-verify.ts:producedContractsFromWrites` は `verify !== false` の write を `produced`/`halt` contract に変換する。
`test-case-gen.writes()` は `test-cases.md` を `verify` 無効化せず宣言したまま（変更なし）なので、
output gate は consumer を soft 化しても標準 pipeline での producer 保証を独立に維持する。

`code-review` の必須 read が外れても、出力検証の責任は `test-case-gen` 自身の `writes()` 宣言に残っている。
**「safety を肩代わりしていた必須 read を外した → safety 喪失」の懸念は成立しない。**

#### 3. `validateDescriptorInputCompleteness` の B-5 適合（✅ 問題なし）

`descriptor-input-completeness.ts` に `fs` / `child_process` の import は存在しない（grep 確認済み）。
既存の `core-invariants.test.ts` が `src/core/pipeline/` 全体に対し
`readFile|readdir|existsSync|child_process|execSync|spawnSync` を grep で検査しており、
新ファイルも同じスコープに含まれる。違反は CI で自動検出される。

#### 4. probe state と `reads()`/`writes()` の代表値（✅ 問題なし）

`makeProbe()` が `steps: {}` / `type: "spec-change"` / `adr: true` の最小 state を構成する。

- `nextIteration()` → 1、`latestIteration()` → 0（全ステップで統一）
- iteration suffix 正規化 `-\d+\.md$` → `.md` で writer の `*-001.md` と reader の `*-000.md` が一致する
- `test-cases.md`（suffix なし）は正規化対象外で不変
- `adr-gen.writes()` は `adr: true` で path を返し、`conformance.reads()` はそれを要求しないため false positive なし
- `custom-reviewer` が `reads()` で返す `design.md`/`tasks.md` は `design` step の `writes()` が産む（fast を含む全 descriptor で satisfied）

**iteration 正規化の過剰マッチリスク**: `-\d+` は必ずハイフン付きで suffix の終端。`test-cases.md` のような通常ファイル名に誤マッチしない。T-06-1 が「producer を外した fixture が violation を返す」ことを明示的に確認しており、false-negative マスクは発生しない。

#### 5. `VALIDATOR_PROBE_SLUG` によるパス整合（✅ 問題なし）

`pipeline-run.ts` が ambient inputs に `requestMdPath(VALIDATOR_PROBE_SLUG)` を渡し、
validator 内部の `makeProbe()` も同じ `VALIDATOR_PROBE_SLUG` で `deps.slug` を設定する。
全 step の `reads()`/`writes()` が `deps.slug` でパスを解決するため、
ambient path と step が宣言する read path が同一 slug で一致する。
**slug 不整合による false positive/negative はない。**

#### 6. preflight 実行順序（✅ 問題なし）

`prepare()` の実行順序:
1. `loadReviewerDefinitions` + `validateReviewerDefinitions`（既存）
2. `getPipelineDescriptor` + `assertRuntimeSupportsScope`（既存）
3. `composeReviewerDescriptor` → `validateDescriptorInputCompleteness`（**新規、合成後を検算**）
4. `bootstrapJob`（新規 validator が先行するため job state は violation 時に作られない）

D4 の設計意図（「着手前 preflight・state を汚さない」）に正確に対応している。

#### 7. ResumeCommand — 検算非実施（low / observation）

`ResumeCommand` は `validateDescriptorInputCompleteness` を呼ばない。
これは設計上の意図: job 開始時に検算済み、custom reviewer snapshot は immutable で resume 後も不変。
再 validate しても同じ結果が返るだけであり、validator の追加は不要かつ無意味。

ただし将来 reviewer 定義の hot-reload 機能（現状なし）が入った場合は resume にも検算を足す必要がある。
現時点では問題なし。

#### 8. `PIPELINE_REGISTRY` のテスト内ミューテーション（✅ 問題なし）

`pipeline-run-input-completeness.test.ts` が `beforeEach`/`afterEach` で `PIPELINE_REGISTRY` にフィクスチャを追加・削除している。
Vitest は test file を独立 worker で実行するため `registry-invariants.test.ts` の「3件ちょうど」アサーションと競合しない。

#### 9. 依存方向 (B-1〜B-4)（✅ 問題なし）

`descriptor-input-completeness.ts` の import:
- `./types.js` → domain ✅
- `../step/types.js` → domain ✅
- `../../state/schema.js` → shared-kernel ✅
- `../port/step-context.js` → ports ✅

adapter への参照なし。B-1/B-2 を満たす。

#### 10. `StepDeps = StepContext` の型整合（✅ 問題なし）

`step-types.ts:54` に `export type StepDeps = StepContext;` と明示されており、
`makeProbe()` が返す `deps: StepContext` を `step.reads(state, deps)` に渡すことは型上完全に正しい。

---

## Summary

変更が黙って破る不変条件は**発見されなかった**。

主要な保証の移し替え（consumer 必須 read → producer output gate）は実コードレベルで検証済みであり、
「保証が消える」懸念は design.md D2 が実測に基づいて否定している。
新 validator は pure function として正しく配置され、B-5 を満たし、
既存の preflight スロットに整合するかたちで組み込まれている。

- **verdict**: approved
