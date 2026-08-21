# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照した spec ファイル

- `request.md` — 問題背景・要件・受け入れ基準・architect 評価済み設計判断
- `design.md` — D1〜D5 の設計判断（判定基準移行・証跡の durable 化・inconclusive 扱い・TamperStatus 安定・port method 追加）
- `tasks.md` — T-01〜T-05 の実装タスク
- `spec.md` — 4 要件・6 シナリオ
- `test-cases.md` — TC-001〜TC-028（28 件）

### 参照した実装ファイル

- `src/core/step/bite-evidence/tamper.ts` — 現行 `checkTamperStatus(lineage, currentHash)` の signature と実装（行 37-74）
- `src/core/step/bite-evidence/step.ts` — 現行 tamper 計算ブロック（fold + digestArtifacts + checkTamperStatus、行 46-77）
- `src/core/step/bite-evidence/gate.ts` — tamper mismatch → failed routing（行 104-111）・GateDeps 定義
- `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-032 群（checkTamperStatus 直呼び）・TC-006（tamper mismatch → failed）
- `src/core/step/bite-evidence/__tests__/evidence-base-gate.test.ts` — tamperStatus: "mismatch" 直渡し（TC-007）
- `src/core/step/bite-evidence/__tests__/gate-empty-selection.test.ts` — tamperStatus: "mismatch" 直渡し（TC-014）
- `src/core/port/runtime-strategy.ts` — RuntimeStrategy 全体（listWorktreeChanges optional、RealRuntimeStrategy 交差型、行 836-874）
- `src/core/pipeline/registry.ts` — `import { BiteEvidenceStep } from "../step/bite-evidence/step.js"` の依存方向を確認（行 24）
- `src/core/resume/canon-provenance.ts` — `declaredCanonWritesForStep` の実装パターン（getPipelineDescriptor 使用）
- `src/core/resume/apply-canon.ts` — `operator-apply: ${slug}` commit メッセージの確認（行 142）
- `src/core/step/commit-orchestrator.ts` — appendLineage best-effort（行 269-291）・commit メッセージ形式
- `src/core/step/spec-fixer.ts` — test-cases.md の `writes()` 宣言（行 99-107）
- `src/core/step/test-case-gen.ts` — test-cases.md の `writes()` 宣言（行 74-76）
- `src/core/step/write-scope.ts` — `protectedCanonPaths` の確認（行 62-72）
- `src/util/git-exec.ts` / `src/core/runtime/local.ts` — 既存 port method の実装パターン確認

### 検証した観点

1. **spec.md の規約適合性**: 全 Requirement に SHALL/MUST 入り normative keyword 確認 ✓。全 Requirement に Scenario 確認 ✓。
2. **test-cases.md の完全性**: 4 要件 6 シナリオがすべて Spec Scenario 由来 TC に対応している ✓。inconclusive・証跡欠落・authorizedWriters 空集合・例外フォールバックも TC に網羅 ✓。
3. **設計判断の内部一貫性**: D1（provenance 移行）→D2（durable 証跡）→D3（inconclusive proceed）→D4（TamperStatus 安定）→D5（port method 追加）の論理連鎖を確認 ✓。
4. **受け入れ基準とテストの対応**: 受け入れ基準 1〜5 が TC-001〜TC-025 に網羅されている ✓。
5. **既存テストの無変更 green 保証**: `evidence-base-gate.test.ts`・`gate-empty-selection.test.ts` が `tamperStatus` を直渡しする形式で記述されており、TamperStatus union および gate routing を変えなければ無変更で green になる ✓。
6. **commit メッセージ形式の一致**: `commit-push.ts:581` が `` `${step.name}: ${slug}` ``、`apply-canon.ts:142` が `` `operator-apply: ${slug}` `` を生成することを確認 ✓。
7. **circular import の危険性**: tasks.md T-02 が `authorizedCanonWriterSteps` を `tamper.ts` に配置するよう指定しているが、`tamper.ts` は `pipeline/registry.ts` → `bite-evidence/step.ts` → `tamper.ts` の import chain に既に含まれており、`tamper.ts` が `getPipelineDescriptor` を import すると静的な circular import が生じることを確認 → **F-001** として報告。
8. **TC-017 カテゴリ**: `authorizedCanonWriterSteps` は標準 pipeline descriptor の全 step の `writes()` を走査するため、実 descriptor への依存が必要であり "unit" テストとして自己完結しない → **F-002** として報告。

## 検証できなかった項目

- `LocalRuntime` / `ManagedRuntime` の実装ファイル詳細（既存 port method 実装パターンは `runtime-strategy.ts` のドキュメントから確認）
- `getPipelineDescriptor` が throw する条件の網羅的テスト（`canon-provenance.ts` の try/catch 実装パターンで代替を確認）

上記 2 点は本 request のスコープに影響しないため影響なし。

## Findings 詳細

### F-001（HIGH）: `authorizedCanonWriterSteps` を `tamper.ts` に配置すると circular import が生じる

**ファイル**: `specrunner/changes/tamper-provenance-baseline/tasks.md`  
**該当箇所**: T-02「`test-cases.md` の認可された所有 step 集合を pipeline descriptor から導出する pure helper を追加する」→ `tamper.ts` への配置指示

**問題の詳細**:

現行の module 依存グラフ（import chain）は以下のとおり:

```
src/core/pipeline/registry.ts
  └─ import { BiteEvidenceStep } from "../step/bite-evidence/step.js"  (行 24)
       └─ import { checkTamperStatus } from "./tamper.js"  (行 30)
