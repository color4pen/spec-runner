# Cross-Boundary Invariants Review — scope-unevaluable-fail-closed — iteration 001

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **iteration**: 001

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検査した境界

### 1. `executor.ts:717-728` — `verifyFindingRefs` と UNKNOWN finding の交差

**前提（変更前）**: `verifyFindingRefs` は `extraScopeFindings` が空配列であることを前提としていなかったが、実際には `origin:"scope"` の finding がそこに入ることはなかった。

**新挙動**: `canDeriveChangedFiles=false` のとき `extraScopeFindings = [UNKNOWN finding]` となり、`effectiveToolResult.findings` に合流する。`collectVerdictAffectingFindings` はこの finding を拾い（`resolution:"decision-needed"`）、`refs = [{ file: "specrunner/changes/<slug>/request.md", ... }]` として `verifyFindingRefs` に渡す。

**検証**:
- managed + `branch=null`: `verifyFindingRefs` は全 refs を non-existent と返す → `verdict = "escalation"` を再セット。ただし verdict はすでに decision-needed から `"escalation"` に確定済み。**実質的な副作用なし。**
- managed + branch あり: `getRawFile` でファイル存在確認。`specrunner/changes/<slug>/request.md` はパイプライン開始時に branch に存在するため通常 null にならない。ファイルが存在すれば non-existent リストに入らず verdict 変化なし。
- UNKNOWN finding が**決定済み**（`state.decisions` に登録）のとき: `filterUndecidedFindings` がそれを除外 → `affectingFindings` に入らない → `verifyFindingRefs` にその ref が渡されない → verdict は `"approved"` のまま維持される。

**判定**: 不変条件に違反しない。design.md の Risk 節に同型リスクが認識済みであり、いずれの経路でも望む出口（`awaiting-resume`）が変わらないことを確認した。

---

### 2. `decision-ledger.filterUndecidedFindings` — 再 escalation 抑止の不変条件

**前提**: finding key は `step|file|line|normalized-title|normalized-rationale` の連結で決定的に構築される。

**新挙動**: UNKNOWN finding の title（`"scope を検証できなかった（UNKNOWN）: runtime が changed-files を導出できない"`）は固定文言であり、breach finding の title（`"Scope exceeded: changes touch forbidden surfaces"`）とは異なる。slug が同一ならば `ctx.slug` が同一 → `file` も同一 → key が決定的に同一 → 人間解決後は `filterUndecidedFindings` により除外され再 escalation しない。

**検証**: `computeFindingKey` の実装を確認（`decision-ledger.ts:32-38`）。title と rationale を正規化して結合するため、UNKNOWN finding と breach finding の key は collide しない。scope-escalation.test.ts でも `computeFindingKey` の非衝突性を unit test で固定済み。

**判定**: 不変条件に違反しない。

---

### 3. `executor.ts:659-661` — judge/conformance 以外のステップへの影響

**前提**: `extraScopeFindings = []` の計算は `isJudgeStep || isConformanceStep` の条件で guard されており、request-review 等のステップでは常に `[]`。

**新挙動**: `computeExtraScopeFindings` 内の fail-closed 分岐（`canDeriveChangedFiles?.() === false`）は、executor から呼ばれるときにしか到達しない。request-review は `isJudgeStep || isConformanceStep` に当てはまらないため、`computeExtraScopeFindings` 自体が呼ばれず fail-closed 分岐も到達しない。

**判定**: request-review ステップを checkpoint に設定した場合、fail-closed は発火しない（#689 の既存挙動と同じ）。これは仕様の空白だが、本 request の設計上 checkpoint は judge/conformance step を想定しており、scope 外。不変条件の違反ではない。

---

### 4. B-5 arch invariant — `scope.ts` 純粋性

**前提**: `src/core/pipeline/scope.ts` は pure module（fs / child_process を import しない）。B-5 arch test が `core/pipeline/` 配下の child_process call-site を grep で固定している。

**新挙動**: `synthesizeScopeUnverifiableFinding` を `scope.ts` に追加。I/O 系の import を一切持たない純関数。