```

T-02 の指示どおり `tamper.ts` に `authorizedCanonWriterSteps` を配置し、`getPipelineDescriptor` を import すると:

```
tamper.ts
  └─ import { getPipelineDescriptor } from "../../pipeline/registry.js"
       └─ import { BiteEvidenceStep } from "../step/bite-evidence/step.js"
            └─ import { checkTamperStatus } from "./tamper.js"  ← CYCLE
```

この circular import が生じる。TypeScript および Bun の ESM は静的 circular import を「ビルドエラー」として拒否しないが（live binding で回避）:

- `registry.ts` のコメント「Dependency direction: registry → step / types / kernel」が示す意図した一方向性が崩れる
- `tamper.ts` が初期化される時点で `getPipelineDescriptor` の binding が未解決である期間が生じ、初期化順序依存のバグリスクが残る
- `canon-provenance.ts` の `declaredCanonWritesForStep`（tasks.md が「同型」と参照する先例）は `core/resume/` に属し registry の import chain **外** に存在するため同様の cycle を持たない。`bite-evidence/tamper.ts` は chain **内** であり先例と構造が異なる

**影響**: `typecheck` 自体は通過する可能性が高いが、アーキテクチャ上の一方向依存原則を侵し、運用上の混乱リスクがある。

**修正案**（いずれか選択）:

1. **helper を `step.ts` の inline 関数に格上げする**  
   `step.ts` も `registry.ts` の import chain に含まれるため同様の cycle が生じる。不採用推奨。

2. **helper を `bit-evidence` chain 外のモジュールに分離する**  
   例えば `src/core/step/bite-evidence/tamper-auth.ts` を新設し、当該ファイルは `step.ts` ではなく executor レイヤーからのみ import する。ただしこれも `step.ts` → `tamper-auth.ts` → `registry.ts` → `step.ts` の cycle になる可能性がある。パス設計を慎重に行うこと。

3. **descriptor を パラメータとして受け取る形に変える**  
   `authorizedCanonWriterSteps(canonPath, descriptor, state, deps)` のように `PipelineDescriptor` を引数で受け取り、内部では `getPipelineDescriptor` を import しない。呼び出し元（executor または step のより上位のオーケストレーション層）が descriptor を注入する。cycle が構造的に排除される。採用推奨。

4. **authorized writers を executor から `CliStepDeps` 経由で注入する**  
   `CliStepDeps` に `authorizedCanonWriters?: ReadonlySet<string>` を追加し、executor が pipeline descriptor から事前に計算して渡す。`tamper.ts` および `step.ts` は `registry.ts` を import しない。最もクリーンな分離だが `CliStepDeps` の型定義変更を伴う。

**tasks.md を修正して、上記いずれかの方式を採用することを明示する必要がある。**

---

### F-002（LOW）: TC-017 のカテゴリが "unit" だが実態は integration テスト

**ファイル**: `specrunner/changes/tamper-provenance-baseline/test-cases.md`  
**該当箇所**: TC-017「authorizedCanonWriterSteps が標準 pipeline で test-case-gen / spec-fixer / operator-apply を含む」— `**Category**: unit`

**問題の詳細**:

TC-017 の WHEN は `authorizedCanonWriterSteps("<slug>/test-cases.md", state, deps)` を呼び出し、THEN は「返り値が少なくとも `{test-case-gen, spec-fixer, operator-apply}` を含む」を確認する。この検証には実際の pipeline descriptor 全体（`test-case-gen.ts`・`spec-fixer.ts` の `writes()` 実装を含む）が必要であり、純粋な unit テストの範囲（モックのみで検証可能）を超える。

`declaredCanonWritesForStep` の先例に相当するテストが仮に存在する場合も、実 descriptor を使った統合的確認が必要となる。

**影響**: 低い。Category を誤認識しても実装・検証に支障はなく、`typecheck && test` の green 判定にも影響しない。ただし `Automated` カウントの内訳（unit vs integration の比率）に誤差が生じる。

**修正**: TC-017 の `**Category**` を `unit` から `integration` に変更する。