**確認**:
```
import type { PermissionScope } from "./types.js";           // domain
import type { JobState } from "../../state/schema.js";       // shared-kernel
import type { Finding, DecisionOption } from "../../kernel/report-result.js";  // shared-kernel
import { matchGlob } from "../reviewers/glob-match.js";      // domain
```
`node:fs` / `child_process` の import なし。B-5 の grep が自動でカバー。

**判定**: 不変条件に違反しない。

---

### 5. B-11 arch test — grep パターンの正確性

**前提**: grep `"implements RuntimeStrategy"` は `"implements RealRuntimeStrategy"` にもマッチしうる（`RuntimeStrategy` が `RealRuntimeStrategy` の部分文字列であるため）。

**新挙動**: arch test は `!m.content.includes("RealRuntimeStrategy")` フィルタで正しくこれを除外している。

**検証**: 文字列マッチの詳細確認:
- `"implements RealRuntimeStrategy"` → `"RuntimeStrategy"` は `"RealRuntimeStrategy"` の suffix → grep パターン `implements RuntimeStrategy` が `implements RealRuntimeStrategy` にマッチする
- フィルタ `!m.content.includes("RealRuntimeStrategy")` によりこれを除外 → bare `implements RuntimeStrategy` のみが残る

regression guard テスト（`src/core/runtime/local.ts:81` の `implements RealRuntimeStrategy` が false-positive にならないことを確認）も green。

**判定**: 不変条件に違反しない。grep パターンと除外フィルタは正確に設計されている。

---

### 6. reviewer activation path (`executor.ts:202-214`) — `listChangedFiles` 契約の不変性

**前提**: activation gate は `deps.runtimeStrategy?.listChangedFiles(...)` を直接呼び、`canDeriveChangedFiles` を参照しない。managed では `listChangedFiles → []` → 条件マッチせず → 過少起動（fail-safe）。

**新挙動**: `canDeriveChangedFiles` predicate は activation gate のコードパスに一切触れない（`executor.ts:202-214` は変更なし）。`listChangedFiles` の型・契約・戻り値もすべて不変。

**判定**: 不変条件に違反しない。

---

### 7. `scope-check.ts` — B-1 (domain→adapter 非依存) の維持

**新挙動**: `scope-check.ts` は `deps.runtimeStrategy.canDeriveChangedFiles?.()` を port interface (`RuntimeStrategy`) 経由で呼ぶ。`LocalRuntime` / `ManagedRuntime` の具象クラスを直接 import していない。

**import 確認**:
```typescript
import type { Finding } from "../../kernel/report-result.js";     // shared-kernel
import type { PermissionScope } from "../pipeline/types.js";      // domain
import type { JobState } from "../../state/schema.js";            // shared-kernel
import type { PipelineDeps } from "../types.js";                  // domain
import { ... } from "../pipeline/scope.js";                       // domain
```
adapter / runtime 層への import なし。

**判定**: B-1 不変条件を維持。

---

### 8. `RealRuntimeStrategy` 型エイリアスと `runtimeStrategy?: RuntimeStrategy` field の型整合

**前提**: `PipelineDeps.runtimeStrategy` は `RuntimeStrategy`（optional）として型付けられている（`src/core/types.ts:91`）。managed/local は `buildDeps()` で `runtimeStrategy: this` をセットする。

**新挙動**: `LocalRuntime` / `ManagedRuntime` は `implements RealRuntimeStrategy` に変更。`RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean }` は `RuntimeStrategy` の部分型なので、`runtimeStrategy?: RuntimeStrategy` フィールドへの代入は TS 型チェックを通過する。`scope-check.ts` は `canDeriveChangedFiles?.()` の optional call-site で呼ぶため、`RuntimeStrategy` 越しに正しく動作する。

**判定**: 型整合性に問題なし。

---

## 全体判定

検査した全 8 境界において、既存機構の暗黙の前提を破る cross-boundary 違反は検出されなかった。

設計 Risk 節に記載された「managed + branch=null での `verifyFindingRefs` 全 non-existent 返却」は、escalation へのスタックとなるが最終出口（`awaiting-resume`）を変えない。これは同型リスク（#689）と同じ扱いであり、承認済みのトレードオフである。

- **verdict**: approved
